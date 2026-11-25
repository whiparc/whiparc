package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func exportReq(userID string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/api/auth/export", nil)
	if userID == "" {
		return r
	}
	return asUser(r, userID)
}

// The export is indented, which re-indents embedded JSON too, so compare the
// compacted form rather than the raw bytes.
func compactJSON(t *testing.T, raw json.RawMessage) string {
	t.Helper()
	var b bytes.Buffer
	if err := json.Compact(&b, raw); err != nil {
		t.Fatalf("not valid JSON %q: %v", raw, err)
	}
	return b.String()
}

func TestExportAccountRequiresAuth(t *testing.T) {
	withTestDB(t)
	w := httptest.NewRecorder()
	handleExportAccount(w, exportReq(""))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestExportAccountReturnsOwnDataOnly(t *testing.T) {
	withTestDB(t)
	seedUser(t, "u_me", "me@test.com")
	seedUser(t, "u_other", "other@test.com")

	seedTeamWithProject(t, "team_mine", "u_me", "proj_mine", "u_me")
	seedTeamWithProject(t, "team_theirs", "u_other", "proj_theirs", "u_other")
	// A project u_me created inside someone else's team: kept by that team,
	// so it is not part of u_me's export.
	seedTeamWithProject(t, "team_shared", "u_other", "proj_shared", "u_me")

	db.Exec(`UPDATE canvas_states SET nodes_json = '[{"id":"n1"}]', edges_json = '[{"id":"e1"}]', viewport_json = '{"zoom":2}' WHERE project_id = 'proj_mine'`)
	db.Exec("INSERT INTO custom_nodes (id, project_id, created_by, title, tech, code_type, raw_code) VALUES ('cn1', 'proj_mine', 'u_me', 'My node', 'Terraform', 'tf', 'resource \"x\" \"y\" {}')")
	db.Exec("INSERT INTO templates (id, author_user_id, title, nodes_json, edges_json) VALUES ('tpl_mine', 'u_me', 'Mine', '[]', '[]')")
	db.Exec("INSERT INTO templates (id, author_user_id, title, nodes_json, edges_json) VALUES ('tpl_theirs', 'u_other', 'Theirs', '[]', '[]')")

	w := httptest.NewRecorder()
	handleExportAccount(w, exportReq("u_me"))
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if cd := w.Header().Get("Content-Disposition"); !strings.HasPrefix(cd, "attachment;") || !strings.Contains(cd, ".json") {
		t.Errorf("expected a JSON attachment, got Content-Disposition %q", cd)
	}
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Errorf("export must not be cached, got %q", w.Header().Get("Cache-Control"))
	}

	var got accountExport
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("export is not valid JSON: %v", err)
	}

	if got.User.ID != "u_me" || got.User.Email != "me@test.com" {
		t.Errorf("wrong user in export: %+v", got.User)
	}
	if len(got.Teams) != 1 || got.Teams[0].ID != "team_mine" {
		t.Fatalf("expected only the owned team, got %+v", got.Teams)
	}
	projects := got.Teams[0].Projects
	if len(projects) != 1 || projects[0].ID != "proj_mine" {
		t.Fatalf("expected only the owned project, got %+v", projects)
	}
	p := projects[0]
	if p.Canvas == nil || compactJSON(t, p.Canvas.Nodes) != `[{"id":"n1"}]` || compactJSON(t, p.Canvas.Edges) != `[{"id":"e1"}]` || compactJSON(t, p.Canvas.Viewport) != `{"zoom":2}` {
		t.Errorf("canvas should be embedded as structured JSON, got %+v", p.Canvas)
	}
	if len(p.Snapshots) != 1 {
		t.Errorf("expected 1 snapshot, got %d", len(p.Snapshots))
	}
	if len(p.CustomNodes) != 1 || p.CustomNodes[0].Title != "My node" {
		t.Errorf("expected the custom node, got %+v", p.CustomNodes)
	}
	if len(got.Templates) != 1 || got.Templates[0].Title != "Mine" {
		t.Errorf("expected only the caller's template, got %+v", got.Templates)
	}
	if len(got.NotIncluded) == 0 {
		t.Error("export should state what it leaves out")
	}
}

// The export must never carry material that lets someone act as the user or
// reach their cloud accounts.
func TestExportAccountOmitsSecrets(t *testing.T) {
	withTestDB(t)
	seedUser(t, "u_me", "me@test.com")
	seedTeamWithProject(t, "team_mine", "u_me", "proj_mine", "u_me")
	db.Exec("INSERT INTO oauth_identities (id, user_id, provider, provider_user_id, access_token) VALUES ('oi1', 'u_me', 'github', 'gh1', 'SECRET-OAUTH-TOKEN')")

	var hash string
	if err := db.QueryRow("SELECT password_hash FROM users WHERE id = 'u_me'").Scan(&hash); err != nil || hash == "" {
		t.Fatalf("test needs a stored password hash: %v", err)
	}

	w := httptest.NewRecorder()
	handleExportAccount(w, exportReq("u_me"))
	body := w.Body.String()

	for _, secret := range []string{hash, "SECRET-OAUTH-TOKEN", "key_fingerprint", "encrypted_data", "password_hash", "access_token"} {
		if strings.Contains(body, secret) {
			t.Errorf("export leaks %q", secret)
		}
	}
}

func TestExportAccountWithNoProjectsIsValidAndEmpty(t *testing.T) {
	withTestDB(t)
	seedUser(t, "u_new", "new@test.com")

	w := httptest.NewRecorder()
	handleExportAccount(w, exportReq("u_new"))
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	// Empty collections must be [] not null, so consumers can iterate them.
	if !strings.Contains(w.Body.String(), `"teams": []`) || !strings.Contains(w.Body.String(), `"templates": []`) {
		t.Errorf("empty collections should serialize as [], got %s", w.Body.String())
	}
}

func TestExportAccountSurvivesCorruptCanvasJSON(t *testing.T) {
	withTestDB(t)
	seedUser(t, "u_me", "me@test.com")
	seedTeamWithProject(t, "team_mine", "u_me", "proj_mine", "u_me")
	db.Exec("UPDATE canvas_states SET nodes_json = 'not json {' WHERE project_id = 'proj_mine'")

	w := httptest.NewRecorder()
	handleExportAccount(w, exportReq("u_me"))
	if w.Code != http.StatusOK {
		t.Fatalf("one corrupt row must not fail the export, got %d: %s", w.Code, w.Body.String())
	}
	var got accountExport
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("export is not valid JSON: %v", err)
	}
	if string(got.Teams[0].Projects[0].Canvas.Nodes) != `"not json {"` {
		t.Errorf("corrupt column should be kept as a string, got %s", got.Teams[0].Projects[0].Canvas.Nodes)
	}
}

func TestExportAccountRateLimited(t *testing.T) {
	withTestDB(t)
	exportLimiter = NewRateLimiter(1, time.Hour, 2)
	seedUser(t, "u_me", "me@test.com")

	var last int
	for i := 0; i < 4; i++ {
		w := httptest.NewRecorder()
		handleExportAccount(w, exportReq("u_me"))
		last = w.Code
	}
	if last != http.StatusTooManyRequests {
		t.Fatalf("expected 429 after repeated exports, got %d", last)
	}
}
