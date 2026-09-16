package main

import (
	"testing"
)

func TestSanitizeHeaderField(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{name: "Clean input", input: "Alice Doe", expected: "Alice Doe"},
		{name: "CRLF injection attempt", input: "Alice\r\nBcc: victim@example.com", expected: "AliceBcc: victim@example.com"},
		{name: "Newline only", input: "Alice\nInjected-Header: value", expected: "AliceInjected-Header: value"},
		{name: "Null byte injection", input: "Alice\x00Smith", expected: "AliceSmith"},
		{name: "Leading and trailing whitespace", input: "   Alice Smith   ", expected: "Alice Smith"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := sanitizeHeaderField(tt.input)
			if got != tt.expected {
				t.Errorf("sanitizeHeaderField(%q) = %q, expected %q", tt.input, got, tt.expected)
			}
		})
	}
}
