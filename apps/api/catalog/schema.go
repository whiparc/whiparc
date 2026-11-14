package catalog

// JSONSchema returns the JSON Schema describing the only graph shape a model
// may produce: a bounded list of catalog nodes with model-local refs, and edges
// between those refs. It is derived from the manifest, so the schema handed to a
// provider can never offer a node or parameter the validator would then reject
// as unknown.
//
// The schema is a request-side constraint, not a trust boundary. A provider can
// ignore it, so the output is validated again against the same manifest.
func JSONSchema() map[string]any {
	var variants []any
	for _, n := range AIGeneratable() {
		variants = append(variants, nodeSchema(n))
	}

	return map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"required":             []string{"nodes", "edges"},
		"properties": map[string]any{
			"nodes": map[string]any{
				"type":     "array",
				"maxItems": MaxNodes,
				"items":    map[string]any{"oneOf": variants},
			},
			// Optional. Only meaningful when no nodes are returned; the validator
			// ignores it otherwise.
			"decline": map[string]any{"type": "string", "enum": DeclineReasons},
			"notes": map[string]any{
				"type":     "array",
				"maxItems": MaxNotes,
				"items":    map[string]any{"type": "string", "maxLength": MaxNoteLen},
			},
			"edges": map[string]any{
				"type":     "array",
				"maxItems": MaxEdges,
				"items": map[string]any{
					"type":                 "object",
					"additionalProperties": false,
					"required":             []string{"source", "target"},
					"properties": map[string]any{
						"source": refSchema(),
						"target": refSchema(),
					},
				},
			},
		},
	}
}

func refSchema() map[string]any {
	return map[string]any{"type": "string", "pattern": `^[a-zA-Z][a-zA-Z0-9_-]*$`, "maxLength": MaxRefLen}
}

func nodeSchema(n Node) map[string]any {
	props := map[string]any{}
	for _, p := range n.Params {
		if p.AISettable {
			props[p.Key] = paramSchema(p)
		}
	}
	return map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"required":             []string{"ref", "type"},
		"properties": map[string]any{
			"ref":        refSchema(),
			"type":       map[string]any{"const": n.ID},
			"parameters": map[string]any{"type": "object", "additionalProperties": false, "properties": props},
		},
	}
}

func paramSchema(p Param) map[string]any {
	switch p.Type {
	case ParamInt:
		return map[string]any{"type": "integer", "minimum": p.Min, "maximum": p.Max}
	case ParamBool:
		return map[string]any{"type": "boolean"}
	case ParamEnum:
		return map[string]any{"type": "string", "enum": p.Enum}
	case ParamIntString:
		return map[string]any{"type": "string", "pattern": p.Pattern, "maxLength": p.MaxLen}
	default:
		return map[string]any{"type": "string", "pattern": p.Pattern, "maxLength": p.MaxLen}
	}
}
