package main

// The local Sandbox Agent (`infracanvas sandbox agent-run`) and the SSH
// ProxyCommand bridge (`infracanvas sandbox proxy`) — both ported from the
// Phase 0 spike (spikes/sandbox-agent-protocol/internal/agent) for the Phase 1
// opt-in beta (see obsidian_memory/08.4 and 03.6). Both live in the same
// `infracanvas` binary rather than a separate module so the CLI stays a single
// distributable artifact (see apps/cli's existing CI release pipeline).

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/hashicorp/yamux"
	"github.com/spf13/cobra"
)

// wsAdapter wraps a *websocket.Conn as an io.ReadWriteCloser so yamux (in
// agent-run) or a plain byte splice (in proxy) can run over it exactly as they
// would over a raw TCP socket. Identical in spirit to
// spikes/sandbox-agent-protocol/internal/wsconn and
// apps/agent-gateway/internal/wsconn — duplicated here rather than shared
// across module boundaries, matching that spike's own precedent.
type wsAdapter struct {
	ws     *websocket.Conn
	reader io.Reader
}

func (c *wsAdapter) Read(p []byte) (int, error) {
	for {
		if c.reader == nil {
			msgType, r, err := c.ws.NextReader()
			if err != nil {
				return 0, err
			}
			if msgType != websocket.BinaryMessage {
				continue
			}
			c.reader = r
		}
		n, err := c.reader.Read(p)
		if n > 0 {
			return n, nil
		}
		if err == io.EOF {
			c.reader = nil
			continue
		}
		if err != nil {
			return 0, err
		}
	}
}

func (c *wsAdapter) Write(p []byte) (int, error) {
	if err := c.ws.WriteMessage(websocket.BinaryMessage, p); err != nil {
		return 0, err
	}
	return len(p), nil
}

func (c *wsAdapter) Close() error { return c.ws.Close() }

func splicePipe(a, b io.ReadWriteCloser) {
	done := make(chan struct{}, 2)
	go func() { io.Copy(a, b); done <- struct{}{} }()
	go func() { io.Copy(b, a); done <- struct{}{} }()
	<-done
}

func readLine(r io.Reader) (string, error) {
	var buf []byte
	b := make([]byte, 1)
	for {
		n, err := r.Read(b)
		if n == 1 {
			if b[0] == '\n' {
				return string(buf), nil
			}
			buf = append(buf, b[0])
		}
		if err != nil {
			return "", err
		}
	}
}

func writeLine(w io.Writer, s string) error {
	_, err := w.Write([]byte(s + "\n"))
	return err
}

// ---- sandbox agent-run (hidden — spawned in the background by `sandbox up`) ----

func sandboxAgentRunCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:    "agent-run",
		Hidden: true,
		Short:  "Internal: run the local Sandbox Agent process (spawned by `sandbox up`)",
		Run:    runSandboxAgentRun,
	}
	cmd.Flags().String("agent-id", "", "Agent ID this process registers as")
	cmd.Flags().String("gateway", "", "Agent Gateway base URL")
	return cmd
}

func runSandboxAgentRun(cmd *cobra.Command, args []string) {
	agentID, _ := cmd.Flags().GetString("agent-id")
	gatewayURL, _ := cmd.Flags().GetString("gateway")
	if agentID == "" || gatewayURL == "" {
		log.Fatal("sandbox agent-run: --agent-id and --gateway are required")
	}
	token, err := resolveAgentToken(agentID)
	if err != nil {
		log.Fatalf("sandbox agent-run: %v", err)
	}

	// context.Background(): this is a long-running background process
	// (spawned detached by `sandbox up`'s startAgentProcess) that only stops
	// via `sandbox down` killing its PID (sandboxState.PID in sandbox.go), so
	// runAgentReconnectLoop never returns here. The installed-service path
	// (`agent-service-run`, see sandboxservice.go) runs the same loop with a
	// cancellable context instead, so its Stop() can return promptly.
	_ = runAgentReconnectLoop(context.Background(), agentID, gatewayURL, token)
}

// resolveAgentToken prefers INFRACANVAS_AGENT_TOKEN (the env var
// startAgentProcess sets for the plain background-process path — kept so the
// secret never shows up in `ps`/process logs for that path) and falls back to
// the token file `sandbox up` also writes at pairing time
// (~/.infracanvas/sandbox/<agentID>_token, mode 0600 — see
// generateAgentKeyPair's private-key file for the same permission pattern).
// The file exists specifically so an installed OS service can read the token
// on every start, including after a reboot long after the `sandbox up`
// process that received it has exited — see obsidian_memory/08.4's Phase 2
// daemon-install entry.
func resolveAgentToken(agentID string) (string, error) {
	if tok := os.Getenv("INFRACANVAS_AGENT_TOKEN"); tok != "" {
		return tok, nil
	}
	path, err := agentTokenFilePath(agentID)
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("no INFRACANVAS_AGENT_TOKEN env var and no token file at %s (run `infracanvas sandbox up` first): %w", path, err)
	}
	return strings.TrimSpace(string(data)), nil
}

func agentTokenFilePath(agentID string) (string, error) {
	dir, err := sandboxStateDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, agentID+"_token"), nil
}

// buildAgentConnectURL builds the /agent/connect URL (including the
// allowed_services declaration — see obsidian_memory/03.6's security section,
// point 1) and the matching local-dial allowlist, shared by every caller of
// runAgentReconnectLoop.
func buildAgentConnectURL(gatewayURL, agentID, token string) (connectURL string, allowlist map[string]string, err error) {
	// Fixed allowlist matching the sandbox compose's exposed SSH ports (both
	// ubuntu_ssh_1:2222 and ubuntu_ssh_2:2223 — see
	// apps/cli/embedded/sandbox/docker-compose.sandbox.yml). This is the
	// security boundary from obsidian_memory/03.6: the Agent only ever
	// proxies to services it declares itself, never an arbitrary host:port
	// supplied by the Gateway/Runner. Reported to the Gateway itself via
	// allowed_services below, so the Gateway can enforce it independently of
	// this process's own per-stream ack/reject (see
	// obsidian_memory/08.4's Phase 2 allowlist-hardening entry).
	allowlist = map[string]string{
		"ssh:2222": "localhost:2222",
		"ssh:2223": "localhost:2223",
	}
	allowedServices := make([]string, 0, len(allowlist))
	for svc := range allowlist {
		allowedServices = append(allowedServices, svc)
	}
	sort.Strings(allowedServices)

	u, err := url.Parse(gatewayURL)
	if err != nil {
		return "", nil, fmt.Errorf("invalid gateway url: %w", err)
	}
	switch u.Scheme {
	case "http":
		u.Scheme = "ws"
	case "https":
		u.Scheme = "wss"
	}
	u.Path = "/agent/connect"
	q := u.Query()
	q.Set("token", token)
	q.Set("agent_id", agentID)
	q.Set("allowed_services", strings.Join(allowedServices, ","))
	u.RawQuery = q.Encode()
	return u.String(), allowlist, nil
}

// runAgentReconnectLoop builds the connect URL/allowlist once and then loops
// connectAndServe with exponential backoff until ctx is cancelled. Shared by
// the plain `sandbox agent-run` command (ctx = context.Background(), so this
// never returns on its own — a dial/session failure must never end that
// process, only the current attempt) and the installed-service program's
// Start/Stop (ctx cancelled by Stop, so this returns promptly and cleanly
// instead of relying on the OS to forcibly kill the process).
func runAgentReconnectLoop(ctx context.Context, agentID, gatewayURL, token string) error {
	connectURL, allowlist, err := buildAgentConnectURL(gatewayURL, agentID, token)
	if err != nil {
		return err
	}

	// Dead-tunnel detection itself is free (yamux's own keepalive — see the
	// comment in connectAndServe); this loop's only job is to reconnect after
	// that, with the same long-lived token (safe to reuse — see
	// obsidian_memory/08.4's Phase 2 heartbeat/reconnect entry: token lookup
	// on the Gateway side isn't single-use).
	backoff := newReconnectBackoff()
	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		connectedAt := time.Now()
		err := connectAndServe(ctx, connectURL, agentID, gatewayURL, allowlist)
		if ctx.Err() != nil {
			return ctx.Err()
		}
		log.Printf("sandbox agent-run: connection to gateway ended: %v", err)
		if time.Since(connectedAt) >= reconnectStableThreshold {
			backoff.reset()
		}
		delay := backoff.next()
		log.Printf("sandbox agent-run: reconnecting to %s in %s", gatewayURL, delay)
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(delay):
		}
	}
}

// connectAndServe dials the Gateway once, serves accepted streams until the
// session dies or ctx is cancelled, and returns the reason it ended. Never
// calls log.Fatal — the caller (runAgentReconnectLoop) decides how to react,
// so this function stays independently testable and safely re-callable
// across reconnects.
func connectAndServe(ctx context.Context, connectURL, agentID, gatewayURL string, allowlist map[string]string) error {
	ws, _, err := websocket.DefaultDialer.Dial(connectURL, nil)
	if err != nil {
		return fmt.Errorf("dial gateway: %w", err)
	}

	// yamux.DefaultConfig() enables a 30s keepalive ping with a 10s pong
	// timeout, so a dead tunnel (laptop sleep, WiFi drop) is detected and
	// this session closed within roughly 30-40s with no extra code here —
	// see obsidian_memory/08.4's Phase 2 heartbeat/reconnect entry.
	session, err := yamux.Client(&wsAdapter{ws: ws}, yamux.DefaultConfig())
	if err != nil {
		ws.Close()
		return fmt.Errorf("yamux client setup: %w", err)
	}
	defer session.Close()

	// Closing the session unblocks the Accept() loop below promptly when the
	// caller cancels ctx (e.g. an installed service's Stop()) — without this,
	// a cancelled context would have no effect until the next yamux keepalive
	// ping fails, up to ~30-40s later, which is too slow for an OS service
	// manager's stop timeout.
	stopWatch := make(chan struct{})
	defer close(stopWatch)
	go func() {
		select {
		case <-ctx.Done():
			session.Close()
		case <-stopWatch:
		}
	}()

	log.Printf("sandbox agent-run: connected to gateway %s as %s", gatewayURL, agentID)

	for {
		stream, err := session.Accept()
		if err != nil {
			return fmt.Errorf("tunnel closed: %w", err)
		}
		go handleAgentStream(stream, allowlist)
	}
}

// reconnectBackoff implements simple exponential backoff with a cap. A pure
// struct with no I/O, so it's directly unit-testable (see sandboxagent_test.go).
type reconnectBackoff struct {
	delay time.Duration
}

const (
	reconnectInitialDelay = 1 * time.Second
	reconnectMaxDelay     = 30 * time.Second
	reconnectGrowthFactor = 2
	// reconnectStableThreshold: a session that stayed up at least this long
	// counts as "was working," so backoff resets to reconnectInitialDelay
	// rather than staying maxed out from an earlier flaky period. Set above
	// yamux's ~30-40s dead-tunnel detection window so a connection that
	// merely survived one keepalive cycle isn't mistaken for "stable."
	reconnectStableThreshold = 60 * time.Second
)

func newReconnectBackoff() *reconnectBackoff { return &reconnectBackoff{} }

func (b *reconnectBackoff) reset() { b.delay = 0 }

// next returns the delay to sleep before the next attempt and advances
// internal state: reconnectInitialDelay on first call, doubling thereafter
// up to reconnectMaxDelay.
func (b *reconnectBackoff) next() time.Duration {
	if b.delay == 0 {
		b.delay = reconnectInitialDelay
	} else {
		b.delay *= reconnectGrowthFactor
		if b.delay > reconnectMaxDelay {
			b.delay = reconnectMaxDelay
		}
	}
	return b.delay
}

func handleAgentStream(stream net.Conn, allowlist map[string]string) {
	defer stream.Close()

	line, err := readLine(stream)
	if err != nil {
		log.Printf("sandbox agent-run: could not read stream header: %v", err)
		return
	}
	var header struct {
		Service string `json:"service"`
	}
	if err := json.Unmarshal([]byte(line), &header); err != nil {
		log.Printf("sandbox agent-run: malformed stream header %q: %v", line, err)
		return
	}

	target, allowed := allowlist[header.Service]
	if !allowed {
		log.Printf("sandbox agent-run: rejected stream for disallowed service %q", header.Service)
		writeLine(stream, "ERR: service not in agent allowlist")
		return
	}

	local, err := net.Dial("tcp", target)
	if err != nil {
		log.Printf("sandbox agent-run: could not dial local service %q (%s): %v", header.Service, target, err)
		writeLine(stream, fmt.Sprintf("ERR: local dial failed: %v", err))
		return
	}
	defer local.Close()

	if err := writeLine(stream, "OK"); err != nil {
		return
	}

	log.Printf("sandbox agent-run: proxying service %q -> %s", header.Service, target)
	splicePipe(stream, local)
}

// ---- sandbox proxy (hidden — the OpenSSH ProxyCommand target) ----

func sandboxProxyCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:    "proxy",
		Hidden: true,
		Short:  "Internal: SSH ProxyCommand bridge into the Gateway tunnel (spawned by OpenSSH via runner.go)",
		Run:    runSandboxProxy,
	}
	cmd.Flags().String("agent-id", "", "Target Agent ID")
	cmd.Flags().String("service", "", "Logical service to reach, e.g. ssh:2222")
	cmd.Flags().String("gateway", "", "Agent Gateway base URL")
	cmd.Flags().String("project", "", "Project ID (defaults to INFRACANVAS_AGENT_PROJECT_ID env var)")
	return cmd
}

func runSandboxProxy(cmd *cobra.Command, args []string) {
	agentID, _ := cmd.Flags().GetString("agent-id")
	service, _ := cmd.Flags().GetString("service")
	gatewayURL, _ := cmd.Flags().GetString("gateway")
	projectID, _ := cmd.Flags().GetString("project")
	if projectID == "" {
		projectID = os.Getenv("INFRACANVAS_AGENT_PROJECT_ID")
	}
	// Read from the environment, not a flag, so the secret never shows up in
	// `ps`/process logs on the Runner's host — set on the Runner's process env
	// alongside GATEWAY_URL (see apps/api/runner/runner.go's local_agent branch).
	secret := os.Getenv("INFRACANVAS_GATEWAY_SECRET")

	if agentID == "" || service == "" || gatewayURL == "" || projectID == "" || secret == "" {
		log.Fatal("sandbox proxy: --agent-id, --service, --gateway, a project id, and INFRACANVAS_GATEWAY_SECRET are all required")
	}

	u, err := url.Parse(gatewayURL)
	if err != nil {
		log.Fatalf("sandbox proxy: invalid gateway url: %v", err)
	}
	switch u.Scheme {
	case "http":
		u.Scheme = "ws"
	case "https":
		u.Scheme = "wss"
	}
	u.Path = "/runner/dial"
	q := u.Query()
	q.Set("agent_id", agentID)
	q.Set("service", service)
	q.Set("project_id", projectID)
	u.RawQuery = q.Encode()

	dialer := websocket.DefaultDialer
	header := map[string][]string{"X-Gateway-Runner-Secret": {secret}}
	ws, _, err := dialer.Dial(u.String(), header)
	if err != nil {
		log.Fatalf("sandbox proxy: dial gateway: %v", err)
	}
	defer ws.Close()

	conn := &wsAdapter{ws: ws}
	stdio := &stdioReadWriteCloser{}
	splicePipe(conn, stdio)
}

// stdioReadWriteCloser lets splicePipe treat os.Stdin/os.Stdout as one
// io.ReadWriteCloser — the literal contract OpenSSH's ProxyCommand expects: a
// child process that reads/writes the tunnel on its own stdin/stdout.
type stdioReadWriteCloser struct{}

func (stdioReadWriteCloser) Read(p []byte) (int, error)  { return os.Stdin.Read(p) }
func (stdioReadWriteCloser) Write(p []byte) (int, error) { return os.Stdout.Write(p) }
func (stdioReadWriteCloser) Close() error                { return nil }
