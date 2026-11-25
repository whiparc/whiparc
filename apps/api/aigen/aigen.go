// Package aigen holds the provider-independent half of AI mode: the Generator
// interface a model backend implements, and the validator that turns whatever
// the backend returned into a graph the canvas may safely show.
//
// The model's output is untrusted input. Nothing a Generator returns reaches a
// project except through Validate. See docs/plans/ai-mode-phase-1-design.md.
package aigen

import (
	"context"
	"encoding/json"
)

// GenerateRequest is what a provider receives. Schema is catalog.JSONSchema(),
// passed as the structured-output constraint. It is a request-side hint only:
// providers can ignore it, which is why the result is validated again.
type GenerateRequest struct {
	Prompt string
	Schema map[string]any
}

// Usage is recorded for every call, successful or not, so rate limiting and
// later billing have real numbers from the first day.
type Usage struct {
	InputTokens  int
	OutputTokens int
}

// Generator produces a raw, untrusted graph (JSON) for a prompt.
type Generator interface {
	Generate(ctx context.Context, req GenerateRequest) (json.RawMessage, Usage, error)
}
