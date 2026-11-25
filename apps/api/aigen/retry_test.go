package aigen

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

// noSleep replaces the real wait for a test and records what was asked for.
func noSleep(t *testing.T) *[]time.Duration {
	t.Helper()
	var waits []time.Duration
	orig := retrySleep
	retrySleep = func(ctx context.Context, d time.Duration) error {
		waits = append(waits, d)
		return ctx.Err()
	}
	t.Cleanup(func() { retrySleep = orig })
	return &waits
}

func unavailable(status int) error {
	return newAPIError(ErrProviderUnavailable, status, []byte(`{"error":{"status":"UNAVAILABLE"}}`))
}

func TestWithRetrySucceedsAfterTransientFailures(t *testing.T) {
	waits := noSleep(t)
	calls := 0
	got, err := withRetry(context.Background(), 2, func() (string, error) {
		calls++
		if calls < 3 {
			return "", unavailable(503)
		}
		return "ok", nil
	})
	if err != nil || got != "ok" || calls != 3 {
		t.Fatalf("got %q, %v after %d calls; want ok, nil, 3", got, err, calls)
	}
	if len(*waits) != 2 {
		t.Fatalf("expected 2 waits, got %v", *waits)
	}
	// 500ms then 1s, each with up to 250ms of jitter.
	for i, base := range []time.Duration{500 * time.Millisecond, time.Second} {
		if w := (*waits)[i]; w < base || w >= base+retryMaxJitter {
			t.Errorf("wait %d = %v, want [%v, %v)", i, w, base, base+retryMaxJitter)
		}
	}
}

func TestWithRetryGivesUpAndReturnsTheLastError(t *testing.T) {
	noSleep(t)
	calls := 0
	_, err := withRetry(context.Background(), 2, func() (string, error) {
		calls++
		return "", unavailable(503)
	})
	var apiErr *APIError
	if calls != 3 || !errors.As(err, &apiErr) || apiErr.Status != 503 || !errors.Is(err, ErrProviderUnavailable) {
		t.Fatalf("calls=%d err=%v; want 3 calls and the 503 error", calls, err)
	}
}

func TestWithRetryOnlyRepeatsTransientFailures(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want int // calls
	}{
		{"overloaded 503", unavailable(503), 3},
		{"internal error 500", unavailable(500), 3},
		{"bad gateway 502", unavailable(502), 3},
		{"gateway timeout 504", unavailable(504), 3},
		{"anthropic overloaded 529", unavailable(529), 3},
		{"connection failure", fmt.Errorf("%w: dial tcp: refused", ErrProviderUnavailable), 3},
		{"rate limited 429", unavailable(429), 1},
		{"bad request 400", newAPIError(ErrProviderRejected, 400, nil), 1},
		{"bad key 401", newAPIError(ErrProviderRejected, 401, nil), 1},
		{"cut off", ErrProviderTruncated, 1},
		{"no result", ErrProviderNoResult, 1},
		{"unrelated error", errors.New("encode request"), 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			noSleep(t)
			calls := 0
			_, err := withRetry(context.Background(), 2, func() (int, error) { calls++; return 0, tc.err })
			if calls != tc.want || !errors.Is(err, tc.err) {
				t.Errorf("calls = %d (want %d), err = %v", calls, tc.want, err)
			}
		})
	}
}

func TestWithRetryZeroRetriesCallsOnce(t *testing.T) {
	noSleep(t)
	calls := 0
	withRetry(context.Background(), 0, func() (int, error) { calls++; return 0, unavailable(503) })
	if calls != 1 {
		t.Fatalf("expected one call, got %d", calls)
	}
}

func TestWithRetryStopsWhenTheContextIsDone(t *testing.T) {
	// A wait that never notices the context, so only withRetry's own check can stop it.
	orig := retrySleep
	t.Cleanup(func() { retrySleep = orig })
	retrySleep = func(context.Context, time.Duration) error { return nil }

	ctx, cancel := context.WithCancel(context.Background())
	calls := 0
	_, err := withRetry(ctx, 5, func() (int, error) {
		calls++
		cancel() // the caller's overall timeout fires during the first attempt
		return 0, unavailable(503)
	})
	if calls != 1 || err == nil {
		t.Fatalf("calls=%d err=%v; want exactly one call and an error", calls, err)
	}
}

func TestRetrySleepReturnsWhenTheContextIsCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	start := time.Now()
	if err := retrySleep(ctx, time.Minute); !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want context.Canceled", err)
	}
	if time.Since(start) > time.Second {
		t.Fatal("retrySleep did not return promptly on a cancelled context")
	}
}

func TestWithRetryReportsTheContextErrorWhenCancelledWhileWaiting(t *testing.T) {
	orig := retrySleep
	t.Cleanup(func() { retrySleep = orig })
	retrySleep = func(ctx context.Context, d time.Duration) error { return context.DeadlineExceeded }

	_, err := withRetry(context.Background(), 2, func() (int, error) { return 0, unavailable(503) })
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("err = %v, want the deadline error so the endpoint can answer 504", err)
	}
}

// --- through the real providers, against a stub that fails first ---

// flakyServer answers 503 for the first failures requests, then 200 with ok.
func flakyServer(t *testing.T, failures int, ok string) (*httptest.Server, *atomic.Int32) {
	t.Helper()
	var n atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if int(n.Add(1)) <= failures {
			w.WriteHeader(http.StatusServiceUnavailable)
			fmt.Fprint(w, `{"error":{"code":503,"status":"UNAVAILABLE","message":"high demand"}}`)
			return
		}
		fmt.Fprint(w, ok)
	}))
	t.Cleanup(srv.Close)
	return srv, &n
}

var claudeOK = fmt.Sprintf(`{"content":[{"type":"tool_use","name":%q,"input":{"nodes":[{"ref":"a","type":"nginx"}],"edges":[]}}],"stop_reason":"tool_use","usage":{"input_tokens":10,"output_tokens":5}}`, toolName)

func TestGeminiRetriesAnOverloadedService(t *testing.T) {
	noSleep(t)
	srv, calls := flakyServer(t, 2, geminiOK)
	g := newGemini(srv)
	g.Retries = 2

	raw, usage, err := g.Generate(context.Background(), GenerateRequest{Prompt: "x", Schema: map[string]any{"type": "object"}})
	if err != nil || len(raw) == 0 {
		t.Fatalf("expected success after two 503s, got %v", err)
	}
	if calls.Load() != 3 {
		t.Errorf("requests = %d, want 3", calls.Load())
	}
	// Only the answer that arrived is billed; the failed attempts cost nothing.
	if usage.InputTokens != 321 || usage.OutputTokens != 75 {
		t.Errorf("usage = %+v, want the successful call's tokens only", usage)
	}
}

func TestGeminiWithoutRetriesFailsOnTheFirstOverload(t *testing.T) {
	srv, calls := flakyServer(t, 1, geminiOK)
	_, _, err := newGemini(srv).Generate(context.Background(), GenerateRequest{Prompt: "x", Schema: map[string]any{"type": "object"}})
	if !errors.Is(err, ErrProviderUnavailable) || calls.Load() != 1 {
		t.Fatalf("err=%v requests=%d; want one request and ErrProviderUnavailable", err, calls.Load())
	}
}

func TestClaudeRetriesAnOverloadedService(t *testing.T) {
	noSleep(t)
	srv, calls := flakyServer(t, 1, claudeOK)
	c := &Claude{APIKey: "k", Model: "m", BaseURL: srv.URL, Retries: 2}

	raw, usage, err := c.Generate(context.Background(), GenerateRequest{Prompt: "x", Schema: map[string]any{"type": "object"}})
	if err != nil || len(raw) == 0 {
		t.Fatalf("expected success after one 503, got %v", err)
	}
	if calls.Load() != 2 || usage.InputTokens != 10 || usage.OutputTokens != 5 {
		t.Errorf("requests=%d usage=%+v", calls.Load(), usage)
	}
}

func TestRetryDoesNotRepeatARejectedRequest(t *testing.T) {
	noSleep(t)
	var n atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n.Add(1)
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, `{"error":{"status":"INVALID_ARGUMENT"}}`)
	}))
	t.Cleanup(srv.Close)
	g := newGemini(srv)
	g.Retries = 3

	_, _, err := g.Generate(context.Background(), GenerateRequest{Prompt: "x", Schema: map[string]any{"type": "object"}})
	if !errors.Is(err, ErrProviderRejected) || n.Load() != 1 {
		t.Fatalf("err=%v requests=%d; a 400 must be sent once", err, n.Load())
	}
}
