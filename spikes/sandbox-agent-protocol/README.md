# Sandbox Agent Protocol Spike (Phase 0)

Standalone prototype for the yamux-over-WebSocket tunnel described in
[`obsidian_memory/03.6 - Remote Sandbox Agent & Bridging Connection
Protocol`](../../obsidian_memory/03%20-%20Execution%20Runner%20&%20DevOps%20Sandbox/03.6%20-%20Remote%20Sandbox%20Agent%20&%20Bridging%20Connection%20Protocol.md),
built to satisfy exactly the Phase 0 scope in
[`obsidian_memory/08.4 - Local Sandbox Agent Rollout & Migration Plan`](<../../obsidian_memory/08%20-%20Roadmap%20&%20Future%20Development/08.4%20-%20Local%20Sandbox%20Agent%20Rollout%20&%20Migration%20Plan.md>):

> Prototype the yamux-over-WebSocket tunnel between two local processes,
> independent of the real Runner. Validate SSH-exec-over-tunnel and log
> streaming work end to end against a throwaway "fake local agent" target
> before touching `runner.go`. Get device-authorization pairing working
> standalone. Goal: prove the transport, not ship a feature.

## What this is

- A separate Go module (`spikes/sandbox-agent-protocol/go.mod`), deliberately
  outside `apps/`, so it cannot be imported by `apps/api` or `apps/cli` and
  cannot regress anything in production. Nothing here is wired into
  `apps/api/runner/runner.go`, `apps/api/main.go`, or `apps/cli/main.go`.
- `internal/wsconn` — wraps a `gorilla/websocket` connection as an
  `io.ReadWriteCloser` so `hashicorp/yamux` can multiplex over it exactly as it
  would over a raw TCP socket.
- `internal/pairing` — an RFC 8628-style device-authorization flow
  (`device_code`/`user_code` issuance, browser approval, polling, scoped
  token issuance), independently testable with no networking involved.
- `internal/gateway` — the Agent Gateway: authenticates an Agent's inbound
  WebSocket connection, keeps one `yamux.Session` per `agent_id`, and on a
  Runner-side dial request opens a new logical stream and splices bytes.
  Enforces the account/project scoping rule from 03.6 (a dial request can
  never be routed to an `agent_id` outside its own tenant).
- `internal/agent` — the local Sandbox Agent: dials the Gateway outbound,
  opens a yamux client session, and for every stream the Gateway opens,
  checks the requested logical service against a fixed allowlist before
  dialing anything locally. This is the security boundary from 03.6 — the
  tunnel must never become a general outbound proxy.
- `internal/fakesshd` — a throwaway SSH server (not the real sandbox
  containers) used only to prove SSH-exec-over-tunnel and *incremental* log
  streaming (not batched/buffered output) survive the transport end to end.

## What this is not

- Not the Agent Gateway, Agent, or CLI that ship in Phase 1. Those are real
  services/binaries wired into the existing Runner, `infracanvas` CLI, and
  DevOps Sandbox containers.
- No heartbeat/reconnect UX, destination-allowlist hardening beyond the basic
  check, rate limiting, or daemon install path — all explicitly Phase 2+ per
  `08.4`.
- No real DevOps Sandbox containers (`localstack`, `ubuntu_ssh_1/2`) — the
  fake SSH target here is intentionally minimal and never touches Docker.
- Not a change to `runner.go`'s target-detection logic — per the Phase 0
  brief, that comes in Phase 1 (`local_agent` target type).

## Running it

```bash
cd spikes/sandbox-agent-protocol

# Automated proof: pairing, tunnel, SSH-exec, streamed logs, allowlist
# enforcement, and cross-tenant rejection, all asserted.
go test ./... -v

# Narrated manual walkthrough of the same path.
go run ./cmd/spike-demo
```

Both exercise the full path from 03.6's sequence diagram — pairing, an
Agent-initiated outbound tunnel, a Runner-side dial, SSH exec through the
tunnel to a fake local target, and log lines streamed back — over real
`127.0.0.1` network sockets.

## What was validated

- **Transport**: yamux multiplexes cleanly over a WebSocket connection via a
  minimal `io.ReadWriteCloser` adapter; no custom framing needed beyond that.
- **SSH-exec-over-tunnel**: a real `golang.org/x/crypto/ssh` client completes
  a handshake and runs `exec` requests through a yamux stream tunneled inside
  a WebSocket, with `runner.go`'s eventual approach of re-pointing its
  existing SSH client at a different `net.Conn` (rather than rewriting it)
  confirmed viable.
- **Log streaming is real streaming, not buffering**: the e2e test asserts
  output lines arrive with an increasing timestamp spread matching the
  target's own `sleep` cadence, rather than all at once when the process
  exits.
- **Destination allowlisting**: a Runner-side dial for a service the Agent
  never registered is rejected by the Agent itself, and surfaces to the
  caller as an explicit HTTP 403 from the Gateway before any application
  bytes are exchanged.
- **Tenant scoping**: a dial request whose account/project doesn't match the
  target Agent's registered scope is rejected by the Gateway before it ever
  reaches the Agent.
- **Device-authorization pairing**: works standalone (see
  `internal/pairing/pairing_test.go`) with no Gateway or networking involved,
  and is reused by the Gateway's `/device/*` HTTP endpoints in the full e2e
  path.
