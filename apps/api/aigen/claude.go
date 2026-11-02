package aigen

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	defaultClaudeBaseURL = "https://api.anthropic.com"
	anthropicVersion     = "2023-06-01"
	toolName             = "propose_infrastructure"

	// maxResponseBytes bounds what is read from the provider, so a misbehaving
	// upstream cannot make the server buffer an unbounded body.
	maxResponseBytes = 1 << 20
)

// Errors returned by providers. They carry no provider response text, so they
// are safe to log and to map to a generic client message.
var (
	ErrProviderUnavailable = errors.New("the model provider is unavailable")
	ErrProviderRejected    = errors.New("the model provider rejected the request")
	ErrProviderTruncated   = errors.New("the model's answer was cut off")
	ErrProviderNoResult    = errors.New("the model did not return a graph")
)

// systemPrompt frames the task. The user's text arrives as the only user
// message and is data to translate, not instructions that can widen what the
// tool accepts: the tool schema and the validator behind it are what enforce
// the limits, not this text.
const systemPrompt = `You turn a plain-language description of infrastructure into a small graph of building blocks, by calling the propose_infrastructure tool exactly once.

Rules:
- Use only the node types the tool offers. Do not invent types, parameters or fields.
- Prefer few nodes. Use a node only when the description needs it.
- Give each node a short unique "ref" (letters, digits, underscore). Use refs in "edges" to connect nodes.
- Connect a VPC to its subnets and security groups, subnets and security groups to the virtual machine, and the virtual machine to the configuration tasks that should run on it. Chain configuration tasks in the order they should run.
- Leave a parameter out unless the description asks for a specific value; defaults are applied for you.
- Never put credentials, passwords, keys, commands or scripts in any field. They cannot be set here.
- If the description cannot be expressed with the offered node types, return the closest small graph that can.`

// Claude is a Generator backed by the Anthropic Messages API. It forces a
// single tool call whose input schema is the catalog schema, which makes the
// model's answer a JSON document in the shape the validator expects. The
// schema is a request-side constraint only; the output is validated again.
type Claude struct {
	APIKey    string
	Model     string
	BaseURL   string // empty means the public API; tests point this at a stub
	MaxTokens int
	Client    *http.Client
}

func (c *Claude) Generate(ctx context.Context, req GenerateRequest) (json.RawMessage, Usage, error) {
	base := strings.TrimRight(c.BaseURL, "/")
	if base == "" {
		base = defaultClaudeBaseURL
	}
	client := c.Client
	if client == nil {
		client = &http.Client{Timeout: 90 * time.Second}
	}
	maxTokens := c.MaxTokens
	if maxTokens <= 0 {
		maxTokens = 4096
	}

	body, err := json.Marshal(map[string]any{
		"model":      c.Model,
		"max_tokens": maxTokens,
		"system":     systemPrompt,
		"messages":   []map[string]any{{"role": "user", "content": req.Prompt}},
		"tools": []map[string]any{{
			"name":         toolName,
			"description":  "Propose the infrastructure graph that satisfies the description.",
			"input_schema": req.Schema,
		}},
		"tool_choice": map[string]any{"type": "tool", "name": toolName},
	})
	if err != nil {
		return nil, Usage{}, fmt.Errorf("encode request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/v1/messages", bytes.NewReader(body))
	if err != nil {
		return nil, Usage{}, fmt.Errorf("build request: %w", err)
	}
	httpReq.Header.Set("content-type", "application/json")
	httpReq.Header.Set("x-api-key", c.APIKey)
	httpReq.Header.Set("anthropic-version", anthropicVersion)

	resp, err := client.Do(httpReq)
	if err != nil {
		// err can embed the request URL but never the API key, which is only in a header.
		return nil, Usage{}, fmt.Errorf("%w: %w", ErrProviderUnavailable, err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
	if err != nil {
		return nil, Usage{}, fmt.Errorf("%w: reading response", ErrProviderUnavailable)
	}

	switch {
	case resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500:
		return nil, Usage{}, fmt.Errorf("%w: status %d", ErrProviderUnavailable, resp.StatusCode)
	case resp.StatusCode != http.StatusOK:
		// 4xx other than 429 is our request being wrong (bad key, bad model, bad
		// schema). The body is not surfaced: it may echo request content.
		return nil, Usage{}, fmt.Errorf("%w: status %d", ErrProviderRejected, resp.StatusCode)
	}

	var parsed struct {
		Content []struct {
			Type  string          `json:"type"`
			Name  string          `json:"name"`
			Input json.RawMessage `json:"input"`
		} `json:"content"`
		StopReason string `json:"stop_reason"`
		Usage      struct {
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, Usage{}, fmt.Errorf("%w: unreadable response", ErrProviderRejected)
	}
	usage := Usage{InputTokens: parsed.Usage.InputTokens, OutputTokens: parsed.Usage.OutputTokens}

	if parsed.StopReason == "max_tokens" {
		return nil, usage, ErrProviderTruncated
	}
	for _, block := range parsed.Content {
		if block.Type == "tool_use" && block.Name == toolName && len(block.Input) > 0 {
			return block.Input, usage, nil
		}
	}
	return nil, usage, ErrProviderNoResult
}
