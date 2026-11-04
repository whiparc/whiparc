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

// geminiStub stands in for the Gemini API and records what it received.
type geminiStub struct {
	status int
	body   string
	delay  time.Duration

	gotPath, gotRawQuery, gotKeyHeader string
	gotBody                            map[string]any
}

func (s *geminiStub) server(t *testing.T) *httptest.Server {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.gotPath, s.gotRawQuery = r.URL.Path, r.URL.RawQuery
		s.gotKeyHeader = r.Header.Get("x-goog-api-key")
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

const geminiOK = `{
 "candidates":[{"content":{"role":"model","parts":[
    {"functionCall":{"name":"propose_infrastructure","args":{"nodes":[{"ref":"a","type":"nginx"}],"edges":[]}}}]},
   "finishReason":"STOP"}],
 "usageMetadata":{"promptTokenCount":321,"candidatesTokenCount":45,"thoughtsTokenCount":30,"totalTokenCount":396}}`

func newGemini(srv *httptest.Server) *Gemini {
	return &Gemini{APIKey: "AIza-test-key", Model: "gemini-test", BaseURL: srv.URL, MaxTokens: 1234}
}

func TestGeminiSendsForcedFunctionCallWithTranslatedSchema(t *testing.T) {
	s := &geminiStub{status: 200, body: geminiOK}
	srv := s.server(t)

	out, usage, err := newGemini(srv).Generate(context.Background(), GenerateRequest{Prompt: "a web server", Schema: catalog.JSONSchema()})
	if err != nil {
		t.Fatal(err)
	}
	if usage.InputTokens != 321 || usage.OutputTokens != 75 {
		t.Errorf("usage = %+v, want 321 in and 45+30 (answer plus thinking) out", usage)
	}
	if _, err := Validate(out); err != nil {
		t.Errorf("returned graph does not validate: %v (%s)", err, out)
	}

	if s.gotPath != "/v1beta/models/gemini-test:generateContent" {
		t.Errorf("path = %q", s.gotPath)
	}
	if s.gotKeyHeader != "AIza-test-key" {
		t.Errorf("key header = %q", s.gotKeyHeader)
	}
	if s.gotRawQuery != "" {
		t.Errorf("the key (or anything else) must not travel in the URL: %q", s.gotRawQuery)
	}

	b := s.gotBody
	if b["generationConfig"].(map[string]any)["maxOutputTokens"].(float64) != 1234 {
		t.Errorf("maxOutputTokens not applied: %v", b["generationConfig"])
	}
	fc := b["toolConfig"].(map[string]any)["functionCallingConfig"].(map[string]any)
	if fc["mode"] != "ANY" || len(fc["allowedFunctionNames"].([]any)) != 1 || fc["allowedFunctionNames"].([]any)[0] != "propose_infrastructure" {
		t.Errorf("function call is not forced: %v", fc)
	}
	decls := b["tools"].([]any)[0].(map[string]any)["functionDeclarations"].([]any)
	if len(decls) != 1 {
		t.Fatalf("want one declaration, got %d", len(decls))
	}
	params, _ := json.Marshal(decls[0].(map[string]any)["parameters"])
	want, _ := json.Marshal(GeminiSchema(catalog.JSONSchema()))
	if string(params) != string(want) {
		t.Error("declared parameters are not the translated catalog schema")
	}
	if _, raw := decls[0].(map[string]any)["parametersJsonSchema"]; raw {
		t.Error("parameters and parametersJsonSchema are mutually exclusive")
	}

	contents := b["contents"].([]any)
	if len(contents) != 1 {
		t.Fatalf("the prompt must be the only user turn: %v", contents)
	}
	turn := contents[0].(map[string]any)
	if turn["role"] != "user" || turn["parts"].([]any)[0].(map[string]any)["text"] != "a web server" {
		t.Errorf("unexpected turn: %v", turn)
	}
	sys := b["systemInstruction"].(map[string]any)["parts"].([]any)[0].(map[string]any)["text"].(string)
	if !strings.Contains(sys, "propose_infrastructure") || strings.Contains(sys, "a web server") {
		t.Error("system instruction missing the task, or the prompt leaked into it")
	}
}

func TestGeminiNormalisesTheModelName(t *testing.T) {
	s := &geminiStub{status: 200, body: geminiOK}
	srv := s.server(t)
	g := newGemini(srv)
	g.Model = "models/gemini-test"
	if _, _, err := g.Generate(context.Background(), GenerateRequest{Prompt: "x", Schema: map[string]any{}}); err != nil {
		t.Fatal(err)
	}
	if s.gotPath != "/v1beta/models/gemini-test:generateContent" {
		t.Errorf("path = %q", s.gotPath)
	}
}

func TestGeminiRefusesModelNamesThatCouldChangeThePath(t *testing.T) {
	s := &geminiStub{status: 200, body: geminiOK}
	srv := s.server(t)
	for _, model := range []string{"", "../v1/models/other", "a/b", "a?key=x", "x:streamGenerateContent", "a b"} {
		g := newGemini(srv)
		g.Model = model
		_, _, err := g.Generate(context.Background(), GenerateRequest{Prompt: "x"})
		if !errors.Is(err, ErrProviderRejected) {
			t.Errorf("model %q: got %v", model, err)
		}
	}
	if s.gotPath != "" {
		t.Errorf("a request was sent for an invalid model name: %q", s.gotPath)
	}
}

func TestGeminiErrorsAreClassifiedAndDoNotLeakProviderText(t *testing.T) {
	errBody := func(code int, status string) string {
		return `{"error":{"code":` + string(rune('0'+code/100)) + `00,"message":"LEAK: key AIza-SECRET model gemini-test","status":"` + status + `"}}`
	}
	cases := []struct {
		name   string
		status int
		body   string
		want   error
		suffix string
	}{
		{"bad request", 400, errBody(400, "INVALID_ARGUMENT"), ErrProviderRejected, "status 400 (INVALID_ARGUMENT)"},
		{"bad key", 403, errBody(403, "PERMISSION_DENIED"), ErrProviderRejected, "status 403 (PERMISSION_DENIED)"},
		{"unknown model", 404, errBody(404, "NOT_FOUND"), ErrProviderRejected, "status 404 (NOT_FOUND)"},
		{"free tier not available", 400, errBody(400, "FAILED_PRECONDITION"), ErrProviderRejected, "status 400 (FAILED_PRECONDITION)"},
		{"quota", 429, errBody(429, "RESOURCE_EXHAUSTED"), ErrProviderUnavailable, "status 429 (RESOURCE_EXHAUSTED)"},
		{"server error", 500, errBody(500, "INTERNAL"), ErrProviderUnavailable, "status 500 (INTERNAL)"},
		{"overloaded", 503, errBody(503, "UNAVAILABLE"), ErrProviderUnavailable, "status 503 (UNAVAILABLE)"},
		{"not json", 400, "LEAK plain text", ErrProviderRejected, "status 400"},
		{"hostile status", 400, `{"error":{"status":"x\"; rm -rf /","message":"LEAK"}}`, ErrProviderRejected, "status 400"},
		{"unreadable success body", 200, "LEAK not json", ErrProviderRejected, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			srv := (&geminiStub{status: c.status, body: c.body}).server(t)
			out, _, err := newGemini(srv).Generate(context.Background(), GenerateRequest{Prompt: "x", Schema: map[string]any{}})
			if out != nil || !errors.Is(err, c.want) {
				t.Fatalf("got (%s, %v), want %v", out, err, c.want)
			}
			if c.suffix != "" && !strings.HasSuffix(err.Error(), c.suffix) {
				t.Errorf("error %q does not end with %q", err.Error(), c.suffix)
			}
			for _, leak := range []string{"LEAK", "SECRET", "AIza", "rm -rf"} {
				if strings.Contains(err.Error(), leak) {
					t.Errorf("error leaks %q: %v", leak, err)
				}
			}
		})
	}
}

func TestGeminiUnusableAnswers(t *testing.T) {
	call := func(name, args string) string {
		return `{"candidates":[{"content":{"parts":[{"functionCall":{"name":"` + name + `","args":` + args + `}}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5}}`
	}
	cases := []struct {
		name string
		body string
		want error
	}{
		{"no candidates (prompt refused)", `{"promptFeedback":{"blockReason":"SAFETY"},"usageMetadata":{"promptTokenCount":10}}`, ErrProviderNoResult},
		{"empty candidate list", `{"candidates":[]}`, ErrProviderNoResult},
		{"text instead of a call", `{"candidates":[{"content":{"parts":[{"text":"I cannot do that"}]},"finishReason":"STOP"}]}`, ErrProviderNoResult},
		{"malformed function call", `{"candidates":[{"finishReason":"MALFORMED_FUNCTION_CALL"}]}`, ErrProviderNoResult},
		{"unexpected tool", `{"candidates":[{"finishReason":"UNEXPECTED_TOOL_CALL"}]}`, ErrProviderNoResult},
		{"wrong function", call("other_tool", `{"a":1}`), ErrProviderNoResult},
		{"null args", call("propose_infrastructure", `null`), ErrProviderNoResult},
		{"no content at all", `{"candidates":[{"finishReason":"STOP"}]}`, ErrProviderNoResult},
		{"truncated", `{"candidates":[{"content":{"parts":[]},"finishReason":"MAX_TOKENS"}],"usageMetadata":{"promptTokenCount":9,"candidatesTokenCount":4000,"thoughtsTokenCount":96}}`, ErrProviderTruncated},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			srv := (&geminiStub{status: 200, body: c.body}).server(t)
			out, _, err := newGemini(srv).Generate(context.Background(), GenerateRequest{Prompt: "x"})
			if out != nil || !errors.Is(err, c.want) {
				t.Errorf("got (%s, %v), want %v", out, err, c.want)
			}
		})
	}

	t.Run("tokens spent on a truncated answer are still reported", func(t *testing.T) {
		srv := (&geminiStub{status: 200, body: cases[len(cases)-1].body}).server(t)
		_, usage, _ := newGemini(srv).Generate(context.Background(), GenerateRequest{Prompt: "x"})
		if usage.InputTokens != 9 || usage.OutputTokens != 4096 {
			t.Errorf("usage = %+v", usage)
		}
	})

	t.Run("the call is found among several parts", func(t *testing.T) {
		body := `{"candidates":[{"content":{"parts":[{"text":"thinking"},{"functionCall":{"name":"propose_infrastructure","args":{"nodes":[{"ref":"a","type":"nginx"}],"edges":[]}}}]},"finishReason":"STOP"}]}`
		srv := (&geminiStub{status: 200, body: body}).server(t)
		out, _, err := newGemini(srv).Generate(context.Background(), GenerateRequest{Prompt: "x"})
		if err != nil {
			t.Fatal(err)
		}
		if _, err := Validate(out); err != nil {
			t.Errorf("args do not validate: %v", err)
		}
	})
}

func TestGeminiHonoursContextAndBoundsTheResponse(t *testing.T) {
	t.Run("deadline", func(t *testing.T) {
		srv := (&geminiStub{status: 200, body: geminiOK, delay: 2 * time.Second}).server(t)
		ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
		defer cancel()
		start := time.Now()
		_, _, err := newGemini(srv).Generate(ctx, GenerateRequest{Prompt: "x"})
		if !errors.Is(err, ErrProviderUnavailable) || !errors.Is(err, context.DeadlineExceeded) {
			t.Errorf("got %v; the deadline must stay detectable", err)
		}
		if time.Since(start) > time.Second {
			t.Error("did not stop at the deadline")
		}
	})

	t.Run("oversized response", func(t *testing.T) {
		huge := `{"candidates":[{"content":{"parts":[{"functionCall":{"name":"propose_infrastructure","args":{"x":"` + strings.Repeat("a", maxResponseBytes) + `"}}}]}}]}`
		srv := (&geminiStub{status: 200, body: huge}).server(t)
		if _, _, err := newGemini(srv).Generate(context.Background(), GenerateRequest{Prompt: "x"}); err == nil {
			t.Error("an oversized response was accepted")
		}
	})

	t.Run("unreachable, with the key kept out of the error", func(t *testing.T) {
		srv := httptest.NewServer(http.NotFoundHandler())
		url := srv.URL
		srv.Close()
		g := &Gemini{APIKey: "AIza-test-key", Model: "m", BaseURL: url}
		_, _, err := g.Generate(context.Background(), GenerateRequest{Prompt: "x"})
		if !errors.Is(err, ErrProviderUnavailable) || strings.Contains(err.Error(), "AIza-test-key") {
			t.Errorf("got %v", err)
		}
	})
}

// Both providers must satisfy the same interface the endpoint and the
// evaluation tool depend on.
var (
	_ Generator = (*Gemini)(nil)
	_ Generator = (*Claude)(nil)
)
