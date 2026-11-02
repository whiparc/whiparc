package aigen

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"api/catalog"
	"api/importer"
)

// Errors that reject the whole output. Anything less severe (one bad node, one
// bad parameter, one bad edge) is dropped or repaired and reported as a Warning,
// so a single stray field does not throw away an otherwise usable graph.
//
// The errors deliberately carry no text from the model, so a caller can return
// them to a client without reflecting model output.
var (
	ErrMalformed = errors.New("model output is not a valid graph document")
	ErrTooLarge  = errors.New("model output exceeds the node, edge or size limit")
	ErrEmpty     = errors.New("model output contains no valid nodes")
)

// maxRawBytes bounds what the validator will even parse.
const maxRawBytes = 256 << 10

// Warning codes, stable so the review UI can group them.
const (
	WarnBadNode        = "bad_node"
	WarnForbiddenField = "forbidden_field"
	WarnDuplicateRef   = "duplicate_ref"
	WarnUnknownType    = "unknown_type"
	WarnRestrictedType = "restricted_type"
	WarnUnknownParam   = "unknown_parameter"
	WarnParamLocked    = "parameter_not_settable"
	WarnInvalidParam   = "invalid_parameter"
	WarnRenamed        = "renamed"
	WarnDroppedEdge    = "dropped_edge"
	WarnNoHost         = "no_host"
)

type Warning struct {
	Code    string `json:"code"`
	Ref     string `json:"ref,omitempty"`
	Message string `json:"message"`
}

// Result is the validated proposal. Nodes have no positions yet; the caller
// passes them through importer.ArrangeNodesAndMerge.
type Result struct {
	Nodes    []importer.CanvasNode
	Edges    []importer.CanvasEdge
	Warnings []Warning
}

// forbiddenFields are never accepted on a node, whatever their value. They are
// how a custom (code-carrying) node, a credential binding or a deployment
// target would be smuggled in. A node carrying one is dropped, not repaired:
// it is a sign the model is steering somewhere it must not.
var forbiddenFields = []string{
	"isCustom", "rawCode", "codeType",
	"credentialId", "credential", "credentials",
	"projectId", "environment", "region", "gcpZone",
}

var refPattern = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9_-]*$`)

// patterns holds every compiled catalog pattern, built once at start-up.
var patterns = func() map[string]*regexp.Regexp {
	m := map[string]*regexp.Regexp{}
	for _, n := range catalog.All() {
		for _, p := range n.Params {
			if p.Pattern != "" {
				m[p.Pattern] = regexp.MustCompile(p.Pattern)
			}
		}
	}
	return m
}()

// Validate is the trust boundary between a model and a canvas. It builds the
// result from scratch out of allow-listed values, so nothing the model sent can
// reach the output unless a catalog rule admitted it.
func Validate(raw []byte) (*Result, error) { return ValidateWithUsed(raw, nil) }

// LabelKey identifies a resource label within its node type and parameter, the
// scope in which Terraform requires uniqueness.
func LabelKey(catalogID, paramKey, label string) string {
	return catalogID + "\x00" + paramKey + "\x00" + label
}

// UsedLabels collects the resource labels already present in a canvas'"'"'s nodes
// JSON, so a proposal added to that canvas does not duplicate them. Nodes it
// cannot place in the catalog (custom nodes, other technologies) are ignored.
func UsedLabels(nodesJSON string) map[string]bool {
	used := map[string]bool{}
	var nodes []struct {
		ID   string `json:"id"`
		Data struct {
			Parameters map[string]any `json:"parameters"`
		} `json:"data"`
	}
	if json.Unmarshal([]byte(nodesJSON), &nodes) != nil {
		return used
	}
	for _, n := range nodes {
		for _, cat := range catalog.AIGeneratable() {
			if !strings.HasPrefix(n.ID, cat.ID+"_") {
				continue
			}
			for _, p := range cat.Params {
				if s, ok := n.Data.Parameters[p.Key].(string); ok && p.ResourceLabel && s != "" {
					used[LabelKey(cat.ID, p.Key, s)] = true
				}
			}
		}
	}
	return used
}

// ValidateWithUsed is Validate for a proposal that will be added to a canvas
// already holding the given resource labels (see UsedLabels).
func ValidateWithUsed(raw []byte, used map[string]bool) (*Result, error) {
	if len(raw) > maxRawBytes {
		return nil, ErrTooLarge
	}

	var top struct {
		Nodes []json.RawMessage `json:"nodes"`
		Edges []json.RawMessage `json:"edges"`
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&top); err != nil {
		return nil, ErrMalformed
	}
	if _, err := dec.Token(); err != io.EOF {
		return nil, ErrMalformed // trailing content after the document
	}
	if len(top.Nodes) > catalog.MaxNodes || len(top.Edges) > catalog.MaxEdges {
		return nil, ErrTooLarge
	}

	v := &validation{res: &Result{Warnings: []Warning{}}, byRef: map[string]*proposed{}, used: used}
	for _, rn := range top.Nodes {
		v.node(rn)
	}
	v.uniqueLabels()
	if len(v.kept) == 0 {
		return nil, ErrEmpty
	}
	v.assignIDs()
	for _, re := range top.Edges {
		v.edge(re)
	}
	v.warnUnhosted()
	return v.res, nil
}

type proposed struct {
	ref     string
	cat     catalog.Node
	params  map[string]any
	dropped bool
	id      string
}

type validation struct {
	res   *Result
	kept  []*proposed
	byRef map[string]*proposed // every ref seen, including dropped nodes
	used  map[string]bool      // labels already on the target canvas

	out     map[string][]string // adjacency of accepted edges, by server ID
	in      map[string][]string
	edgeSet map[string]bool
}

func (v *validation) warn(code, ref, format string, args ...any) {
	v.res.Warnings = append(v.res.Warnings, Warning{Code: code, Ref: ref, Message: fmt.Sprintf(format, args...)})
}

// clip renders model-supplied text for a warning: quoted, so control characters
// are escaped, and bounded.
func clip(s string) string {
	r := []rune(s)
	if len(r) > 40 {
		s = string(r[:40]) + "..."
	}
	return strconv.Quote(s)
}

func (v *validation) node(rn json.RawMessage) {
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(rn, &obj); err != nil || obj == nil {
		v.warn(WarnBadNode, "", "a node entry was not an object and was dropped")
		return
	}

	var ref, typ string
	if json.Unmarshal(obj["ref"], &ref) != nil || len(ref) > catalog.MaxRefLen || !refPattern.MatchString(ref) {
		v.warn(WarnBadNode, "", "a node without a valid ref was dropped")
		return
	}
	p := &proposed{ref: ref}
	if _, dup := v.byRef[ref]; dup {
		v.warn(WarnDuplicateRef, ref, "node ref %s was used more than once; later entries were dropped", clip(ref))
		return
	}
	v.byRef[ref] = p
	p.dropped = true // until it has passed every check

	for _, f := range forbiddenFields {
		if _, present := obj[f]; present {
			v.warn(WarnForbiddenField, ref, "node %s was dropped: field %s is never accepted from a model", clip(ref), f)
			return
		}
	}

	if json.Unmarshal(obj["type"], &typ) != nil {
		v.warn(WarnBadNode, ref, "node %s has no type and was dropped", clip(ref))
		return
	}
	cat, ok := catalog.Get(typ)
	if !ok {
		v.warn(WarnUnknownType, ref, "node %s was dropped: unknown type %s", clip(ref), clip(typ))
		return
	}
	if !cat.AIGeneratable {
		v.warn(WarnRestrictedType, ref, "node %s was dropped: %s cannot be placed by AI mode", clip(ref), cat.ID)
		return
	}
	p.cat = cat
	p.params = catalog.Defaults(cat.ID)

	if raw, ok := obj["parameters"]; ok && string(bytes.TrimSpace(raw)) != "null" {
		var in map[string]json.RawMessage
		if err := json.Unmarshal(raw, &in); err != nil {
			v.warn(WarnInvalidParam, ref, "node %s: parameters was not an object; defaults were used", clip(ref))
		} else {
			keys := make([]string, 0, len(in))
			for k := range in {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			for _, k := range keys {
				def, ok := cat.Param(k)
				switch {
				case !ok:
					v.warn(WarnUnknownParam, ref, "node %s: unknown parameter %s was ignored", clip(ref), clip(k))
				case !def.AISettable:
					v.warn(WarnParamLocked, ref, "node %s: parameter %s is not settable by AI mode and was ignored", clip(ref), k)
				default:
					val, err := coerce(def, in[k])
					if err != nil {
						v.warn(WarnInvalidParam, ref, "node %s: parameter %s %v; the default was used", clip(ref), k, err)
					} else {
						p.params[k] = val
					}
				}
			}
		}
	}

	p.dropped = false
	v.kept = append(v.kept, p)
}

// coerce checks one model-supplied value against its catalog definition and
// returns it in the type the generators read.
func coerce(def catalog.Param, raw json.RawMessage) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var val any
	if err := dec.Decode(&val); err != nil {
		return nil, errors.New("is not valid JSON")
	}

	switch def.Type {
	case catalog.ParamBool:
		b, ok := val.(bool)
		if !ok {
			return nil, errors.New("must be a boolean")
		}
		return b, nil

	case catalog.ParamEnum:
		s, ok := val.(string)
		if ok {
			for _, e := range def.Enum {
				if s == e {
					return s, nil
				}
			}
		}
		return nil, errors.New("is not one of the allowed values")

	case catalog.ParamInt:
		n, err := toInt(val)
		if err != nil || n < def.Min || n > def.Max {
			return nil, fmt.Errorf("must be an integer between %d and %d", def.Min, def.Max)
		}
		return n, nil

	case catalog.ParamIntString:
		var n int
		switch x := val.(type) {
		case string:
			if !matches(def, x) {
				return nil, errors.New("is not a valid number")
			}
			i, err := strconv.Atoi(x)
			if err != nil {
				return nil, errors.New("is not a valid number")
			}
			n = i
		default:
			i, err := toInt(val)
			if err != nil {
				return nil, errors.New("is not a valid number")
			}
			n = i
		}
		if n < def.Min || n > def.Max {
			return nil, fmt.Errorf("must be between %d and %d", def.Min, def.Max)
		}
		return strconv.Itoa(n), nil

	case catalog.ParamString:
		s, ok := val.(string)
		if !ok || (def.MaxLen > 0 && len(s) > def.MaxLen) || !matches(def, s) {
			return nil, errors.New("has a value outside the allowed format")
		}
		return s, nil
	}
	return nil, errors.New("has an unsupported type")
}

func matches(def catalog.Param, s string) bool {
	re := patterns[def.Pattern]
	return re != nil && re.MatchString(s)
}

func toInt(val any) (int, error) {
	n, ok := val.(json.Number)
	if !ok {
		return 0, errors.New("not a number")
	}
	if i, err := strconv.ParseInt(n.String(), 10, 64); err == nil {
		if i > math.MaxInt32 || i < math.MinInt32 {
			return 0, errors.New("out of range")
		}
		return int(i), nil
	}
	f, err := strconv.ParseFloat(n.String(), 64)
	if err != nil || f != math.Trunc(f) || math.Abs(f) > math.MaxInt32 {
		return 0, errors.New("not an integer")
	}
	return int(f), nil
}

// uniqueLabels keeps resource labels unique per node type. The generators use
// them as Terraform resource labels, so two nodes sharing one produce a
// configuration Terraform rejects. This is routine (a model that omits names
// gives both subnets the default), so the later node is renamed, not dropped.
func (v *validation) uniqueLabels() {
	seen := map[string]bool{}
	for k := range v.used {
		seen[k] = true
	}
	var kept []*proposed
	for _, p := range v.kept {
		ok := true
		for _, def := range p.cat.Params {
			if !def.ResourceLabel {
				continue
			}
			label, _ := p.params[def.Key].(string)
			key := func(l string) string { return LabelKey(p.cat.ID, def.Key, l) }
			if seen[key(label)] {
				renamed := ""
				for n := 2; n < 100 && renamed == ""; n++ {
					for _, sep := range []string{"_", "-"} {
						cand := label + sep + strconv.Itoa(n)
						if (def.MaxLen == 0 || len(cand) <= def.MaxLen) && matches(def, cand) && !seen[key(cand)] {
							renamed = cand
							break
						}
					}
				}
				if renamed == "" {
					v.warn(WarnBadNode, p.ref, "node %s was dropped: its %s %s is already used and no variant fits", clip(p.ref), def.Key, clip(label))
					p.dropped = true
					ok = false
					break
				}
				v.warn(WarnRenamed, p.ref, "node %s: %s %s was already used and was renamed to %s", clip(p.ref), def.Key, clip(label), renamed)
				p.params[def.Key] = renamed
				label = renamed
			}
			seen[key(label)] = true
		}
		if ok {
			kept = append(kept, p)
		}
	}
	v.kept = kept
}

// assignIDs gives every kept node a server-chosen canvas ID. Model refs are
// used only to resolve edges and are then discarded.
func (v *validation) assignIDs() {
	counters := map[string]int{}
	for _, p := range v.kept {
		counters[p.cat.ID]++
		p.id = fmt.Sprintf("%s_%d", p.cat.ID, counters[p.cat.ID])

		label := p.cat.Title
		for _, def := range p.cat.Params {
			if def.ResourceLabel {
				if s, ok := p.params[def.Key].(string); ok && s != "" {
					label = s
				}
				break
			}
		}
		v.res.Nodes = append(v.res.Nodes, importer.CanvasNode{
			ID:   p.id,
			Type: "customNode",
			Data: importer.NodeData{
				Label:         label,
				Tech:          string(p.cat.Tech),
				Icon:          p.cat.Icon,
				CategoryLabel: p.cat.Category,
				Description:   p.cat.Description,
				Status:        "Validated",
				StatusText:    "AI generated",
				Parameters:    p.params,
			},
		})
	}
	v.out, v.in, v.edgeSet = map[string][]string{}, map[string][]string{}, map[string]bool{}
}

func (v *validation) edge(re json.RawMessage) {
	var obj map[string]json.RawMessage
	var src, tgt string
	if json.Unmarshal(re, &obj) != nil || obj == nil ||
		json.Unmarshal(obj["source"], &src) != nil || json.Unmarshal(obj["target"], &tgt) != nil {
		v.warn(WarnDroppedEdge, "", "an edge without a valid source and target was dropped")
		return
	}
	s, t := v.byRef[src], v.byRef[tgt]
	desc := clip(src) + " -> " + clip(tgt)
	switch {
	case s == nil || t == nil || s.dropped || t.dropped:
		v.warn(WarnDroppedEdge, "", "edge %s was dropped: an endpoint does not exist", desc)
	case s == t:
		v.warn(WarnDroppedEdge, "", "edge %s was dropped: a node cannot connect to itself", desc)
	case v.edgeSet[s.id+"\x00"+t.id]:
		v.warn(WarnDroppedEdge, "", "edge %s was dropped: duplicate", desc)
	case !catalog.AllowedEdge(s.cat.ID, t.cat.ID):
		v.warn(WarnDroppedEdge, "", "edge %s was dropped: %s cannot connect to %s", desc, s.cat.ID, t.cat.ID)
	case v.reaches(t.id, s.id):
		v.warn(WarnDroppedEdge, "", "edge %s was dropped: it would create a cycle", desc)
	default:
		v.edgeSet[s.id+"\x00"+t.id] = true
		v.out[s.id] = append(v.out[s.id], t.id)
		v.in[t.id] = append(v.in[t.id], s.id)
		v.res.Edges = append(v.res.Edges, importer.CanvasEdge{
			ID:        fmt.Sprintf("e_%s_%s", s.id, t.id),
			Source:    s.id,
			Target:    t.id,
			MarkerEnd: map[string]interface{}{"type": "arrow"},
		})
	}
}

// reaches reports whether to is reachable from from along accepted edges.
func (v *validation) reaches(from, to string) bool {
	seen := map[string]bool{from: true}
	stack := []string{from}
	for len(stack) > 0 {
		cur := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		if cur == to {
			return true
		}
		for _, next := range v.out[cur] {
			if !seen[next] {
				seen[next] = true
				stack = append(stack, next)
			}
		}
	}
	return false
}

// warnUnhosted flags Ansible tasks with no provisioned host upstream. The
// runner binds a task's host from the VM it descends from, so such a task has
// nothing to run against. It is a warning, not a rejection: the user may wire
// it to a host of their own before running.
func (v *validation) warnUnhosted() {
	typeOf := map[string]string{}
	for _, p := range v.kept {
		typeOf[p.id] = p.cat.ID
	}
	for _, p := range v.kept {
		if p.cat.Tech != catalog.TechAnsible {
			continue
		}
		seen := map[string]bool{p.id: true}
		stack := []string{p.id}
		hosted := false
		for len(stack) > 0 && !hosted {
			cur := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			for _, up := range v.in[cur] {
				if t := typeOf[up]; t == "aws_instance.web_server" || t == "aws_db_instance" {
					hosted = true
					break
				}
				if !seen[up] {
					seen[up] = true
					stack = append(stack, up)
				}
			}
		}
		if !hosted {
			v.warn(WarnNoHost, p.ref, "node %s (%s) has no provisioned host upstream and will have nothing to run against", clip(p.ref), p.cat.ID)
		}
	}
}
