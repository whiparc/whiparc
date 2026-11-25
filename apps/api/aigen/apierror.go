package aigen

import (
	"encoding/json"
	"fmt"
	"strings"
)

// maxProviderMessage bounds the provider message kept on an APIError.
const maxProviderMessage = 1500

// APIError is a failed response from a provider. It splits what is safe to show
// from what is not:
//
//   - Error() carries only the HTTP status and the provider's error name
//     ("status 400 (INVALID_ARGUMENT)"). This is what gets logged, recorded and
//     returned to clients.
//   - Message is the provider's own explanation. It is free text that can echo
//     request content, so nothing in the server reads it. It exists so a developer
//     running the evaluation tool can ask to see it on their own terminal
//     (aieval -show-error), which is the only reader.
//
// errors.Is(err, ErrProviderRejected) and errors.Is(err, ErrProviderUnavailable)
// work through Unwrap, so classification is unchanged.
type APIError struct {
	Kind    error // ErrProviderUnavailable or ErrProviderRejected
	Status  int
	Name    string // validated provider error name, or ""
	Message string // sanitised and bounded; see above
}

func (e *APIError) Error() string {
	suffix := ""
	if e.Name != "" {
		suffix = " (" + e.Name + ")"
	}
	return fmt.Sprintf("%v: status %d%s", e.Kind, e.Status, suffix)
}

func (e *APIError) Unwrap() error { return e.Kind }

// newAPIError builds an APIError from a non-success response body.
func newAPIError(kind error, status int, body []byte) *APIError {
	name := strings.TrimSuffix(strings.TrimPrefix(errorType(body), " ("), ")")
	return &APIError{Kind: kind, Status: status, Name: name, Message: errorMessage(body)}
}

// errorMessage extracts error.message from a provider error body, with control
// characters removed (so it cannot drive a terminal) and its length bounded.
func errorMessage(body []byte) string {
	var e struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if json.Unmarshal(body, &e) != nil {
		return ""
	}
	var b strings.Builder
	for _, r := range e.Error.Message {
		switch {
		case r == '\n' || r == '\t':
			b.WriteRune(r)
		case r < 0x20 || r == 0x7f || (r >= 0x80 && r < 0xa0):
			// dropped
		default:
			b.WriteRune(r)
		}
	}
	msg := strings.TrimSpace(b.String())
	if r := []rune(msg); len(r) > maxProviderMessage {
		msg = string(r[:maxProviderMessage]) + "..."
	}
	return msg
}
