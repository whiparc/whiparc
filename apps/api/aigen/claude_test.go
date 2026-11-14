package aigen

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"api/catalog"
)

// stub stands in for the Anthropic API. It records the request it received.
type stub struct {
	status int
	body   string
	delay  time.Duration

	gotPath   string
	gotKey    string
	gotVer    string
	gotBody   map[string]any
	callCount int
}

func (s *stub) server(t *testing.T) *httptest.Server {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.callCount++
		s.gotPath = r.URL.Path
		s.gotKey = r.Header.Get("x-api-key")
		s.gotVer = r.Header.Get("anthropic-version")
		raw, _ := io.ReadAll(r.Body)
		json.Unmarshal(raw, &s.gotBody)
		if s.delay > 0 {
			select {
			case <-time.After(s.delay):
			case <-r.Context().Done():
				return
			}
		}
		w.WriteHeader(s.status)
		io.WriteString(w, s.body)
	}))
	t.Cleanup(srv.Close)
	return srv
}

const toolResponse = `{
 "content":[{"type":"text","text":"ok"},
            {"type":"tool_use","id":"tu_1","name":"propose_infrastructure","input":{"nodes":[{"ref":"a","type":"nginx"}],"edges":[]}}],
 "stop_reason":"tool_use",
 "usage":{"input_tokens":321,"output_tokens":45}}`

func newClaude(srv *httptest.Server) *Claude {
	return &Claude{APIKey: "sk-ant-test-key", Model: "test-model", BaseURL: srv.URL, MaxTokens: 1234}
}

func TestClaudeSendsForcedToolCallWithCatalogSchema(t *testing.T) {
	s := &stub{status: 200, body: toolResponse}
	srv := s.server(t)

	out, usage, err := newClaude(srv).Generate(context.Background(),
		GenerateRequest{Prompt: "a web server", Schema: catalog.JSONSchema()})
	if err != nil {
		t.Fatal(err)
	}
	if usage.InputTokens != 321 || usage.OutputTokens != 45 {
		t.Errorf("usage = %+v", usage)
	}
	if _, err := Validate(out); err != nil {
		t.Errorf("returned graph does not validate: %v (%s)", err, out)
	}

	if s.gotPath != "/v1/messages" || s.gotKey != "sk-ant-test-key" || s.gotVer == "" {
		t.Errorf("bad request line/headers: path=%q key=%q version=%q", s.gotPath, s.gotKey, s.gotVer)
	}
	b := s.gotBody
	if b["model"] != "test-model" || b["max_tokens"].(float64) != 1234 {
		t.Errorf("model/max_tokens not applied: %v %v", b["model"], b["max_tokens"])
	}
	tc := b["tool_choice"].(map[string]any)
	if tc["type"] != "tool" || tc["name"] != "propose_infrastructure" {
		t.Errorf("tool call is not forced: %v", tc)
	}
	tools := b["tools"].([]any)
	if len(tools) != 1 {
		t.Fatalf("expected exactly one tool, got %d", len(tools))
	}
	schema, _ := json.Marshal(tools[0].(map[string]any)["input_schema"])
	want, _ := json.Marshal(catalog.JSONSchema())
	if string(schema) != string(want) {
		t.Error("tool input_schema is not the catalog schema")
	}
	msgs := b["messages"].([]any)
	if len(msgs) != 1 || msgs[0].(map[string]any)["content"] != "a web server" {
		t.Errorf("the prompt must be the only user message: %v", msgs)
	}
	// The user's text must not be spliced into the system prompt.
	if strings.Contains(b["system"].(string), "a web server") {
		t.Error("prompt leaked into the system prompt")
	}
}

func TestClaudeErrorsAreClassifiedAndDoNotLeakProviderText(t *testing.T) {
	const leak = "INTERNAL-DETAIL-sk-ant-leak"
	cases := []struct {
		name   string
		status int
		body   string
		want   error
	}{
		{"rate limited", 429, leak, ErrProviderUnavailable},
		{"server error", 500, leak, ErrProviderUnavailable},
		{"overloaded", 529, leak, ErrProviderUnavailable},
		{"bad key", 401, leak, ErrProviderRejected},
		{"bad request", 400, leak, ErrProviderRejected},
		{"not json", 200, leak, ErrProviderRejected},
		{"truncated", 200, `{"content":[],"stop_reason":"max_tokens","usage":{"input_tokens":9,"output_tokens":4096}}`, ErrProviderTruncated},
		{"no tool call", 200, `{"content":[{"type":"text","text":"I cannot"}],"stop_reason":"end_turn"}`, ErrProviderNoResult},
		{"wrong tool", 200, `{"content":[{"type":"tool_use","name":"other","input":{"a":1}}],"stop_reason":"tool_use"}`, ErrProviderNoResult},
		{"empty tool input", 200, `{"content":[{"type":"tool_use","name":"propose_infrastructure"}],"stop_reason":"tool_use"}`, ErrProviderNoResult},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			srv := (&stub{status: c.status, body: c.body}).server(t)
			out, _, err := newClaude(srv).Generate(context.Background(), GenerateRequest{Prompt: "x", Schema: map[string]any{}})
			if out != nil || !errors.Is(err, c.want) {
				t.Errorf("got (%s, %v), want %v", out, err, c.want)
			}
			if err != nil && strings.Contains(err.Error(), "INTERNAL-DETAIL") {
				t.Errorf("provider response text leaked into the error: %v", err)
			}
		})
	}

	t.Run("truncation still reports usage", func(t *testing.T) {
		srv := (&stub{status: 200, body: `{"content":[],"stop_reason":"max_tokens","usage":{"input_tokens":9,"output_tokens":4096}}`}).server(t)
		_, usage, _ := newClaude(srv).Generate(context.Background(), GenerateRequest{Prompt: "x"})
		if usage.OutputTokens != 4096 {
			t.Errorf("tokens spent on a truncated answer were not reported: %+v", usage)
		}
	})
}

func TestClaudeHonoursContext(t *testing.T) {
	srv := (&stub{status: 200, body: toolResponse, delay: 2 * time.Second}).server(t)
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	start := time.Now()
	_, _, err := newClaude(srv).Generate(ctx, GenerateRequest{Prompt: "x"})
	if err == nil || !errors.Is(err, ErrProviderUnavailable) {
		t.Errorf("expected ErrProviderUnavailable, got %v", err)
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		// The endpoint maps deadline errors to a 504, so it must stay detectable.
		t.Errorf("the deadline is not detectable through the error chain: %v", err)
	}
	if time.Since(start) > time.Second {
		t.Error("the call did not stop at the context deadline")
	}
}

func TestClaudeBoundsTheResponseItReads(t *testing.T) {
	huge := `{"content":[{"type":"tool_use","name":"propose_infrastructure","input":{"x":"` + strings.Repeat("a", maxResponseBytes) + `"}}]}`
	srv := (&stub{status: 200, body: huge}).server(t)
	_, _, err := newClaude(srv).Generate(context.Background(), GenerateRequest{Prompt: "x"})
	if err == nil {
		t.Error("an oversized provider response was accepted")
	}
}

func TestClaudeUnreachableProvider(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	url := srv.URL
	srv.Close()
	c := &Claude{APIKey: "sk-ant-test-key", Model: "m", BaseURL: url}
	_, _, err := c.Generate(context.Background(), GenerateRequest{Prompt: "x"})
	if !errors.Is(err, ErrProviderUnavailable) {
		t.Errorf("got %v", err)
	}
	if strings.Contains(err.Error(), "sk-ant-test-key") {
		t.Error("API key appears in the error")
	}
}

func TestClaudeErrorShowsStatusAndTypeButNeverTheMessage(t *testing.T) {
	cases := []struct {
		name, body string
		status     int
		want       string
		wantErr    error
	}{
		{"bad key", `{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key sk-ant-LEAK"}}`, 401, "status 401 (authentication_error)", ErrProviderRejected},
		{"bad model", `{"error":{"type":"not_found_error","message":"model: LEAK"}}`, 404, "status 404 (not_found_error)", ErrProviderRejected},
		{"no credit", `{"error":{"type":"invalid_request_error","message":"Your credit balance is too low. LEAK"}}`, 400, "status 400 (invalid_request_error)", ErrProviderRejected},
		{"overloaded", `{"error":{"type":"overloaded_error","message":"LEAK"}}`, 529, "status 529 (overloaded_error)", ErrProviderUnavailable},
		{"not the expected shape", `plain text LEAK`, 400, "status 400", ErrProviderRejected},
		{"type is not a word", `{"error":{"type":"x\"; rm -rf /","message":"LEAK"}}`, 400, "status 400", ErrProviderRejected},
		{"type too long", `{"error":{"type":"` + strings.Repeat("a", 60) + `"}}`, 400, "status 400", ErrProviderRejected},
		{"type is not a string", `{"error":{"type":{"a":1}}}`, 400, "status 400", ErrProviderRejected},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			srv := (&stub{status: c.status, body: c.body}).server(t)
			_, _, err := newClaude(srv).Generate(context.Background(), GenerateRequest{Prompt: "x"})
			if !errors.Is(err, c.wantErr) {
				t.Fatalf("got %v, want %v", err, c.wantErr)
			}
			if !strings.HasSuffix(err.Error(), c.want) {
				t.Errorf("error %q does not end with %q", err.Error(), c.want)
			}
			for _, leak := range []string{"LEAK", "rm -rf", "aaaaaaaa"} {
				if strings.Contains(err.Error(), leak) {
					t.Errorf("error leaks %q: %v", leak, err)
				}
			}
		})
	}
}
