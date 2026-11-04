package aigen

import (
	"encoding/json"
	"reflect"
	"regexp"
	"strings"
	"testing"

	"api/catalog"
)

// allowedKeys is the full set of keywords the translated schema may contain: the
// Gemini Schema fields the translator is allowed to emit.
var allowedKeys = map[string]bool{
	"type": true, "description": true, "format": true, "nullable": true, "enum": true,
	"items": true, "properties": true, "required": true, "anyOf": true,
	"minimum": true, "maximum": true, "minItems": true, "maxItems": true, "minLength": true, "maxLength": true,
}

var geminiTypeNames = map[string]bool{"STRING": true, "NUMBER": true, "INTEGER": true, "BOOLEAN": true, "ARRAY": true, "OBJECT": true}

// walk visits every schema object in a translated schema.
func walk(t *testing.T, path string, s map[string]any, visit func(path string, s map[string]any)) {
	t.Helper()
	visit(path, s)
	if props, ok := s["properties"].(map[string]any); ok {
		for name, c := range props {
			walk(t, path+"."+name, c.(map[string]any), visit)
		}
	}
	if items, ok := s["items"].(map[string]any); ok {
		walk(t, path+"[]", items, visit)
	}
	if variants, ok := s["anyOf"].([]any); ok {
		for i, v := range variants {
			walk(t, path+"|"+string(rune('a'+i)), v.(map[string]any), visit)
		}
	}
}

func TestGeminiSchemaOnlyUsesTheSupportedSubset(t *testing.T) {
	out := GeminiSchema(catalog.JSONSchema())
	count := 0
	walk(t, "$", out, func(path string, s map[string]any) {
		count++
		for k := range s {
			if !allowedKeys[k] {
				t.Errorf("%s: keyword %q is outside the Gemini subset", path, k)
			}
		}
		if typ, ok := s["type"].(string); ok && !geminiTypeNames[typ] {
			t.Errorf("%s: type %q is not a Gemini type name", path, typ)
		}
		if _, hasType := s["type"]; !hasType && s["anyOf"] == nil {
			t.Errorf("%s: schema has neither a type nor anyOf", path)
		}
		if s["type"] == "OBJECT" {
			if props, _ := s["properties"].(map[string]any); len(props) == 0 {
				t.Errorf("%s: an OBJECT schema with no properties is rejected by the API", path)
			}
		}
		if s["type"] == "ARRAY" && s["items"] == nil {
			t.Errorf("%s: an ARRAY schema needs items", path)
		}
	})
	if count < 50 {
		t.Errorf("only %d schema nodes; the translation looks truncated", count)
	}
	if _, err := json.Marshal(out); err != nil {
		t.Errorf("translated schema is not serialisable: %v", err)
	}
}

func TestGeminiSchemaKeepsEveryNodeTypeAndSettableParameter(t *testing.T) {
	out := GeminiSchema(catalog.JSONSchema())
	nodes := out["properties"].(map[string]any)["nodes"].(map[string]any)
	if nodes["type"] != "ARRAY" || nodes["maxItems"] != catalog.MaxNodes {
		t.Errorf("nodes array lost its type or bound: %v", nodes)
	}
	variants := nodes["items"].(map[string]any)["anyOf"].([]any)
	if len(variants) != len(catalog.AIGeneratable()) {
		t.Fatalf("%d variants, want %d (oneOf must become anyOf, one per node type)", len(variants), len(catalog.AIGeneratable()))
	}

	byType := map[string]map[string]any{}
	for _, v := range variants {
		variant := v.(map[string]any)
		props := variant["properties"].(map[string]any)
		enum := props["type"].(map[string]any)["enum"].([]any)
		if len(enum) != 1 || props["type"].(map[string]any)["type"] != "STRING" {
			t.Errorf("const was not turned into a one-value string enum: %v", props["type"])
		}
		byType[enum[0].(string)] = variant
	}

	for _, n := range catalog.AIGeneratable() {
		variant, ok := byType[n.ID]
		if !ok {
			t.Errorf("node type %s is missing from the translated schema", n.ID)
			continue
		}
		params, hasParams := variant["properties"].(map[string]any)["parameters"].(map[string]any)
		settable := 0
		for _, p := range n.Params {
			if p.AISettable {
				settable++
			}
		}
		switch {
		case settable == 0 && hasParams:
			t.Errorf("%s has no settable parameters, so an empty parameters object must be omitted", n.ID)
		case settable > 0 && !hasParams:
			t.Errorf("%s lost its parameters object", n.ID)
		case settable > 0:
			props := params["properties"].(map[string]any)
			for _, p := range n.Params {
				if _, ok := props[p.Key]; ok != p.AISettable {
					t.Errorf("%s.%s: present=%v, AISettable=%v", n.ID, p.Key, ok, p.AISettable)
				}
			}
		}
		req := variant["required"].([]any)
		if len(req) != 2 {
			t.Errorf("%s: required = %v, want ref and type", n.ID, req)
		}
	}
}

func TestGeminiSchemaPreservesEnumsRangesAndTurnsPatternsIntoHints(t *testing.T) {
	out := GeminiSchema(catalog.JSONSchema())
	variants := out["properties"].(map[string]any)["nodes"].(map[string]any)["items"].(map[string]any)["anyOf"].([]any)
	param := func(nodeType, key string) map[string]any {
		for _, v := range variants {
			props := v.(map[string]any)["properties"].(map[string]any)
			if props["type"].(map[string]any)["enum"].([]any)[0] == nodeType {
				return props["parameters"].(map[string]any)["properties"].(map[string]any)[key].(map[string]any)
			}
		}
		t.Fatalf("no %s", nodeType)
		return nil
	}

	size := param("aws_instance.web_server", "instanceType")
	if !reflect.DeepEqual(size["enum"], []any{"t3.micro", "t3.small", "t3.medium", "t3.large"}) {
		t.Errorf("enum changed: %v", size["enum"])
	}
	disk := param("aws_instance.web_server", "rootVolumeSize")
	if disk["type"] != "INTEGER" || disk["minimum"] != 8 || disk["maximum"] != 100 {
		t.Errorf("range lost: %v", disk)
	}
	name := param("aws_vpc", "vpcName")
	if _, kept := name["pattern"]; kept {
		t.Error("pattern must not be sent as a constraint")
	}
	if d, _ := name["description"].(string); !strings.Contains(d, "regular expression") || !strings.Contains(d, "a-zA-Z") {
		t.Errorf("pattern not preserved as a hint: %q", d)
	}
	if name["maxLength"] != 40 {
		t.Errorf("maxLength lost: %v", name["maxLength"])
	}
	if param("aws_security_group", "sshEnabled")["type"] != "BOOLEAN" {
		t.Error("boolean type lost")
	}
}

// The translation is a request hint, so it must never widen what Validate
// accepts, and nothing it drops may be something only the schema enforced.
func TestGeminiSchemaDoesNotMutateItsInput(t *testing.T) {
	src := catalog.JSONSchema()
	before, _ := json.Marshal(src)
	GeminiSchema(src)
	after, _ := json.Marshal(src)
	if string(before) != string(after) {
		t.Error("GeminiSchema modified the catalog schema")
	}
}

func TestGeminiSchemaHandlesSmallInputs(t *testing.T) {
	cases := map[string]struct {
		in   map[string]any
		want map[string]any
	}{
		"empty input still yields a valid root": {map[string]any{}, map[string]any{"type": "OBJECT", "properties": map[string]any{}}},
		"nil input":                             {nil, map[string]any{"type": "OBJECT", "properties": map[string]any{}}},
		"const without a type": {
			map[string]any{"type": "object", "properties": map[string]any{"k": map[string]any{"const": "v"}}},
			map[string]any{"type": "OBJECT", "properties": map[string]any{"k": map[string]any{"type": "STRING", "enum": []any{"v"}}}},
		},
		"additionalProperties and $schema dropped": {
			map[string]any{"$schema": "x", "type": "object", "additionalProperties": false, "properties": map[string]any{"a": map[string]any{"type": "boolean"}}},
			map[string]any{"type": "OBJECT", "properties": map[string]any{"a": map[string]any{"type": "BOOLEAN"}}},
		},
		"required entries that were dropped are removed": {
			map[string]any{"type": "object", "required": []string{"a", "gone"}, "properties": map[string]any{
				"a": map[string]any{"type": "string"}, "gone": map[string]any{"type": "object", "properties": map[string]any{}}}},
			map[string]any{"type": "OBJECT", "required": []any{"a"}, "properties": map[string]any{"a": map[string]any{"type": "STRING"}}},
		},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			if got := GeminiSchema(c.in); !reflect.DeepEqual(got, c.want) {
				gj, _ := json.Marshal(got)
				wj, _ := json.Marshal(c.want)
				t.Errorf("got  %s\nwant %s", gj, wj)
			}
		})
	}
}

func TestModelNameValidation(t *testing.T) {
	for name, want := range map[string]bool{
		"gemini-3.5-flash-lite": true, "gemini-2.5-pro": true, "gemini_x.1": true,
		"": false, "../v1/other": false, "a/b": false, "a?x=1": false, "a b": false, "a#b": false,
		"a%2Fb": false, "a:generateContent": false, "line\nbreak": false, "..": false, strings.Repeat("a", 65): false,
	} {
		if got := modelNameOK(name); got != want {
			t.Errorf("modelNameOK(%q) = %v, want %v", name, got, want)
		}
	}
}

// Patterns of the catalog are long; the hint must quote them intact.
func TestGeminiHintQuotesThePatternExactly(t *testing.T) {
	re := regexp.MustCompile(`regular expression (.+)$`)
	out := GeminiSchema(map[string]any{"type": "object", "properties": map[string]any{
		"n": map[string]any{"type": "string", "pattern": `^[a-z]{1,3}$`, "description": "A name"}}})
	d := out["properties"].(map[string]any)["n"].(map[string]any)["description"].(string)
	if m := re.FindStringSubmatch(d); m == nil || m[1] != `^[a-z]{1,3}$` || !strings.HasPrefix(d, "A name. ") {
		t.Errorf("description = %q", d)
	}
}
