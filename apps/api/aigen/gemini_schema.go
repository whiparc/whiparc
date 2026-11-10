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
//     compile into its decoding constraints.
//   - Length and range bounds (minLength, maxLength, minimum, maximum, minItems,
//     maxItems) are also turned into sentences ("Between 8 and 100.", "At most
//     30 items."). When the function call is forced, Gemini compiles the schema
//     into a decoding constraint, and these bounds combined with a many-way anyOf
//     make that constraint too complex: the API refuses the request with a bare
//     "invalid argument". Measured with the evaluation's -probe mode: the same
//     request is accepted with the bounds removed. The validator enforces every
//     bound anyway.
//   - An object with no properties is omitted from its parent: the API rejects
//     empty object schemas, and the validator treats missing "parameters" as "use
//     the defaults", which is what an empty one meant.
//
// The input is not modified.
func GeminiSchema(src map[string]any) map[string]any {
	return geminiSchema(src, false)
}

// GeminiSchemaKeepingBounds is GeminiSchema with the bounds sent as constraints,
// which is what Gemini refuses (see above). It exists so probe mode can confirm
// that, and tell if it ever stops being true.
func GeminiSchemaKeepingBounds(src map[string]any) map[string]any {
	return geminiSchema(src, true)
}

func geminiSchema(src map[string]any, keepBounds bool) map[string]any {
	out, _ := translateSchema(src, keepBounds)
	if out == nil || (out["type"] == nil && out["anyOf"] == nil) {
		out = map[string]any{"type": "OBJECT", "properties": map[string]any{}}
	}
	return out
}

// keptKeywords are the schema keywords copied through unchanged.
var keptKeywords = []string{"description", "format", "nullable"}

// boundKeywords are the length and range bounds. They are sent as constraints
// only when asked (keepBounds), and otherwise as a sentence in the description.
var boundKeywords = []string{"minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength"}

var geminiTypes = map[string]string{
	"string": "STRING", "number": "NUMBER", "integer": "INTEGER",
	"boolean": "BOOLEAN", "array": "ARRAY", "object": "OBJECT",
}

// boundHint describes the bounds of a schema in words, or "" if it has none.
func boundHint(src map[string]any) string {
	get := func(k string) (string, bool) {
		v, ok := src[k]
		if !ok {
			return "", false
		}
		return fmt.Sprint(v), true
	}
	var parts []string
	lo, hasLo := get("minimum")
	hi, hasHi := get("maximum")
	switch {
	case hasLo && hasHi:
		parts = append(parts, fmt.Sprintf("Between %s and %s", lo, hi))
	case hasLo:
		parts = append(parts, "At least "+lo)
	case hasHi:
		parts = append(parts, "At most "+hi)
	}
	if v, ok := get("minLength"); ok {
		parts = append(parts, "At least "+v+" characters")
	}
	if v, ok := get("maxLength"); ok {
		parts = append(parts, "At most "+v+" characters")
	}
	if v, ok := get("minItems"); ok {
		parts = append(parts, "At least "+v+" items")
	}
	if v, ok := get("maxItems"); ok {
		parts = append(parts, "At most "+v+" items")
	}
	return strings.Join(parts, ". ")
}

// translateSchema returns the translated schema and whether it is an object with
// no properties (which the caller omits).
func translateSchema(src map[string]any, keepBounds bool) (map[string]any, bool) {
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
	if keepBounds {
		for _, k := range boundKeywords {
			if v, ok := src[k]; ok {
				out[k] = v
			}
		}
	}
	if values := stringList(src["enum"]); len(values) > 0 {
		out["enum"] = values
	}

	// What the dropped keywords said, in words: the description, then the bounds,
	// then the pattern, as sentences joined with ". ".
	var sentences []string
	if d, ok := out["description"].(string); ok && d != "" {
		sentences = append(sentences, d)
	}
	if !keepBounds {
		if h := boundHint(src); h != "" {
			sentences = append(sentences, h)
		}
	}
	if p, ok := src["pattern"].(string); ok && p != "" {
		sentences = append(sentences, "Must match the regular expression "+p)
	}
	if len(sentences) > 0 {
		out["description"] = strings.Join(sentences, ". ")
	}

	variants := anyList(src["oneOf"])
	if len(variants) == 0 {
		variants = anyList(src["anyOf"])
	}
	if len(variants) > 0 {
		var translated []any
		for _, v := range variants {
			if m, ok := v.(map[string]any); ok {
				if t, empty := translateSchema(m, keepBounds); !empty {
					translated = append(translated, t)
				}
			}
		}
		out["anyOf"] = translated
	}

	if items, ok := src["items"].(map[string]any); ok {
		out["items"], _ = translateSchema(items, keepBounds)
	}

	if props, ok := src["properties"].(map[string]any); ok || typ == "object" {
		kept := map[string]any{}
		for name, raw := range props {
			if child, ok := raw.(map[string]any); ok {
				if t, empty := translateSchema(child, keepBounds); !empty {
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
