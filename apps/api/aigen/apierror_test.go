package aigen

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func TestAPIErrorKeepsTheMessageOutOfErrorText(t *testing.T) {
	body := []byte(`{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}`)
	e := newAPIError(ErrProviderRejected, 400, body)

	if e.Status != 400 || e.Name != "INVALID_ARGUMENT" || e.Message != "API key not valid. Please pass a valid API key." {
		t.Errorf("%+v", e)
	}
	if got, want := e.Error(), "the model provider rejected the request: status 400 (INVALID_ARGUMENT)"; got != want {
		t.Errorf("Error() = %q, want %q", got, want)
	}
	if strings.Contains(e.Error(), "API key") {
		t.Error("the provider message leaked into Error()")
	}
	if !errors.Is(e, ErrProviderRejected) || errors.Is(e, ErrProviderUnavailable) {
		t.Error("classification through Unwrap is wrong")
	}
	var as *APIError
	if !errors.As(error(e), &as) || as.Message == "" {
		t.Error("errors.As cannot recover the message")
	}
}

func TestAPIErrorShapes(t *testing.T) {
	cases := map[string]struct{ name, msg string }{
		`{"error":{"type":"authentication_error","message":"invalid x-api-key"}}`: {"authentication_error", "invalid x-api-key"},
		`{"error":{"status":"NOT_FOUND","message":"models/x is not found"}}`:      {"NOT_FOUND", "models/x is not found"},
		`not json at all`:          {"", ""},
		`{"error":{"message":42}}`: {"", ""},
		`{"error":{"status":"bad status!","message":"still shown"}}`: {"", "still shown"},
		``: {"", ""},
	}
	for body, want := range cases {
		e := newAPIError(ErrProviderRejected, 400, []byte(body))
		if e.Name != want.name || e.Message != want.msg {
			t.Errorf("%q: name=%q message=%q, want %q / %q", body, e.Name, e.Message, want.name, want.msg)
		}
	}
}

func TestAPIErrorMessageIsSanitisedAndBounded(t *testing.T) {
	// Escape sequences and other control characters must not reach a terminal.
	hostile := `{"error":{"message":"line one\nline two\u001b[31mred\u0007\u0000 tab\there\u009b"}}`
	got := errorMessage([]byte(hostile))
	if strings.ContainsAny(got, "\x1b\x07\x00\u009b") {
		t.Errorf("control characters survived: %q", got)
	}
	if !strings.Contains(got, "line one\nline two") || !strings.Contains(got, "tab\there") {
		t.Errorf("legitimate whitespace was lost: %q", got)
	}

	long := `{"error":{"message":"` + strings.Repeat("é", 5000) + `"}}`
	if r := []rune(errorMessage([]byte(long))); len(r) != maxProviderMessage+3 {
		t.Errorf("message not bounded: %d runes", len(r))
	}
}

// Both providers must return the structured error, so the evaluation tool can
// show the message without any provider-specific code.
func TestBothProvidersReturnAPIErrors(t *testing.T) {
	body := `{"error":{"type":"authentication_error","status":"UNAUTHENTICATED","message":"the real reason"}}`

	t.Run("claude", func(t *testing.T) {
		srv := (&stub{status: 401, body: body}).server(t)
		_, _, err := newClaude(srv).Generate(context.Background(), GenerateRequest{Prompt: "x"})
		var e *APIError
		if !errors.As(err, &e) || e.Status != 401 || e.Message != "the real reason" || !errors.Is(err, ErrProviderRejected) {
			t.Errorf("got %v", err)
		}
		if strings.Contains(err.Error(), "the real reason") {
			t.Error("leaked into Error()")
		}
	})

	t.Run("gemini", func(t *testing.T) {
		srv := (&geminiStub{status: 429, body: body}).server(t)
		_, _, err := newGemini(srv).Generate(context.Background(), GenerateRequest{Prompt: "x"})
		var e *APIError
		if !errors.As(err, &e) || e.Status != 429 || e.Message != "the real reason" || !errors.Is(err, ErrProviderUnavailable) {
			t.Errorf("got %v", err)
		}
		if strings.Contains(err.Error(), "the real reason") {
			t.Error("leaked into Error()")
		}
	})
}
