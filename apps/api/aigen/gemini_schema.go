package aigen

import (
	"fmt"
	"strings"
)

// GeminiSchema translates the catalog's JSON Schema (catalog.JSONSchema) into the
// OpenAPI subset the Gemini API accepts for function parameters.
//
// The catalog schema is a request-side hint, never a trust boundary: the output
// is validated again by Validate. So this translation may lose precision, and it
// errs toward a schema Gemini will accept over one that says everything:
//
//   - oneOf becomes anyOf, and const becomes a one-value enum, because the subset
//     has no oneOf or const.
//   - Keywords outside the subset (additionalProperties, pattern, $schema, ...)
//     are dropped. A string's pattern is kept as a sentence in its description,
//     which guides the model without adding a regular expression the API has to
//     compile into its decoding constraints and may refuse as too complex.
//   - An object with no properties is omitted from its parent: the API rejects
//     empty object schemas, and the validator treats missing "parameters" as "use
//     the defaults", which is what an empty one meant.
//
// The input is not modified.
func GeminiSchema(src map[string]any) map[string]any {
	out, _ := translateSchema(src)
	if out == nil || (out["type"] == nil && out["anyOf"] == nil) {
		out = map[string]any{"type": "OBJECT", "properties": map[string]any{}}
	}
	return out
}

// keptKeywords are the schema keywords copied through unchanged.
var keptKeywords = []string{"description", "format", "nullable", "minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength"}

var geminiTypes = map[string]string{
	"string": "STRING", "number": "NUMBER", "integer": "INTEGER",
	"boolean": "BOOLEAN", "array": "ARRAY", "object": "OBJECT",
}

// translateSchema returns the translated schema and whether it is an object with
// no properties (which the caller omits).
func translateSchema(src map[string]any) (map[string]any, bool) {
	out := map[string]any{}

	typ, _ := src["type"].(string)
	if c, ok := src["const"]; ok {
		out["enum"] = []any{fmt.Sprint(c)}
		if _, isString := c.(string); isString && typ == "" {
			typ = "string"
		}
	}
	if t, ok := geminiTypes[typ]; ok {
		out["type"] = t
	}

	for _, k := range keptKeywords {
		if v, ok := src[k]; ok {
			out[k] = v
		}
	}
	if values := stringList(src["enum"]); len(values) > 0 {
		out["enum"] = values
	}
	if p, ok := src["pattern"].(string); ok && p != "" {
		hint := "Must match the regular expression " + p
		if d, ok := out["description"].(string); ok && d != "" {
			hint = d + ". " + hint
		}
		out["description"] = hint
	}

	variants := anyList(src["oneOf"])
	if len(variants) == 0 {
		variants = anyList(src["anyOf"])
	}
	if len(variants) > 0 {
		var translated []any
		for _, v := range variants {
			if m, ok := v.(map[string]any); ok {
				if t, empty := translateSchema(m); !empty {
					translated = append(translated, t)
				}
			}
		}
		out["anyOf"] = translated
	}

	if items, ok := src["items"].(map[string]any); ok {
		out["items"], _ = translateSchema(items)
	}

	if props, ok := src["properties"].(map[string]any); ok || typ == "object" {
		kept := map[string]any{}
		for name, raw := range props {
			if child, ok := raw.(map[string]any); ok {
				if t, empty := translateSchema(child); !empty {
					kept[name] = t
				}
			}
		}
		if len(kept) == 0 {
			return nil, true
		}
		out["properties"] = kept

		var required []any
		for _, name := range stringList(src["required"]) {
			if _, ok := kept[name.(string)]; ok {
				required = append(required, name)
			}
		}
		if len(required) > 0 {
			out["required"] = required
		}
	}
	return out, false
}

// stringList reads a []string or []any of strings as []any (what JSON encoding
// of a Schema wants), or nil.
func stringList(v any) []any {
	switch list := v.(type) {
	case []string:
		out := make([]any, len(list))
		for i, s := range list {
			out[i] = s
		}
		return out
	case []any:
		var out []any
		for _, e := range list {
			if s, ok := e.(string); ok {
				out = append(out, s)
			}
		}
		return out
	}
	return nil
}

func anyList(v any) []any {
	switch list := v.(type) {
	case []any:
		return list
	case []map[string]any:
		out := make([]any, len(list))
		for i, m := range list {
			out[i] = m
		}
		return out
	}
	return nil
}

// modelNameOK admits the characters Gemini model IDs use, so a configured name
// cannot change the request path.
func modelNameOK(name string) bool {
	if name == "" || len(name) > 64 {
		return false
	}
	return !strings.ContainsAny(name, "/\\?#%: \t\r\n") && !strings.Contains(name, "..")
}
