package aigen

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	defaultGeminiBaseURL = "https://generativelanguage.googleapis.com"
	// DefaultGeminiModel is a small, inexpensive model for development and
	// evaluation runs. It is a default only: set AI_MODEL (or -model) to use another.
	DefaultGeminiModel = "gemini-3.5-flash-lite"

	defaultGeminiMaxTokens = 8192 // thinking tokens count against this limit on some models
)

// Gemini is a Generator backed by the Gemini API's generateContent method. Like
// Claude, it forces a single function call whose parameter schema is the catalog
// schema (translated to the subset Gemini accepts, see GeminiSchema), so the
// model's answer is a JSON document in the shape the validator expects. The
// schema constrains the request only; the output is validated again.
//
// generateContent is the API Google now labels legacy but supported. It is kept
// to this one file so moving to a newer Gemini API later touches nothing else.
type Gemini struct {
	APIKey    string
	Model     string
	BaseURL   string // empty means the public API; tests point this at a stub
	MaxTokens int
	Client    *http.Client
	// Retries is how many more times a call is repeated after a transient
	// failure (overload, brief outage, connection error). Zero means once.
	Retries int
}

// BuildGeminiBody returns the generateContent request body for a prompt: a
// system instruction, the prompt as the only user turn, one function declaration
// carrying the translated catalog schema, and a forced call to that function.
// It is exported so the evaluation tool's probe mode can vary one part at a time.
func BuildGeminiBody(prompt string, schema map[string]any, maxTokens int) map[string]any {
	if maxTokens <= 0 {
		maxTokens = defaultGeminiMaxTokens
	}
	return map[string]any{
		"systemInstruction": map[string]any{"parts": []any{map[string]any{"text": systemPrompt}}},
		"contents":          []any{map[string]any{"role": "user", "parts": []any{map[string]any{"text": prompt}}}},
		"tools": []any{map[string]any{"functionDeclarations": []any{map[string]any{
			"name":        toolName,
			"description": "Propose the infrastructure graph that satisfies the description.",
			"parameters":  GeminiSchema(schema),
		}}}},
		"toolConfig": map[string]any{"functionCallingConfig": map[string]any{
			"mode":                 "ANY",
			"allowedFunctionNames": []any{toolName},
		}},
		"generationConfig": map[string]any{"maxOutputTokens": maxTokens},
	}
}

func (g *Gemini) Generate(ctx context.Context, req GenerateRequest) (json.RawMessage, Usage, error) {
	body, err := json.Marshal(BuildGeminiBody(req.Prompt, req.Schema, g.MaxTokens))
	if err != nil {
		return nil, Usage{}, fmt.Errorf("encode request: %w", err)
	}
	raw, err := withRetry(ctx, g.Retries, func() ([]byte, error) { return g.send(ctx, body) })
	if err != nil {
		return nil, Usage{}, err
	}

	var parsed struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					FunctionCall *struct {
						Name string          `json:"name"`
						Args json.RawMessage `json:"args"`
					} `json:"functionCall"`
				} `json:"parts"`
			} `json:"content"`
			FinishReason string `json:"finishReason"`
		} `json:"candidates"`
		UsageMetadata struct {
			PromptTokenCount     int `json:"promptTokenCount"`
			CandidatesTokenCount int `json:"candidatesTokenCount"`
			ThoughtsTokenCount   int `json:"thoughtsTokenCount"`
		} `json:"usageMetadata"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, Usage{}, fmt.Errorf("%w: unreadable response", ErrProviderRejected)
	}
	// Thinking tokens are billed as output, so they are counted as output.
	usage := Usage{
		InputTokens:  parsed.UsageMetadata.PromptTokenCount,
		OutputTokens: parsed.UsageMetadata.CandidatesTokenCount + parsed.UsageMetadata.ThoughtsTokenCount,
	}

	// A prompt the API refuses to answer (safety, policy) comes back with no
	// candidates at all.
	if len(parsed.Candidates) == 0 {
		return nil, usage, ErrProviderNoResult
	}
	c := parsed.Candidates[0]
	if c.FinishReason == "MAX_TOKENS" {
		return nil, usage, ErrProviderTruncated
	}
	for _, part := range c.Content.Parts {
		if fc := part.FunctionCall; fc != nil && fc.Name == toolName && len(fc.Args) > 0 && string(fc.Args) != "null" {
			return fc.Args, usage, nil
		}
	}
	return nil, usage, ErrProviderNoResult
}

// Probe sends an arbitrary request body and reports only whether the API
// accepted it (HTTP 200). On refusal the error is an *APIError. It exists for
// the evaluation tool's probe mode, which finds out which part of a request a
// provider rejects.
func (g *Gemini) Probe(ctx context.Context, body map[string]any) error {
	b, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("encode request: %w", err)
	}
	_, err = g.send(ctx, b)
	return err
}

// send posts a request body to generateContent and returns the body of a 200
// response. Every failure is an error that names the status and, for an error
// response, the provider's error name; see APIError.
func (g *Gemini) send(ctx context.Context, body []byte) ([]byte, error) {
	model := strings.TrimPrefix(strings.TrimSpace(g.Model), "models/")
	if !modelNameOK(model) {
		// Never put an unchecked name in the request path.
		return nil, fmt.Errorf("%w: invalid model name", ErrProviderRejected)
	}
	base := strings.TrimRight(g.BaseURL, "/")
	if base == "" {
		base = defaultGeminiBaseURL
	}
	client := g.Client
	if client == nil {
		client = &http.Client{Timeout: 90 * time.Second}
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/v1beta/models/"+model+":generateContent", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	httpReq.Header.Set("content-type", "application/json")
	// In a header, not the ?key= query parameter, so the key is never part of a
	// URL that an error message, proxy log or trace could capture.
	httpReq.Header.Set("x-goog-api-key", g.APIKey)

	resp, err := client.Do(httpReq)
	if err != nil {
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
		return nil, newAPIError(ErrProviderRejected, resp.StatusCode, raw)
	}
	return raw, nil
}
