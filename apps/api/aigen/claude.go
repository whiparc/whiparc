package aigen

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
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
	// Retries is how many more times a call is repeated after a transient
	// failure (overload, brief outage, connection error). Zero means once.
	Retries int
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

	raw, err := withRetry(ctx, c.Retries, func() ([]byte, error) { return c.post(ctx, client, base, body) })
	if err != nil {
		return nil, Usage{}, err
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

// post sends one Messages API request and returns the body of a 200 response.
// Every failure is an error that names the status and, for an error response,
// the provider's error name; see APIError.
func (c *Claude) post(ctx context.Context, client *http.Client, base string, body []byte) ([]byte, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/v1/messages", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	httpReq.Header.Set("content-type", "application/json")
	httpReq.Header.Set("x-api-key", c.APIKey)
	httpReq.Header.Set("anthropic-version", anthropicVersion)

	resp, err := client.Do(httpReq)
	if err != nil {
		// err can embed the request URL but never the API key, which is only in a header.
		return nil, fmt.Errorf("%w: %w", ErrProviderUnavailable, err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
	if err != nil {
		return nil, fmt.Errorf("%w: reading response", ErrProviderUnavailable)
	}

	switch {
	case resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500:
		return nil, newAPIError(ErrProviderUnavailable, resp.StatusCode, raw)
	case resp.StatusCode != http.StatusOK:
		// 4xx other than 429 is our request being wrong (bad key, bad model, bad
		// schema) or the account being unable to pay for it. The message is not
		// surfaced: it may echo request content. The error type is.
		return nil, newAPIError(ErrProviderRejected, resp.StatusCode, raw)
	}
	return raw, nil
}

// errorTypePattern admits only the short words the providers use to name an
// error: Anthropic's snake_case types (authentication_error, not_found_error) and
// Google's upper-case statuses (INVALID_ARGUMENT, RESOURCE_EXHAUSTED).
var errorTypePattern = regexp.MustCompile(`^[A-Za-z][A-Za-z_]{0,39}$`)

// errorType extracts the error's name from a provider error body, formatted for
// appending to an error message (" (authentication_error)"), or "" when the
// body is not that shape. It reads Anthropic's error.type or Google's
// error.status. Only that name is read: the accompanying message is free text
// that can echo request content, so it is never surfaced. The name is
// validated, so a hostile or garbled body cannot inject anything.
func errorType(body []byte) string {
	var e struct {
		Error struct {
			Type   string `json:"type"`
			Status string `json:"status"`
		} `json:"error"`
	}
	if json.Unmarshal(body, &e) != nil {
		return ""
	}
	for _, name := range []string{e.Error.Type, e.Error.Status} {
		if errorTypePattern.MatchString(name) {
			return " (" + name + ")"
		}
	}
	return ""
}
