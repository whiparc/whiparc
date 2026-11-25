package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"api/aigen"
	"api/catalog"
)

// refusing starts a stub Gemini that answers 400 "Request contains an invalid
// argument." (as the real one does, naming no field) to any request whose body
// satisfies refuse, and 200 otherwise.
func refusing(t *testing.T, refuse func(body string) bool) *aigen.Gemini {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		if refuse(string(raw)) {
			w.WriteHeader(400)
			io.WriteString(w, `{"error":{"code":400,"message":"Request contains an invalid argument.","status":"INVALID_ARGUMENT"}}`)
			return
		}
		io.WriteString(w, `{"candidates":[]}`)
	}))
	t.Cleanup(srv.Close)
	return &aigen.Gemini{APIKey: "k", Model: "m", BaseURL: srv.URL}
}

func probeRun(t *testing.T, refuse func(string) bool) ([]probeResult, string) {
	t.Helper()
	var out strings.Builder
	rs := runProbes(context.Background(), refusing(t, refuse), 0, &out)
	if len(rs) != len(geminiProbes()) {
		t.Fatalf("ran %d probes, want %d", len(rs), len(geminiProbes()))
	}
	return rs, out.String()
}

func passed(rs []probeResult) map[string]bool {
	m := map[string]bool{}
	for _, r := range rs {
		m[r.Name] = r.OK
	}
	return m
}

func mustJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func TestProbeListIsWellFormed(t *testing.T) {
	ps := geminiProbes()
	if len(ps) <= firstVariation || !strings.HasPrefix(ps[probeFull].Name, "full request") {
		t.Fatalf("probe indexes no longer match the list: %d probes, [%d] = %q", len(ps), probeFull, ps[probeFull].Name)
	}
	seen := map[string]bool{}
	for _, p := range ps {
		if seen[p.Name] {
			t.Errorf("duplicate probe name %q", p.Name)
		}
		seen[p.Name] = true
	}
}

func TestProbeBodiesVaryOnlyWhatTheyClaim(t *testing.T) {
	base := aigen.BuildGeminiBody("p", catalog.JSONSchema(), 0)
	before := mustJSON(base)
	by := map[string]map[string]any{}
	for _, p := range geminiProbes() {
		by[p.Name] = p.Build(base)
	}
	has := func(name, key string) bool { _, ok := by[name][key]; return ok }

	if has("plain text prompt only", "tools") || has("plain text prompt only", "systemInstruction") || !has("plain text prompt only", "contents") {
		t.Error("the plain probe must carry only the prompt")
	}
	if !has("+ system instruction", "systemInstruction") || has("+ system instruction", "generationConfig") {
		t.Error("the system instruction probe adds exactly that")
	}
	if !has("+ output token limit", "generationConfig") || has("+ output token limit", "tools") {
		t.Error("the output-limit probe adds exactly that")
	}
	if !has("+ forced function call (tiny schema)", "toolConfig") {
		t.Error("the tiny probe forces the call")
	}
	if has("full, without the output token limit", "generationConfig") || !has("full, without the output token limit", "tools") {
		t.Error("removal probe removed the wrong thing")
	}
	if has("full, function call not forced", "toolConfig") || has("full, without the system instruction", "systemInstruction") {
		t.Error("removal probes removed the wrong thing")
	}
	if d := declaration(by["full, schema sent as raw JSON Schema (parametersJsonSchema)"]); d["parameters"] != nil || d["parametersJsonSchema"] == nil {
		t.Error("raw-schema probe must swap parameters for parametersJsonSchema")
	}
	if mustJSON(base) != before {
		t.Error("a probe modified the shared base request")
	}
}

func TestProbeSchemaVariationsRemoveOnlyTheirKeyword(t *testing.T) {
	base := aigen.BuildGeminiBody("p", catalog.JSONSchema(), 0)
	build := func(name string) string {
		for _, p := range geminiProbes() {
			if p.Name == name {
				return mustJSON(p.Build(base))
			}
		}
		t.Fatalf("no probe %q", name)
		return ""
	}
	full := mustJSON(base)
	// The request sends bounds as sentences; only the bounds probe sends them as
	// constraints, which is the whole point of that probe.
	if strings.Contains(full, `"maxLength"`) || strings.Contains(full, `"maxItems"`) {
		t.Error("the full request must not carry bounds as constraints")
	}
	if got := build(probeBoundsAsConstraints); !strings.Contains(got, `"maxLength"`) || !strings.Contains(got, `"maxItems"`) || !strings.Contains(got, `"minimum"`) {
		t.Error("the bounds probe must send maxLength, maxItems and minimum as constraints")
	}
	for name, gone := range map[string]string{
		"full, schema without enums":          `"enum"`,
		"full, schema without required lists": `"required"`,
	} {
		got := build(name)
		if strings.Contains(got, gone) || !strings.Contains(full, gone) {
			t.Errorf("%s: %s present=%v after, present=%v before", name, gone, strings.Contains(got, gone), strings.Contains(full, gone))
		}
	}
	// A parameter literally named "description" (the security group has one) is a
	// field name, not a keyword, and must survive stripping descriptions.
	if got := build("full, schema without descriptions"); !strings.Contains(got, `"description":{`) {
		t.Error("stripping descriptions removed a property that is named description")
	}
	// Required lists that name a property must not be stripped from inside a
	// property map either: only keywords go.
	if got := build(probeOneNode); strings.Contains(got, `"anyOf"`) || !strings.Contains(full, `"anyOf"`) {
		t.Error("the one-node-type probe must remove anyOf")
	}
}

// Each simulated cause must be pinpointed to exactly the matching feature.
func TestProbesPinpointTheRefusedFeature(t *testing.T) {
	cases := []struct {
		name     string
		refuse   func(string) bool
		failing  []string // probes that must fail
		fixed    []string // full-request variations that must pass (the culprit removed)
		mentions string   // the interpretation must say this
	}{
		{
			name:     "the catalog schema's anyOf",
			refuse:   func(b string) bool { return strings.Contains(b, `"anyOf"`) || strings.Contains(b, `"oneOf"`) },
			failing:  []string{"full request, as the evaluation sends it", probeThreeNodes},
			fixed:    []string{probeOneNode},
			mentions: "points at anyOf",
		},
		{
			// A smaller schema that still has anyOf passes: it is size, not anyOf.
			name:     "overall schema size",
			refuse:   func(b string) bool { return strings.Count(b, `"ref"`) > 6 },
			failing:  []string{"full request, as the evaluation sends it"},
			fixed:    []string{probeThreeNodes, probeOneNode},
			mentions: "overall size or complexity",
		},
		{
			// What Gemini actually does with a forced call: bounds as constraints are
			// refused, so the request (which sends them as hints) is accepted and only
			// the bounds probe fails.
			name:     "bounds sent as constraints",
			refuse:   func(b string) bool { return strings.Contains(b, `"toolConfig"`) && strings.Contains(b, `"maxLength"`) },
			failing:  []string{probeBoundsAsConstraints, "full, schema sent as raw JSON Schema (parametersJsonSchema)"},
			fixed:    []string{"plain text prompt only", "full request, as the evaluation sends it"},
			mentions: "Sending the length and range bounds as constraints is refused",
		},
		{
			name:     "enums",
			refuse:   func(b string) bool { return strings.Contains(b, `"enum"`) },
			failing:  []string{"full request, as the evaluation sends it"},
			fixed:    []string{"full, schema without enums"},
			mentions: "without enums",
		},
		{
			name:     "forced function calling",
			refuse:   func(b string) bool { return strings.Contains(b, `"toolConfig"`) },
			failing:  []string{"+ forced function call (tiny schema)", "full request, as the evaluation sends it"},
			mentions: "forced function call",
		},
		{
			name:     "the system instruction",
			refuse:   func(b string) bool { return strings.Contains(b, `"systemInstruction"`) },
			failing:  []string{"+ system instruction"},
			mentions: "system instruction",
		},
		{
			name:     "the output limit",
			refuse:   func(b string) bool { return strings.Contains(b, `"maxOutputTokens"`) },
			failing:  []string{"+ output token limit"},
			mentions: "output token limit",
		},
		{
			name:     "everything (bad key or model)",
			refuse:   func(string) bool { return true },
			failing:  []string{"plain text prompt only"},
			mentions: "key, the model name",
		},
		{
			name:     "nothing",
			refuse:   func(string) bool { return false },
			mentions: "not the cause",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rs, out := probeRun(t, c.refuse)
			ok := passed(rs)
			for _, name := range c.failing {
				if ok[name] {
					t.Errorf("%q should have been refused", name)
				}
			}
			for _, name := range c.fixed {
				if !ok[name] {
					t.Errorf("%q should have been accepted (the culprit is removed)", name)
				}
			}
			if said := interpretProbes(rs); !strings.Contains(said, c.mentions) {
				t.Errorf("interpretation does not name the cause %q:\n%s", c.mentions, said)
			}
			// The provider's own message is shown for each refusal.
			if len(c.failing) > 0 && !strings.Contains(out, "Request contains an invalid argument.") {
				t.Errorf("refusal message not shown:\n%s", out)
			}
		})
	}
}

func TestInterpretationWhenNoSingleRemovalHelps(t *testing.T) {
	// Refuse anything that describes a node graph at all, however it is trimmed;
	// the tiny schema (which has no graph) is still accepted.
	rs, _ := probeRun(t, func(b string) bool { return strings.Contains(b, `"nodes"`) })
	if !passed(rs)["+ forced function call (tiny schema)"] {
		t.Fatal("the tiny schema should be accepted")
	}
	said := interpretProbes(rs)
	if !strings.Contains(said, "no single removal fixes it") || !strings.Contains(said, "size or complexity") {
		t.Errorf("%s", said)
	}
}

func TestInterpretationNeedsACompleteRun(t *testing.T) {
	if got := interpretProbes(nil); !strings.Contains(got, "cut short") {
		t.Errorf("%s", got)
	}
}

func TestProbeRunStopsWhenCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if rs := runProbes(ctx, refusing(t, func(string) bool { return false }), 0, io.Discard); len(rs) != 0 {
		t.Errorf("%d probes ran after cancellation", len(rs))
	}
}

// results builds a probe report in the order of geminiProbes, accepting only the
// named probes (and the first four, the ladder, which a real run passes).
func results(accept ...string) []probeResult {
	ok := map[string]bool{}
	for _, n := range accept {
		ok[n] = true
	}
	var rs []probeResult
	for i, p := range geminiProbes() {
		rs = append(rs, probeResult{Name: p.Name, OK: i < probeFull || ok[p.Name]})
	}
	return rs
}

// This is the pattern a real Gemini run produced before bounds were sent as
// hints: forcing the call, the bounds and a reduced node count each cured it. The
// tool used to conclude "anyOf". The bounds fix keeps every node type, so anyOf
// is accepted, and the conclusion must say so.
func TestInterpretationDoesNotBlameAnyOfWhenAnotherFixKeepsIt(t *testing.T) {
	said := interpretProbes(results("full, function call not forced", probeOneNode))
	if strings.Contains(said, "points at anyOf") {
		t.Errorf("anyOf blamed although a fix that keeps it exists:\n%s", said)
	}
	if !strings.Contains(said, "anyOf itself is not what the API refuses") || !strings.Contains(said, "function call not forced") {
		t.Errorf("explanation missing:\n%s", said)
	}

	// With no other fix, a single-node pass really does point at anyOf.
	if said := interpretProbes(results(probeOneNode)); !strings.Contains(said, "points at anyOf") {
		t.Errorf("%s", said)
	}
	// And if three node types pass as well, it is size, not anyOf.
	if said := interpretProbes(results(probeOneNode, probeThreeNodes)); !strings.Contains(said, "overall size or complexity") {
		t.Errorf("%s", said)
	}
}

func TestInterpretationWhenTheFullRequestIsAcceptedMentionsTheBoundsFinding(t *testing.T) {
	// Full accepted, bounds-as-constraints refused: the situation after the fix.
	rs := results("full request, as the evaluation sends it")
	said := interpretProbes(rs)
	if !strings.Contains(said, "request's shape is not the cause") || !strings.Contains(said, "Sending the length and range bounds as constraints is refused") {
		t.Errorf("%s", said)
	}
	// If the API ever accepts bounds again, the claim must not be made.
	rs = results("full request, as the evaluation sends it", probeBoundsAsConstraints)
	if said := interpretProbes(rs); strings.Contains(said, "is refused, as measured before") {
		t.Errorf("stale claim: %s", said)
	}
}
