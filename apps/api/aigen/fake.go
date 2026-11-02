package aigen

import (
	"context"
	"encoding/json"
	"sync"
)

// FakeGenerator is a deterministic Generator for tests. CI never calls a
// network; endpoint tests and validator tests feed it canned (often hostile)
// output.
type FakeGenerator struct {
	Output json.RawMessage
	Usage  Usage
	Err    error

	mu       sync.Mutex
	requests []GenerateRequest
}

func (f *FakeGenerator) Generate(_ context.Context, req GenerateRequest) (json.RawMessage, Usage, error) {
	f.mu.Lock()
	f.requests = append(f.requests, req)
	f.mu.Unlock()
	if f.Err != nil {
		return nil, f.Usage, f.Err
	}
	return f.Output, f.Usage, nil
}

// Requests returns the requests received so far, so a test can assert what was
// (and was not) sent to the model.
func (f *FakeGenerator) Requests() []GenerateRequest {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]GenerateRequest(nil), f.requests...)
}
