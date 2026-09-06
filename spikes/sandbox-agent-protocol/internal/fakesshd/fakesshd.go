// Package fakesshd is a throwaway SSH target used only to prove that
// SSH-exec-over-tunnel and incremental log streaming survive the yamux/WebSocket
// transport end to end, without standing up the real DevOps Sandbox containers
// (see obsidian_memory/03.2) or touching apps/api/runner/runner.go. Per
// obsidian_memory/08.4's Phase 0 scope, the goal is to prove the transport, not
// to replace the real sandbox target.
//
// It accepts a single fixed public key (generated per test run, never a
// committed key — see the key-management note in obsidian_memory/03.6) and
// implements just enough of the SSH server protocol to run "session" channels
// with "exec" requests, writing command output to the channel as it is produced
// rather than buffering it, which is what actually exercises real-time log
// streaming through the tunnel.
package fakesshd

import (
	"fmt"
	"net"
	"os/exec"

	"golang.org/x/crypto/ssh"
)

// Server is a minimal SSH server bound to 127.0.0.1 on an OS-assigned port.
type Server struct {
	listener net.Listener
	config   *ssh.ServerConfig
	hostKey  ssh.Signer
}

// New starts listening. authorizedKey is the single public key allowed to
// authenticate (the per-installation key `infracanvas sandbox up` would
// generate in the real flow — see obsidian_memory/06.3).
func New(authorizedKey ssh.PublicKey) (*Server, error) {
	hostKey, err := generateSigner()
	if err != nil {
		return nil, fmt.Errorf("fakesshd: generate host key: %w", err)
	}

	config := &ssh.ServerConfig{
		PublicKeyCallback: func(conn ssh.ConnMetadata, key ssh.PublicKey) (*ssh.Permissions, error) {
			if !equalKeys(key, authorizedKey) {
				return nil, fmt.Errorf("unauthorized public key")
			}
			return &ssh.Permissions{}, nil
		},
	}
	config.AddHostKey(hostKey)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, fmt.Errorf("fakesshd: listen: %w", err)
	}

	s := &Server{listener: ln, config: config, hostKey: hostKey}
	go s.acceptLoop()
	return s, nil
}

// Addr is the "host:port" a client should dial, e.g. for the Agent's allowlist
// target.
func (s *Server) Addr() string {
	return s.listener.Addr().String()
}

func (s *Server) Close() error {
	return s.listener.Close()
}

func (s *Server) acceptLoop() {
	for {
		conn, err := s.listener.Accept()
		if err != nil {
			return // listener closed
		}
		go s.handleConn(conn)
	}
}

func (s *Server) handleConn(conn net.Conn) {
	sshConn, chans, reqs, err := ssh.NewServerConn(conn, s.config)
	if err != nil {
		conn.Close()
		return
	}
	defer sshConn.Close()
	go ssh.DiscardRequests(reqs)

	for newChan := range chans {
		if newChan.ChannelType() != "session" {
			newChan.Reject(ssh.UnknownChannelType, "only session channels supported")
			continue
		}
		channel, requests, err := newChan.Accept()
		if err != nil {
			continue
		}
		go handleSessionChannel(channel, requests)
	}
}

type execRequest struct {
	Command string
}

func handleSessionChannel(channel ssh.Channel, requests <-chan *ssh.Request) {
	defer channel.Close()

	for req := range requests {
		switch req.Type {
		case "exec":
			var payload execRequest
			if err := ssh.Unmarshal(req.Payload, &payload); err != nil {
				req.Reply(false, nil)
				continue
			}
			req.Reply(true, nil)
			runExec(channel, payload.Command)
			return
		default:
			req.Reply(false, nil)
		}
	}
}

// runExec runs command through the shell (matching how a real SSH server passes
// an exec request's command line to /bin/sh -c, the same as the current sandbox
// containers do for Ansible/Terraform invocations — see obsidian_memory/03.1)
// and streams stdout to the channel incrementally rather than buffering the
// whole output, so this is a real test of streaming and not just of transfer.
func runExec(channel ssh.Channel, command string) {
	// "sh" (PATH-resolved) rather than a hardcoded "/bin/sh": on native Windows
	// dev machines the literal absolute path doesn't resolve since exec.Command
	// talks straight to CreateProcess with no MSYS path translation, but "sh" on
	// PATH finds Git Bash's sh.exe there while still resolving to /bin/sh on
	// Linux/macOS, matching the real sandbox containers (see obsidian_memory/03.1).
	cmd := exec.Command("sh", "-c", command)
	cmd.Stdout = channel
	cmd.Stderr = channel.Stderr()

	exitCode := 0
	if err := cmd.Run(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = 1
		}
	}

	channel.SendRequest("exit-status", false, ssh.Marshal(struct{ Status uint32 }{uint32(exitCode)}))
}

func equalKeys(a, b ssh.PublicKey) bool {
	return string(a.Marshal()) == string(b.Marshal())
}
