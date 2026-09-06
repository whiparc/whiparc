// Package agent implements the local Sandbox Agent side of the tunnel: it dials
// the Gateway outbound (the laptop is behind NAT, so the connection must always
// be initiated from this side — see 03.6), opens a yamux client session over that
// WebSocket, and for every stream the Gateway opens, checks the requested
// logical service against a fixed allowlist before dialing anything locally.
//
// The allowlist is the security boundary described in 03.6: the Agent must only
// ever proxy to the small, fixed set of services it itself defines at startup —
// never an arbitrary host:port supplied by the Gateway/Runner. Getting this
// wrong turns the tunnel into a general outbound proxy reachable from the
// user's network, which is the core risk this whole feature has to avoid.
package agent

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/url"

	"github.com/gorilla/websocket"
	"github.com/hashicorp/yamux"

	"spikes/sandbox-agent-protocol/internal/wsconn"
)

// Agent is a running connection to a Gateway plus the local service allowlist it
// enforces.
type Agent struct {
	AgentID string

	// Allowlist maps a logical service name (e.g. "ssh:2222") to the local
	// address the Agent is willing to proxy that service's traffic to. This is
	// defined by the Agent itself at registration time, never supplied by the
	// remote side per stream.
	Allowlist map[string]string

	session *yamux.Session
}

// Connect dials the Gateway's /agent/connect endpoint (gatewayHTTPURL, e.g.
// "http://127.0.0.1:8090"), upgrades to a WebSocket, and establishes the yamux
// client session. It returns once connected; call Serve to start handling
// incoming stream requests.
func Connect(gatewayHTTPURL, token, agentID string, allowlist map[string]string) (*Agent, error) {
	u, err := url.Parse(gatewayHTTPURL)
	if err != nil {
		return nil, fmt.Errorf("agent: invalid gateway url: %w", err)
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
	u.RawQuery = q.Encode()

	ws, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("agent: dial gateway: %w", err)
	}

	session, err := yamux.Client(wsconn.New(ws), yamux.DefaultConfig())
	if err != nil {
		ws.Close()
		return nil, fmt.Errorf("agent: yamux client setup: %w", err)
	}

	return &Agent{
		AgentID:   agentID,
		Allowlist: allowlist,
		session:   session,
	}, nil
}

// Serve blocks, accepting streams the Gateway opens on behalf of Runner dial
// requests, until the tunnel closes. Each stream is handled in its own
// goroutine so a slow or long-lived exec session never blocks new ones.
func (a *Agent) Serve() error {
	for {
		stream, err := a.session.Accept()
		if err != nil {
			return err
		}
		go a.handleStream(stream)
	}
}

// CloseChan reports when the underlying tunnel session ends, for callers that
// want to detect disconnection (full reconnect-on-drop UX is Phase 2 scope —
// see obsidian_memory/08.4).
func (a *Agent) CloseChan() <-chan struct{} {
	return a.session.CloseChan()
}

func (a *Agent) Close() error {
	return a.session.Close()
}

type streamHeader struct {
	Service string `json:"service"`
}

func (a *Agent) handleStream(stream net.Conn) {
	defer stream.Close()

	line, err := readLine(stream)
	if err != nil {
		log.Printf("agent: could not read stream header: %v", err)
		return
	}
	var h streamHeader
	if err := json.Unmarshal([]byte(line), &h); err != nil {
		log.Printf("agent: malformed stream header %q: %v", line, err)
		return
	}

	target, allowed := a.Allowlist[h.Service]
	if !allowed {
		log.Printf("agent: rejected stream for disallowed service %q", h.Service)
		writeLine(stream, "ERR: service not in agent allowlist")
		return
	}

	local, err := net.Dial("tcp", target)
	if err != nil {
		log.Printf("agent: could not dial local service %q (%s): %v", h.Service, target, err)
		writeLine(stream, fmt.Sprintf("ERR: local dial failed: %v", err))
		return
	}
	defer local.Close()

	if err := writeLine(stream, "OK"); err != nil {
		return
	}

	log.Printf("agent: proxying service %q -> %s", h.Service, target)
	splice(stream, local)
}

func splice(a, b io.ReadWriteCloser) {
	done := make(chan struct{}, 2)
	go func() {
		io.Copy(a, b)
		done <- struct{}{}
	}()
	go func() {
		io.Copy(b, a)
		done <- struct{}{}
	}()
	<-done
}

// readLine/writeLine mirror the byte-exact framing gateway.protocol uses, so the
// Agent's understanding of the wire format stays in lockstep with the Gateway's.
// Duplicated rather than imported from the internal gateway package: the Agent
// and Gateway are meant to become separate repositories in Phase 4 (see
// obsidian_memory/09.2), so the Agent should not reach into Gateway internals
// even while both live in this one spike module.
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
