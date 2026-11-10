package aigen

import (
	"context"
	"errors"
	"log"
	"math/rand/v2"
	"time"
)

const (
	retryBaseDelay = 500 * time.Millisecond
	retryMaxJitter = 250 * time.Millisecond
)

// retrySleep waits for d or until ctx is done, in which case it returns the
// context's error. It is a variable so tests do not have to wait.
var retrySleep = func(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-t.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// transient reports whether a provider failure is worth repeating: the service
// was overloaded or briefly down (HTTP 500, 502, 503, 504, or Anthropic's 529),
// or the connection failed. Everything else is final:
//
//   - 429 is a quota or rate limit. Repeating it immediately cannot succeed and
//     spends the caller's own request budget; the evaluation tool backs off on it
//     instead.
//   - Other 4xx mean the request itself is wrong (bad key, bad model, bad schema).
//   - An answer that arrived but was cut off, empty or refused is the model's
//     result, not an outage.
func transient(err error) bool {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		switch apiErr.Status {
		case 500, 502, 503, 504, 529:
			return true
		}
		return false
	}
	return errors.Is(err, ErrProviderUnavailable)
}

// withRetry calls call, and repeats it up to retries more times while it fails
// with a transient provider error. The wait grows 500ms, 1s, 2s, ... with a
// little jitter so simultaneous requests do not retry in step. It stops at once
// when ctx is done, so the caller's overall timeout still bounds the whole
// operation, and returns the context's error if that happens while waiting.
//
// retries <= 0 calls once, which is the behaviour before retries existed.
// The log line carries only the error's status and name, never provider text.
func withRetry[T any](ctx context.Context, retries int, call func() (T, error)) (T, error) {
	for attempt := 0; ; attempt++ {
		v, err := call()
		if err == nil || attempt >= retries || ctx.Err() != nil || !transient(err) {
			return v, err
		}
		wait := retryBaseDelay<<attempt + rand.N(retryMaxJitter)
		log.Printf("[AI] transient provider error (%v); retry %d of %d in %s\n", err, attempt+1, retries, wait.Round(10*time.Millisecond))
		if werr := retrySleep(ctx, wait); werr != nil {
			var zero T
			return zero, werr
		}
	}
}
