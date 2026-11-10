package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"api/aigen"
	"api/catalog"
)

// Probe mode answers one question: when a provider says "invalid argument" and
// names no field, which part of the request does it object to?
//
// It sends a ladder of small requests, each adding one feature to the last
// (plain text, then a system instruction, an output limit, a forced function
// call), then the full request the evaluation sends, then that full request with
// one suspect removed at a time. Which requests the API accepts and which it
// refuses points at the cause without guessing.

// prober is what probe mode needs from a provider. *aigen.Gemini satisfies it.
type prober interface {
	Probe(ctx context.Context, body map[string]any) error
}

type probe struct {
	Name  string
	Build func(base map[string]any) map[string]any
}

type probeResult struct {
	Name    string
	OK      bool
	Detail  string // status and error name
	Message string // the provider's own message
}

const (
	probeBoundsAsConstraints = "full, length and range bounds sent as constraints"
	probeThreeNodes          = "full, three node types (anyOf kept)"
	probeOneNode             = "full, one node type instead of all of them (no anyOf)"
)

// Indexes into geminiProbes, used by the interpretation.
const (
	probeText      = 0
	probeSystem    = 1
	probeLimit     = 2
	probeForced    = 3
	probeFull      = 4
	firstVariation = 5
)

func deepCopy(m map[string]any) map[string]any {
	raw, _ := json.Marshal(m)
	var out map[string]any
	_ = json.Unmarshal(raw, &out)
	return out
}

// declaration returns the first function declaration of a request body.
func declaration(body map[string]any) map[string]any {
	tools, _ := body["tools"].([]any)
	if len(tools) == 0 {
		return nil
	}
	decls, _ := tools[0].(map[string]any)["functionDeclarations"].([]any)
	if len(decls) == 0 {
		return nil
	}
	d, _ := decls[0].(map[string]any)
	return d
}

// stripKeys removes the named keys wherever they occur under v. The map under
// "properties" is the one place a key is a field name rather than a keyword, so
// its own entries are never removed, only searched.
func stripKeys(v any, keys ...string) {
	drop := map[string]bool{}
	for _, k := range keys {
		drop[k] = true
	}
	var walk func(v any, isPropertyMap bool)
	walk = func(v any, isPropertyMap bool) {
		switch x := v.(type) {
		case map[string]any:
			for k, child := range x {
				if !isPropertyMap && drop[k] {
					delete(x, k)
					continue
				}
				walk(child, !isPropertyMap && k == "properties")
			}
		case []any:
			for _, child := range x {
				walk(child, false)
			}
		}
	}
	walk(v, false)
}

func withSchema(base map[string]any, edit func(schema map[string]any)) map[string]any {
	b := deepCopy(base)
	if d := declaration(b); d != nil {
		if s, ok := d["parameters"].(map[string]any); ok {
			edit(s)
		}
	}
	return b
}

func geminiProbes() []probe {
	tiny := map[string]any{"type": "OBJECT", "properties": map[string]any{"x": map[string]any{"type": "STRING"}}}
	keep := func(base map[string]any, keys ...string) map[string]any {
		out := map[string]any{}
		for _, k := range keys {
			if v, ok := base[k]; ok {
				out[k] = v
			}
		}
		return deepCopy(out)
	}
	return []probe{
		{"plain text prompt only", func(b map[string]any) map[string]any { return keep(b, "contents") }},
		{"+ system instruction", func(b map[string]any) map[string]any { return keep(b, "contents", "systemInstruction") }},
		{"+ output token limit", func(b map[string]any) map[string]any {
			return keep(b, "contents", "systemInstruction", "generationConfig")
		}},
		{"+ forced function call (tiny schema)", func(b map[string]any) map[string]any {
			out := deepCopy(b)
			declaration(out)["parameters"] = tiny
			return out
		}},
		{"full request, as the evaluation sends it", func(b map[string]any) map[string]any { return deepCopy(b) }},

		{"full, without the output token limit", func(b map[string]any) map[string]any {
			out := deepCopy(b)
			delete(out, "generationConfig")
			return out
		}},
		{"full, without the system instruction", func(b map[string]any) map[string]any {
			out := deepCopy(b)
			delete(out, "systemInstruction")
			return out
		}},
		{"full, function call not forced", func(b map[string]any) map[string]any {
			out := deepCopy(b)
			delete(out, "toolConfig")
			return out
		}},
		{"full, schema sent as raw JSON Schema (parametersJsonSchema)", func(b map[string]any) map[string]any {
			out := deepCopy(b)
			d := declaration(out)
			delete(d, "parameters")
			d["parametersJsonSchema"] = catalog.JSONSchema()
			return out
		}},
		{"full, schema without descriptions", func(b map[string]any) map[string]any {
			return withSchema(b, func(s map[string]any) { stripKeys(s, "description") })
		}},
		// The request sends bounds as sentences in descriptions, because Gemini
		// refuses them as constraints once the function call is forced. This sends
		// them as constraints, so it is expected to be refused: it confirms the
		// finding, and shows if the API ever starts to accept it.
		{probeBoundsAsConstraints, func(b map[string]any) map[string]any {
			out := deepCopy(b)
			declaration(out)["parameters"] = aigen.GeminiSchemaKeepingBounds(catalog.JSONSchema())
			return out
		}},
		{"full, schema without enums", func(b map[string]any) map[string]any {
			return withSchema(b, func(s map[string]any) { stripKeys(s, "enum") })
		}},
		{"full, schema without required lists", func(b map[string]any) map[string]any {
			return withSchema(b, func(s map[string]any) { stripKeys(s, "required") })
		}},
		// These two differ in one thing only. Three node types keep anyOf but make
		// the schema smaller; one node type has no anyOf at all. Together they tell
		// "the API refuses anyOf" apart from "the schema is too big".
		{probeThreeNodes, func(b map[string]any) map[string]any {
			return withSchema(b, func(s map[string]any) {
				nodes, _ := s["properties"].(map[string]any)["nodes"].(map[string]any)
				items, _ := nodes["items"].(map[string]any)
				if variants, _ := items["anyOf"].([]any); len(variants) > 3 {
					items["anyOf"] = variants[:3]
				}
			})
		}},
		{probeOneNode, func(b map[string]any) map[string]any {
			return withSchema(b, func(s map[string]any) {
				nodes, _ := s["properties"].(map[string]any)["nodes"].(map[string]any)
				items, _ := nodes["items"].(map[string]any)
				if variants, _ := items["anyOf"].([]any); len(variants) > 0 {
					nodes["items"] = variants[0]
				}
			})
		}},
	}
}

// runProbes sends every probe in turn and prints each outcome as it arrives.
func runProbes(ctx context.Context, p prober, delay time.Duration, out io.Writer) []probeResult {
	base := aigen.BuildGeminiBody("A single web server running nginx.", catalog.JSONSchema(), 0)
	var results []probeResult
	for i, pr := range geminiProbes() {
		if ctx.Err() != nil {
			break
		}
		r := probeResult{Name: pr.Name, OK: true}
		if err := p.Probe(ctx, pr.Build(base)); err != nil {
			r.OK, r.Detail = false, err.Error()
			var api *aigen.APIError
			if errors.As(err, &api) {
				r.Message = api.Message
				r.Detail = fmt.Sprintf("status %d", api.Status)
				if api.Name != "" {
					r.Detail += " (" + api.Name + ")"
				}
			}
		}
		results = append(results, r)
		fmt.Fprintf(out, "  %-4s  %s\n", map[bool]string{true: "ok", false: "FAIL"}[r.OK], r.Name)
		if !r.OK {
			fmt.Fprintf(out, "          %s: %s\n", r.Detail, indent(strings.TrimSpace(r.Message)))
		}
		if i < len(geminiProbes())-1 {
			time.Sleep(delay)
		}
	}
	return results
}

// interpretProbes turns the pattern of accepted and refused probes into a
// sentence about the cause.
func interpretProbes(rs []probeResult) string {
	if len(rs) < len(geminiProbes()) {
		return "The probe run was cut short, so no conclusion can be drawn."
	}
	if !rs[probeText].OK {
		return "Even the plain text request was refused, so the problem is the key, the model name or the account, not the request's content."
	}
	for _, i := range []int{probeSystem, probeLimit, probeForced} {
		if !rs[i].OK {
			return fmt.Sprintf("The API refuses the request once this is added: %q. The earlier steps were accepted, so that feature is the cause.", rs[i].Name)
		}
	}
	byName := map[string]bool{}
	for _, r := range rs {
		byName[r.Name] = r.OK
	}
	if rs[probeFull].OK {
		msg := "The full request is accepted for this prompt, so the request's shape is not the cause. If an evaluation run is still refused, compare the model name and key it uses."
		if ok, ran := byName[probeBoundsAsConstraints]; ran && !ok {
			msg += "\nSending the length and range bounds as constraints is refused, as measured before; the request sends them as sentences in the descriptions instead, which is accepted."
		}
		return msg
	}

	// Which single changes make the full request acceptable? The two node-count
	// probes are kept apart: a smaller schema is helped by almost anything that
	// shrinks it, so they only explain a result when nothing else does.
	var fixes, structural []string
	for _, r := range rs[firstVariation:] {
		if !r.OK {
			continue
		}
		fixes = append(fixes, r.Name)
		if r.Name != probeThreeNodes && r.Name != probeOneNode {
			structural = append(structural, r.Name)
		}
	}
	if len(fixes) == 0 {
		return "The simple requests are accepted but the full one is refused, and no single removal fixes it. The tiny schema works, so the catalog schema is refused for a reason that spans more than one feature, or for its overall size or complexity."
	}
	msg := "The full request is refused, and is accepted when this is changed:\n  - " + strings.Join(fixes, "\n  - ")
	switch {
	case len(structural) > 0:
		msg += "\nThe cause is among: " + strings.Join(structural, "; ") + "."
		if byName[probeOneNode] || byName[probeThreeNodes] {
			msg += "\nFewer node types also helped, but a fix that keeps every node type (and so keeps anyOf) works too, so anyOf itself is not what the API refuses: it was only a smaller schema."
		}
	case byName[probeThreeNodes]:
		msg += "\nA schema with fewer node types is accepted even though it still uses anyOf, so the API is objecting to the schema's overall size or complexity, not to one keyword."
	default:
		msg += "\nOnly a single node type is accepted, and three are not, which points at anyOf (the choice between node types) itself."
	}
	return msg
}
