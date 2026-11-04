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
}

func (g *Gemini) Generate(ctx context.Context, req GenerateRequest) (json.RawMessage, Usage, error) {
	model := strings.TrimPrefix(strings.TrimSpace(g.Model), "models/")
	if !modelNameOK(model) {
		// Never put an unchecked name in the request path.
		return nil, Usage{}, fmt.Errorf("%w: invalid model name", ErrProviderRejected)
	}
	base := strings.TrimRight(g.BaseURL, "/")
	if base == "" {
		base = defaultGeminiBaseURL
	}
	client := g.Client
	if client == nil {
		client = &http.Client{Timeout: 90 * time.Second}
	}
	maxTokens := g.MaxTokens
	if maxTokens <= 0 {
		maxTokens = 8192 // thinking tokens count against this limit on some models
	}

	body, err := json.Marshal(map[string]any{
		"systemInstruction": map[string]any{"parts": []map[string]any{{"text": systemPrompt}}},
		"contents":          []map[string]any{{"role": "user", "parts": []map[string]any{{"text": req.Prompt}}}},
		"tools": []map[string]any{{"functionDeclarations": []map[string]any{{
			"name":        toolName,
			"description": "Propose the infrastructure graph that satisfies the description.",
			"parameters":  GeminiSchema(req.Schema),
		}}}},
		"toolConfig": map[string]any{"functionCallingConfig": map[string]any{
			"mode":                 "ANY",
			"allowedFunctionNames": []string{toolName},
		}},
		"generationConfig": map[string]any{"maxOutputTokens": maxTokens},
	})
	if err != nil {
		return nil, Usage{}, fmt.Errorf("encode request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/v1beta/models/"+model+":generateContent", bytes.NewReader(body))
	if err != nil {
		return nil, Usage{}, fmt.Errorf("build request: %w", err)
	}
	httpReq.Header.Set("content-type", "application/json")
	// In a header, not the ?key= query parameter, so the key is never part of a
	// URL that an error message, proxy log or trace could capture.
	httpReq.Header.Set("x-goog-api-key", g.APIKey)

	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, Usage{}, fmt.Errorf("%w: %w", ErrProviderUnavailable, err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
	if err != nil {
		return nil, Usage{}, fmt.Errorf("%w: reading response", ErrProviderUnavailable)
	}

	switch {
	case resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500:
		return nil, Usage{}, fmt.Errorf("%w: status %d%s", ErrProviderUnavailable, resp.StatusCode, errorType(raw))
	case resp.StatusCode != http.StatusOK:
		return nil, Usage{}, fmt.Errorf("%w: status %d%s", ErrProviderRejected, resp.StatusCode, errorType(raw))
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
