package main

// Tests for the pause/resume and revoke behavior added to `sandbox up`/`down`
// after real end-user testing of obsidian_memory/08.4's Phase 3 work found a
// real gap: `sandbox up` previously minted a brand-new agent identity on
// every call with no way to reuse a previous one, and no CLI command could
// revoke an agent at all (only the project owner's web UI could). See
// tryReuseExistingAgent and the `down --revoke` flag in sandbox.go.

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

// setSandboxTestHome redirects sandboxStateDir()/getClientConfig() to a fresh
// temp directory, matching the pattern sandboxagent_test.go's token-precedence
// tests already establish, and returns that directory.
func setSandboxTestHome(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("HOME", dir)
	t.Setenv("USERPROFILE", dir) // os.UserHomeDir() checks USERPROFILE on Windows, HOME elsewhere
	return dir
}

// writeTestClientConfig points getClientConfig()'s APIURL at a fake server so
// tryReuseExistingAgent/revokeAgent's HTTP calls (via makeRequest) can be
// asserted on without touching a real apps/api.
func writeTestClientConfig(t *testing.T, home, apiURL string) {
	t.Helper()
	dir := filepath.Join(home, ".infracanvas")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatalf("mkdir config dir: %v", err)
	}
	cfg := Config{APIURL: apiURL, Token: "test-token", SandboxAgentBeta: true}
	data, _ := json.Marshal(cfg)
	if err := os.WriteFile(filepath.Join(dir, "config.json"), data, 0600); err != nil {
		t.Fatalf("write config.json: %v", err)
	}
}

func TestClearSandboxStateRemovesAllAgentFiles(t *testing.T) {
	setSandboxTestHome(t)
	const agentID = "agent-clear-test"

	dir, err := sandboxStateDir()
	if err != nil {
		t.Fatalf("sandboxStateDir: %v", err)
	}
	files := []string{agentID + "_key", agentID + "_key.pub", agentID + "_token", "state.json"}
	for _, f := range files {
		if err := os.WriteFile(filepath.Join(dir, f), []byte("x"), 0600); err != nil {
			t.Fatalf("seed file %s: %v", f, err)
		}
	}

	clearSandboxState(agentID)

	for _, f := range files {
		if _, err := os.Stat(filepath.Join(dir, f)); !os.IsNotExist(err) {
			t.Errorf("expected %s to be removed, stat err = %v", f, err)
		}
	}
}

func TestClearSandboxStateDoesNotPanicWhenNothingExists(t *testing.T) {
	setSandboxTestHome(t)
	// No files ever written for this agent — must be a safe no-op, not a
	// crash on a missing file (os.Remove errors on the file above are
	// deliberately discarded for exactly this reason).
	clearSandboxState("agent-never-existed")
}

func TestTryReuseExistingAgentNoStateFile(t *testing.T) {
	setSandboxTestHome(t)
	cfg := &Config{APIURL: "http://unused.invalid"}

	if _, _, _, ok := tryReuseExistingAgent(cfg, "proj_1"); ok {
		t.Error("expected ok=false when no local sandbox state exists yet")
	}
}

func TestTryReuseExistingAgentProjectMismatch(t *testing.T) {
	setSandboxTestHome(t)
	cfg := &Config{APIURL: "http://unused.invalid"}

	if err := saveSandboxState(&sandboxState{AgentID: "agent-old", ProjectID: "proj_A", PID: 0}); err != nil {
		t.Fatalf("saveSandboxState: %v", err)
	}

	// Requesting a DIFFERENT project than the one locally tracked must never
	// reuse that project's agent — the single-agent-per-machine model means
	// switching projects should mint a fresh identity scoped to the new one.
	if _, _, _, ok := tryReuseExistingAgent(cfg, "proj_B"); ok {
		t.Error("expected ok=false when the tracked state belongs to a different project")
	}
}

// fakeAgentStatusServer stands in for apps/api's GET /api/projects/{id}/agents/{agentId}
// endpoint, always returning the given status.
func fakeAgentStatusServer(t *testing.T, status string) string {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": status, "key_fingerprint": "SHA256:fake"})
	}))
	t.Cleanup(srv.Close)
	return srv.URL
}

func TestTryReuseExistingAgentRevoked(t *testing.T) {
	home := setSandboxTestHome(t)
	apiURL := fakeAgentStatusServer(t, "REVOKED")
	writeTestClientConfig(t, home, apiURL)
	cfg, err := getClientConfig()
	if err != nil {
		t.Fatalf("getClientConfig: %v", err)
	}

	if err := saveSandboxState(&sandboxState{AgentID: "agent-revoked", ProjectID: "proj_1", PID: 0}); err != nil {
		t.Fatalf("saveSandboxState: %v", err)
	}

	if _, _, _, ok := tryReuseExistingAgent(cfg, "proj_1"); ok {
		t.Error("expected ok=false when the previously paired agent has been revoked server-side")
	}
}

func TestTryReuseExistingAgentSucceedsWithCachedToken(t *testing.T) {
	home := setSandboxTestHome(t)
	apiURL := fakeAgentStatusServer(t, "DISCONNECTED") // paused, not revoked — still reusable
	writeTestClientConfig(t, home, apiURL)
	cfg, err := getClientConfig()
	if err != nil {
		t.Fatalf("getClientConfig: %v", err)
	}

	const agentID = "agent-reusable"
	if err := saveSandboxState(&sandboxState{AgentID: agentID, ProjectID: "proj_1", PID: 0}); err != nil {
		t.Fatalf("saveSandboxState: %v", err)
	}

	dir, err := sandboxStateDir()
	if err != nil {
		t.Fatalf("sandboxStateDir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, agentID+"_key.pub"), []byte("ssh-rsa AAAA...\n"), 0644); err != nil {
		t.Fatalf("write cached pubkey: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, agentID+"_token"), []byte("cached-token"), 0600); err != nil {
		t.Fatalf("write cached token: %v", err)
	}

	gotID, gotPub, gotTok, ok := tryReuseExistingAgent(cfg, "proj_1")
	if !ok {
		t.Fatal("expected ok=true when the agent is registered, not revoked, and has a cached key+token")
	}
	if gotID != agentID {
		t.Errorf("agentID = %q, want %q", gotID, agentID)
	}
	if gotPub != "ssh-rsa AAAA...\n" {
		t.Errorf("publicKeyLine = %q, want the cached key content", gotPub)
	}
	if gotTok != "cached-token" {
		t.Errorf("token = %q, want the cached token (no re-pairing should have happened)", gotTok)
	}
}

func TestRevokeAgentCallsCorrectEndpoint(t *testing.T) {
	home := setSandboxTestHome(t)
	var gotMethod, gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()
	writeTestClientConfig(t, home, srv.URL)
	cfg, err := getClientConfig()
	if err != nil {
		t.Fatalf("getClientConfig: %v", err)
	}

	if err := revokeAgent(cfg, "proj_1", "agent-xyz"); err != nil {
		t.Fatalf("revokeAgent: %v", err)
	}
	if gotMethod != http.MethodPost {
		t.Errorf("method = %q, want POST", gotMethod)
	}
	if gotPath != "/api/projects/proj_1/agents/agent-xyz/revoke" {
		t.Errorf("path = %q, want /api/projects/proj_1/agents/agent-xyz/revoke", gotPath)
	}
}
