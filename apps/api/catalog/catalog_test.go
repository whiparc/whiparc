package catalog

import (
	"encoding/json"
	"os"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

// Characters that would break out of a quoted HCL or YAML value, or start an
// interpolation, in the generators that paste string parameters in unescaped.
var injectionProbes = []string{`a"b`, `a\b`, `a$b`, "a\nb", `a${x}b`, `a"; rm -rf /; "`}

func TestCatalogStructure(t *testing.T) {
	seen := map[string]bool{}
	for _, n := range All() {
		if n.ID == "" || n.Title == "" || n.Tech == "" {
			t.Errorf("node %q is missing ID, Title or Tech", n.ID)
		}
		if seen[n.ID] {
			t.Errorf("duplicate catalog ID %q", n.ID)
		}
		seen[n.ID] = true

		keys := map[string]bool{}
		for _, p := range n.Params {
			if keys[p.Key] {
				t.Errorf("%s: duplicate param %q", n.ID, p.Key)
			}
			keys[p.Key] = true
		}
	}
	if len(All()) == 0 {
		t.Fatal("empty catalog")
	}
}

func TestParamsAreSelfConsistent(t *testing.T) {
	for _, n := range All() {
		for _, p := range n.Params {
			id := n.ID + "." + p.Key
			switch p.Type {
			case ParamString, ParamIntString:
				if p.Pattern == "" {
					t.Errorf("%s: string parameter has no Pattern", id)
					continue
				}
				re, err := regexp.Compile(p.Pattern)
				if err != nil {
					t.Errorf("%s: bad Pattern: %v", id, err)
					continue
				}
				if !strings.HasPrefix(p.Pattern, "^") || !strings.HasSuffix(p.Pattern, "$") {
					t.Errorf("%s: Pattern must be anchored", id)
				}
				def, ok := p.Default.(string)
				if !ok {
					t.Errorf("%s: default %v is not a string", id, p.Default)
					continue
				}
				if !re.MatchString(def) {
					t.Errorf("%s: default %q does not match its own Pattern", id, def)
				}
				if p.Type == ParamIntString {
					v, err := strconv.Atoi(def)
					if err != nil || v < p.Min || v > p.Max {
						t.Errorf("%s: default %q outside [%d,%d]", id, def, p.Min, p.Max)
					}
				}
			case ParamInt:
				v, ok := p.Default.(int)
				if !ok || v < p.Min || v > p.Max {
					t.Errorf("%s: default %v not an int within [%d,%d]", id, p.Default, p.Min, p.Max)
				}
			case ParamBool:
				if _, ok := p.Default.(bool); !ok {
					t.Errorf("%s: default %v is not a bool", id, p.Default)
				}
			case ParamEnum:
				def, _ := p.Default.(string)
				found := false
				for _, e := range p.Enum {
					if e == def {
						found = true
					}
				}
				if !found {
					t.Errorf("%s: default %q not in Enum %v", id, def, p.Enum)
				}
			default:
				t.Errorf("%s: unknown ParamType %q", id, p.Type)
			}
		}
	}
}

// Anything a model may set, and that is pasted unescaped into generated HCL or
// YAML, must not be able to carry a quote, backslash, dollar sign or newline.
func TestAISettableStringsCannotCarryInjection(t *testing.T) {
	for _, n := range All() {
		for _, p := range n.Params {
			if !p.AISettable || (p.Type != ParamString && p.Type != ParamIntString) {
				continue
			}
			re := regexp.MustCompile(p.Pattern)
			for _, probe := range injectionProbes {
				if re.MatchString(probe) {
					t.Errorf("%s.%s: Pattern %s accepts injection probe %q", n.ID, p.Key, p.Pattern, probe)
				}
			}
		}
	}
}

// Nodes a model may not place must not expose any model-settable parameter,
// and the dangerous classes must stay out of the generatable set.
func TestRestrictedNodesAreFullyLocked(t *testing.T) {
	for _, n := range All() {
		if n.AIGeneratable {
			continue
		}
		for _, p := range n.Params {
			if p.AISettable {
				t.Errorf("%s is not AI-generatable but %s is AISettable", n.ID, p.Key)
			}
		}
	}
	for _, id := range []string{"shell_command", "git_clone", "file_copy", "deploy-node-app", "copy-env", "aws_target"} {
		n, ok := Get(id)
		if !ok {
			t.Errorf("%s missing from catalog", id)
			continue
		}
		if n.AIGeneratable {
			t.Errorf("%s must never be AI-generatable", id)
		}
	}
}

// Credentials, platform-wired IDs and destructive flags are never model-chosen.
func TestSensitiveParamsAreNotAISettable(t *testing.T) {
	sensitive := map[string][]string{
		"aws_db_instance":         {"password", "vpcSecurityGroupIds", "dbSubnetGroupName"},
		"postgresql":              {"dbPass", "ansibleHost"},
		"aws_instance.web_server": {"amiId", "subnetId", "securityGroupId"},
		"aws_security_group":      {"vpcId"},
		"aws_subnet":              {"vpcId"},
		"aws_s3_bucket":           {"forceDestroy"},
	}
	for id, keys := range sensitive {
		n, ok := Get(id)
		if !ok {
			t.Errorf("%s missing", id)
			continue
		}
		for _, k := range keys {
			p, ok := n.Param(k)
			if !ok {
				t.Errorf("%s.%s missing", id, k)
			} else if p.AISettable {
				t.Errorf("%s.%s must not be AISettable", id, k)
			}
		}
	}
}

func TestEdgeRulesOnlyJoinGeneratableNodes(t *testing.T) {
	for from, tos := range edgeRules {
		f, ok := Get(from)
		if !ok || !f.AIGeneratable {
			t.Errorf("edge source %q is not an AI-generatable catalog node", from)
		}
		for to := range tos {
			n, ok := Get(to)
			if !ok || !n.AIGeneratable {
				t.Errorf("edge target %q (from %q) is not an AI-generatable catalog node", to, from)
			}
		}
	}
	if !AllowedEdge("aws_vpc", "aws_subnet") || !AllowedEdge("aws_instance.web_server", "nginx") {
		t.Error("expected core edges to be allowed")
	}
	if AllowedEdge("nginx", "aws_vpc") || AllowedEdge("aws_vpc", "aws_vpc") || AllowedEdge("shell_command", "nginx") {
		t.Error("unexpected edge allowed")
	}
}

func TestDefaultsReturnsFreshMap(t *testing.T) {
	a := Defaults("aws_vpc")
	a["vpcName"] = "mutated"
	if b := Defaults("aws_vpc"); b["vpcName"] != "app_vpc" {
		t.Errorf("Defaults leaked a mutation: %v", b["vpcName"])
	}
	if Defaults("nope") != nil {
		t.Error("unknown ID should return nil")
	}
}

func TestJSONSchemaOffersOnlyGeneratableNodesAndSettableParams(t *testing.T) {
	raw, err := json.Marshal(JSONSchema())
	if err != nil {
		t.Fatal(err)
	}
	s := string(raw)

	for _, n := range All() {
		offered := strings.Contains(s, `"const":"`+n.ID+`"`)
		if offered != n.AIGeneratable {
			t.Errorf("%s: offered in schema = %v, AIGeneratable = %v", n.ID, offered, n.AIGeneratable)
		}
		for _, p := range n.Params {
			if !n.AIGeneratable || p.AISettable {
				continue
			}
			// A non-settable key must not appear as a property key for its node.
			if strings.Contains(s, `"`+p.Key+`":{"type"`) && keyIsSettableElsewhere(n, p.Key) == false {
				t.Errorf("%s.%s is not AISettable but appears in the schema", n.ID, p.Key)
			}
		}
	}
	for _, banned := range []string{"password", "dbPass", "rawCode", "isCustom", "credentialId", "command"} {
		if strings.Contains(s, `"`+banned+`"`) {
			t.Errorf("schema must not mention %q", banned)
		}
	}
}

// keyIsSettableElsewhere avoids a false positive when a key name is settable on
// another node (for example "state" or "cidrBlock").
func keyIsSettableElsewhere(except Node, key string) bool {
	for _, n := range AIGeneratable() {
		if n.ID == except.ID {
			continue
		}
		if p, ok := n.Param(key); ok && p.AISettable {
			return true
		}
	}
	return false
}

func readRepoFile(t *testing.T, rel string) string {
	t.Helper()
	b, err := os.ReadFile(rel)
	if err != nil {
		t.Skipf("source file %s not available: %v", rel, err)
	}
	return string(b)
}

// The frontend library is where users get nodes. Every library node must be in
// the catalog or explicitly deferred, and every catalog node must exist there
// with the same tech.
func TestCatalogMatchesFrontendLibrary(t *testing.T) {
	src := readRepoFile(t, "../../web/app/workspace/page.tsx")
	start := strings.Index(src, "const LIBRARY_NODES")
	if start < 0 {
		t.Fatal("LIBRARY_NODES not found in page.tsx; update this test")
	}
	block := src[start:]
	if end := strings.Index(block, "\n];"); end > 0 {
		block = block[:end]
	}
	re := regexp.MustCompile(`id:\s*'([^']+)',\s*tech:\s*'([^']+)'`)
	matches := re.FindAllStringSubmatch(block, -1)
	if len(matches) < 20 {
		t.Fatalf("parsed only %d library nodes; the source layout changed", len(matches))
	}

	library := map[string]string{}
	for _, m := range matches {
		library[m[1]] = m[2]
	}

	deferred := map[string]bool{}
	for _, id := range DeferredIDs {
		deferred[id] = true
	}

	for id := range library {
		if _, ok := Get(id); !ok && !deferred[id] {
			t.Errorf("frontend library node %q is neither in the catalog nor in DeferredIDs", id)
		}
	}
	for _, n := range All() {
		tech, ok := library[n.ID]
		if !ok {
			t.Errorf("catalog node %q is not in the frontend library", n.ID)
		} else if tech != string(n.Tech) {
			t.Errorf("%s: catalog tech %s, frontend tech %s", n.ID, n.Tech, tech)
		}
	}
	for id := range deferred {
		if _, ok := library[id]; !ok {
			t.Errorf("DeferredIDs lists %q, which is not in the frontend library", id)
		}
		if _, ok := Get(id); ok {
			t.Errorf("%q is both deferred and in the catalog", id)
		}
	}
}

// The Go fallback compiler is selected by ID prefix. The GoCompiler flag must
// say exactly which catalog nodes it has a branch for, so nobody assumes the
// server-side compile path covers a node it silently skips.
func TestGoCompilerFlagMatchesCompilerSource(t *testing.T) {
	src := readRepoFile(t, "../importer/compiler.go")
	for _, n := range All() {
		prefix := strings.SplitN(n.ID, ".", 2)[0]
		re := regexp.MustCompile(`HasPrefix\(\w+(\.\w+)?, "` + regexp.QuoteMeta(prefix) + `"\)`)
		has := re.MatchString(src)
		if has != n.GoCompiler {
			t.Errorf("%s: GoCompiler = %v but compiler.go dispatch present = %v", n.ID, n.GoCompiler, has)
		}
	}
}

// Every parameter key must be read by at least one generator; otherwise a model
// could be offered a knob that does nothing, or the catalog has drifted from the
// generators.
func TestParamKeysAreReadBySomeGenerator(t *testing.T) {
	generators := readRepoFile(t, "../importer/compiler.go") +
		readRepoFile(t, "../../web/app/lib/bundleGenerator.ts") +
		readRepoFile(t, "../../web/app/lib/exportYaml.ts")

	for _, n := range All() {
		for _, p := range n.Params {
			if p.Key == "ansibleHost" || p.Key == "ansibleUser" {
				continue // consumed by the runner's inventory binding, not a generator
			}
			if !regexp.MustCompile(`\b` + regexp.QuoteMeta(p.Key) + `\b`).MatchString(generators) {
				t.Errorf("%s.%s is not referenced by any generator", n.ID, p.Key)
			}
		}
	}
}

// The icon is copied into every node the validator emits, so it has to be the
// one the frontend library uses.
func TestIconsMatchFrontendLibrary(t *testing.T) {
	src := readRepoFile(t, "../../web/app/workspace/page.tsx")
	start := strings.Index(src, "const LIBRARY_NODES")
	if start < 0 {
		t.Fatal("LIBRARY_NODES not found in page.tsx; update this test")
	}
	re := regexp.MustCompile(`id:\s*'([^']+)',\s*tech:\s*'[^']+',\s*icon:\s*'([^']+)'`)
	library := map[string]string{}
	for _, m := range re.FindAllStringSubmatch(src[start:], -1) {
		library[m[1]] = m[2]
	}
	for _, n := range All() {
		if n.Icon == "" {
			t.Errorf("%s has no Icon", n.ID)
		} else if want, ok := library[n.ID]; ok && want != n.Icon {
			t.Errorf("%s: catalog icon %q, frontend icon %q", n.ID, n.Icon, want)
		}
	}
}

func TestResourceLabelParamsAreModelSettableStrings(t *testing.T) {
	count := 0
	for _, n := range All() {
		for _, p := range n.Params {
			if !p.ResourceLabel {
				continue
			}
			count++
			if p.Type != ParamString || !p.AISettable {
				t.Errorf("%s.%s: a resource label must be an AI-settable string", n.ID, p.Key)
			}
		}
	}
	if count == 0 {
		t.Error("no ResourceLabel params; the validator's uniqueness rule would do nothing")
	}
}

// RDS rejects hyphens in db_name and the master username.
func TestRDSIdentifiersExcludeHyphen(t *testing.T) {
	n, _ := Get("aws_db_instance")
	for _, k := range []string{"dbName", "username"} {
		p, _ := n.Param(k)
		if regexp.MustCompile(p.Pattern).MatchString("a-b") {
			t.Errorf("aws_db_instance.%s accepts a hyphen, which RDS rejects", k)
		}
	}
}

func TestSchemaOffersAnOptionalBoundedNotesList(t *testing.T) {
	s := JSONSchema()
	props := s["properties"].(map[string]any)
	notes, ok := props["notes"].(map[string]any)
	if !ok {
		t.Fatal("schema has no notes property")
	}
	if notes["maxItems"] != MaxNotes {
		t.Errorf("maxItems = %v", notes["maxItems"])
	}
	item := notes["items"].(map[string]any)
	if item["type"] != "string" || item["maxLength"] != MaxNoteLen {
		t.Errorf("items = %v", item)
	}
	for _, r := range s["required"].([]string) {
		if r == "notes" {
			t.Error("notes must stay optional: a model with nothing to report should not have to invent something")
		}
	}
}
