package aigen

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"api/catalog"
)

func TestDeclineReasonsAreReportedOnlyWhenNothingIsBuilt(t *testing.T) {
	for _, code := range catalog.DeclineReasons {
		res, err := Validate([]byte(`{"nodes":[],"edges":[],"decline":"` + code + `"}`))
		if !errors.Is(err, ErrEmpty) || res == nil || res.Decline != code {
			t.Errorf("%s: got %+v, %v", code, res, err)
		}
	}
	// A model that built something and also declined keeps its graph: the decline
	// is ignored, never allowed to discard a usable answer.
	res, err := Validate([]byte(`{"nodes":[{"ref":"a","type":"nginx"}],"edges":[],"decline":"unsafe"}`))
	if err != nil || res.Decline != "" || len(res.Nodes) != 1 {
		t.Errorf("a graph with a decline: %+v, %v", res, err)
	}
}

func TestMalformedOrUnknownDeclineCostsOnlyTheReason(t *testing.T) {
	for _, raw := range []string{`"nonsense"`, `"Not_Infrastructure"`, `42`, `["unsafe"]`, `null`, `{}`, `"` + strings.Repeat("a", 5000) + `"`, `"unsafe\u0000"`} {
		res, err := Validate([]byte(`{"nodes":[],"edges":[],"decline":` + raw + `}`))
		if !errors.Is(err, ErrEmpty) || res == nil || res.Decline != "" {
			t.Errorf("%.30s: got %+v, %v", raw, res, err)
		}
	}
	// And a decline field never makes otherwise valid output malformed.
	if _, err := Validate([]byte(`{"nodes":[{"ref":"a","type":"nginx"}],"edges":[],"decline":"garbage"}`)); err != nil {
		t.Errorf("a bad decline rejected a good graph: %v", err)
	}
}

func TestEveryDeclineReasonHasItsOwnMessage(t *testing.T) {
	seen := map[string]string{}
	for _, code := range append([]string{"", DeclineEmpty, "made_up"}, catalog.DeclineReasons...) {
		msg := DeclineMessage(code)
		if msg == "" || strings.Contains(msg, "%") || strings.Contains(msg, "{") {
			t.Errorf("%q: bad message %q", code, msg)
		}
		seen[code] = msg
	}
	for _, code := range catalog.DeclineReasons {
		for other, msg := range seen {
			if other != code && msg == seen[code] {
				t.Errorf("%s and %q share a message", code, other)
			}
		}
	}
	// Unknown codes get the generic message, the same one as "no reason".
	if seen["made_up"] != seen[""] || seen[DeclineEmpty] != seen[""] {
		t.Error("unknown codes should fall back to the generic message")
	}
	// The sentences make claims about the catalog; keep them true.
	if !strings.Contains(seen[catalog.DeclineUnsupported], "Kubernetes") || !strings.Contains(seen[catalog.DeclineUnsafe], "scripts") {
		t.Error("a decline message lost the thing it is about")
	}
}

// The schema is what makes a real model use the codes, and what a provider
// translates; the enum has to match the list the validator accepts.
func TestSchemaOffersExactlyTheDeclineCodes(t *testing.T) {
	var s struct {
		Properties map[string]struct {
			Enum []string `json:"enum"`
		} `json:"properties"`
		Required []string `json:"required"`
	}
	raw, _ := json.Marshal(catalog.JSONSchema())
	if err := json.Unmarshal(raw, &s); err != nil {
		t.Fatal(err)
	}
	got := s.Properties["decline"].Enum
	if strings.Join(got, ",") != strings.Join(catalog.DeclineReasons, ",") {
		t.Errorf("schema enum %v, want %v", got, catalog.DeclineReasons)
	}
	for _, r := range s.Required {
		if r == "decline" {
			t.Error("decline must stay optional")
		}
	}
}

// The prompt must tell a model about every code, or it cannot choose it.
func TestPromptTeachesEveryDeclineCode(t *testing.T) {
	for _, code := range catalog.DeclineReasons {
		if !strings.Contains(systemPrompt, `"`+code+`"`) {
			t.Errorf("the system prompt never mentions %q", code)
		}
	}
}
