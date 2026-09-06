// e2e_test.go is the Phase 0 proof: it wires the Gateway, Agent, fake SSH
// target, and device-authorization pairing together in one process and drives
// the exact path described in obsidian_memory/03.6's sequence diagram —
// Browser/Runner -> Gateway -> Agent -> local target -> back — over a real
// yamux-over-WebSocket tunnel. It does not touch apps/api/runner/runner.go or
// any production code path; see README.md for what Phase 0 does and does not
// cover.
package sandboxagentprotocol_test

import (
	"bufio"
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"

	"spikes/sandbox-agent-protocol/internal/agent"
	"spikes/sandbox-agent-protocol/internal/fakesshd"
	"spikes/sandbox-agent-protocol/internal/gateway"
	"spikes/sandbox-agent-protocol/internal/wsconn"
)

const (
	testAccountID = "acct_e2e"
	testProjectID = "proj_e2e"
)

// pairAgent runs the full device-authorization flow over HTTP against a live
// Gateway, exactly as `infracanvas sandbox up` and the browser approval page
// would (see obsidian_memory/06.3), and returns the scoped agent token.
func pairAgent(t *testing.T, gatewayURL string) string {
	t.Helper()

	resp, err := http.Post(gatewayURL+"/device/code", "application/json", nil)
	if err != nil {
		t.Fatalf("device/code: %v", err)
	}
	defer resp.Body.Close()
	var auth struct {
		DeviceCode string `json:"device_code"`
		UserCode   string `json:"user_code"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&auth); err != nil {
		t.Fatalf("decode device/code response: %v", err)
	}
	if auth.DeviceCode == "" || auth.UserCode == "" {
		t.Fatalf("expected non-empty device/user codes, got %+v", auth)
	}

	approveBody, _ := json.Marshal(map[string]string{
		"user_code":  auth.UserCode,
		"account_id": testAccountID,
		"project_id": testProjectID,
	})
	approveResp, err := http.Post(gatewayURL+"/device/approve", "application/json", bytes.NewReader(approveBody))
	if err != nil {
		t.Fatalf("device/approve: %v", err)
	}
	approveResp.Body.Close()
	if approveResp.StatusCode != http.StatusNoContent {
		t.Fatalf("device/approve: expected 204, got %d", approveResp.StatusCode)
	}

	tokenBody, _ := json.Marshal(map[string]string{"device_code": auth.DeviceCode})
	tokenResp, err := http.Post(gatewayURL+"/device/token", "application/json", bytes.NewReader(tokenBody))
	if err != nil {
		t.Fatalf("device/token: %v", err)
	}
	defer tokenResp.Body.Close()
	if tokenResp.StatusCode != http.StatusOK {
		t.Fatalf("device/token: expected 200, got %d", tokenResp.StatusCode)
	}
	var tokenOut struct {
		AgentToken string `json:"agent_token"`
	}
	if err := json.NewDecoder(tokenResp.Body).Decode(&tokenOut); err != nil {
		t.Fatalf("decode device/token response: %v", err)
	}
	if tokenOut.AgentToken == "" {
		t.Fatal("expected a non-empty agent token")
	}
	return tokenOut.AgentToken
}

// dialRunnerStream performs the Runner-side half of a dial: connect to the
// Gateway's /runner/dial endpoint for the given agent+service, scoped to
// account/project. It returns the resulting net.Conn (spliced through to the
// Agent's local target) plus the raw HTTP response for callers checking a
// rejection.
func dialRunnerStream(t *testing.T, gatewayWSURL, agentID, service, accountID, projectID string) (*wsconn.Conn, *http.Response, error) {
	t.Helper()

	u, err := url.Parse(gatewayWSURL + "/runner/dial")
	if err != nil {
		t.Fatalf("parse runner dial url: %v", err)
	}
	q := u.Query()
	q.Set("agent_id", agentID)
	q.Set("service", service)
	q.Set("account_id", accountID)
	q.Set("project_id", projectID)
	u.RawQuery = q.Encode()

	ws, resp, err := websocket.DefaultDialer.Dial(u.String(), nil)
	if err != nil {
		return nil, resp, err
	}
	return wsconn.New(ws), resp, nil
}

// TestEndToEndTunnelSSHExecAndLogStreaming is the core Phase 0 proof: pairing,
// tunnel establishment, and SSH-exec-over-tunnel with incremental (not batched)
// log streaming, all working end to end through the Gateway/Agent transport.
func TestEndToEndTunnelSSHExecAndLogStreaming(t *testing.T) {
	clientSigner, clientPub, err := fakesshd.GenerateKeyPair()
	if err != nil {
		t.Fatalf("generate client keypair: %v", err)
	}

	sshd, err := fakesshd.New(clientPub)
	if err != nil {
		t.Fatalf("start fake sshd: %v", err)
	}
	defer sshd.Close()

	gw := gateway.New("https://www.infracanvas.dev/pair")
	httpSrv := httptest.NewServer(gw.Mux())
	defer httpSrv.Close()
	wsURL := "ws" + strings.TrimPrefix(httpSrv.URL, "http")

	token := pairAgent(t, httpSrv.URL)

	ag, err := agent.Connect(httpSrv.URL, token, "agent-e2e", map[string]string{
		"ssh:2222": sshd.Addr(),
	})
	if err != nil {
		t.Fatalf("agent connect: %v", err)
	}
	defer ag.Close()
	go ag.Serve()

	// Give the Agent's yamux Accept loop a moment to be actively listening;
	// Open() on the Gateway side will otherwise just queue, but this keeps the
	// test deterministic without relying on that queuing behavior.
	time.Sleep(50 * time.Millisecond)

	conn, resp, err := dialRunnerStream(t, wsURL, "agent-e2e", "ssh:2222", testAccountID, testProjectID)
	if err != nil {
		t.Fatalf("runner dial: %v (resp=%v)", err, resp)
	}
	defer conn.Close()

	sshConn, chans, reqs, err := ssh.NewClientConn(conn, "sandbox-agent-tunnel", &ssh.ClientConfig{
		User:            "root",
		Auth:            []ssh.AuthMethod{ssh.PublicKeys(clientSigner)},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // spike only — production pins the agent-generated host key
		Timeout:         5 * time.Second,
	})
	if err != nil {
		t.Fatalf("ssh handshake over tunnel: %v", err)
	}
	sshClient := ssh.NewClient(sshConn, chans, reqs)
	defer sshClient.Close()

	session, err := sshClient.NewSession()
	if err != nil {
		t.Fatalf("new ssh session: %v", err)
	}
	defer session.Close()

	stdout, err := session.StdoutPipe()
	if err != nil {
		t.Fatalf("stdout pipe: %v", err)
	}

	const lineDelay = 60 * time.Millisecond
	if err := session.Start(`for i in 1 2 3; do echo "log line $i"; sleep 0.06; done`); err != nil {
		t.Fatalf("start exec: %v", err)
	}

	var lineTimes []time.Time
	var lines []string
	scanner := bufio.NewScanner(stdout)
	start := time.Now()
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
		lineTimes = append(lineTimes, time.Now())
	}
	if err := scanner.Err(); err != nil {
		t.Fatalf("scan stdout: %v", err)
	}
	if err := session.Wait(); err != nil {
		t.Fatalf("session wait: %v", err)
	}

	if len(lines) != 3 {
		t.Fatalf("expected 3 lines, got %d: %v", len(lines), lines)
	}
	for i, want := range []string{"log line 1", "log line 2", "log line 3"} {
		if lines[i] != want {
			t.Errorf("line %d: got %q, want %q", i, lines[i], want)
		}
	}

	// The real proof that this is streaming and not buffered-then-flushed: the
	// first line must have arrived well before the process finished (which
	// takes ~3*lineDelay). If the tunnel were silently buffering, every line
	// would arrive in a burst right at the end.
	firstLineLatency := lineTimes[0].Sub(start)
	totalLatency := lineTimes[len(lineTimes)-1].Sub(start)
	if firstLineLatency >= totalLatency {
		t.Fatalf("expected first line before total completion; first=%v total=%v", firstLineLatency, totalLatency)
	}
	if totalLatency < 2*lineDelay {
		t.Fatalf("all lines arrived too quickly (%v) to have been streamed incrementally with %v delays", totalLatency, lineDelay)
	}
	t.Logf("streamed 3 lines over tunnel: first line at %v, last at %v", firstLineLatency, totalLatency)
}

// TestGatewayRejectsDisallowedService proves the Agent-side allowlist described
// in 03.6 actually blocks a service the Agent did not register — the tunnel
// must not become a general-purpose proxy to whatever the Runner/Gateway asks
// for.
func TestGatewayRejectsDisallowedService(t *testing.T) {
	_, clientPub, err := fakesshd.GenerateKeyPair() // only the pubkey seeds fakesshd; this test never authenticates
	if err != nil {
		t.Fatalf("generate client keypair: %v", err)
	}

	sshd, err := fakesshd.New(clientPub)
	if err != nil {
		t.Fatalf("start fake sshd: %v", err)
	}
	defer sshd.Close()

	gw := gateway.New("https://www.infracanvas.dev/pair")
	httpSrv := httptest.NewServer(gw.Mux())
	defer httpSrv.Close()
	wsURL := "ws" + strings.TrimPrefix(httpSrv.URL, "http")

	token := pairAgent(t, httpSrv.URL)

	ag, err := agent.Connect(httpSrv.URL, token, "agent-reject", map[string]string{
		"ssh:2222": sshd.Addr(), // note: NOT "localstack:4566"
	})
	if err != nil {
		t.Fatalf("agent connect: %v", err)
	}
	defer ag.Close()
	go ag.Serve()

	time.Sleep(50 * time.Millisecond)

	_, resp, err := dialRunnerStream(t, wsURL, "agent-reject", "localstack:4566", testAccountID, testProjectID)
	if err == nil {
		t.Fatal("expected the dial to be rejected, but it succeeded")
	}
	if resp == nil {
		t.Fatalf("expected an HTTP response explaining the rejection, got none (err=%v)", err)
	}
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden, got %d", resp.StatusCode)
	}
}

// TestGatewayRejectsCrossTenantDial proves the account/project scoping check in
// 03.6: a dial request whose account/project does not match the target Agent's
// registered scope must be rejected before any stream to the Agent is even
// opened, so one tenant's Runner traffic can never reach another tenant's
// laptop.
func TestGatewayRejectsCrossTenantDial(t *testing.T) {
	_, clientPub, err := fakesshd.GenerateKeyPair()
	if err != nil {
		t.Fatalf("generate client keypair: %v", err)
	}

	sshd, err := fakesshd.New(clientPub)
	if err != nil {
		t.Fatalf("start fake sshd: %v", err)
	}
	defer sshd.Close()

	gw := gateway.New("https://www.infracanvas.dev/pair")
	httpSrv := httptest.NewServer(gw.Mux())
	defer httpSrv.Close()
	wsURL := "ws" + strings.TrimPrefix(httpSrv.URL, "http")

	token := pairAgent(t, httpSrv.URL)

	ag, err := agent.Connect(httpSrv.URL, token, "agent-tenant", map[string]string{
		"ssh:2222": sshd.Addr(),
	})
	if err != nil {
		t.Fatalf("agent connect: %v", err)
	}
	defer ag.Close()
	go ag.Serve()

	time.Sleep(50 * time.Millisecond)

	_, resp, err := dialRunnerStream(t, wsURL, "agent-tenant", "ssh:2222", "some-other-account", "some-other-project")
	if err == nil {
		t.Fatal("expected the cross-tenant dial to be rejected, but it succeeded")
	}
	if resp == nil || resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden, got resp=%v err=%v", resp, err)
	}
}
