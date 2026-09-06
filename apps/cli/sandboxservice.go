package main

// Installs/removes the local Sandbox Agent as a persistent OS service
// (a per-user systemd unit on Linux, a per-user launchd agent on macOS, a
// Windows Service), per obsidian_memory/06.3 and 08.4's Phase 2 daemon-install
// item. Built on github.com/kardianos/service (pure Go, no cgo — safe for
// this CLI's existing CGO_ENABLED=0 cross-compilation).
//
// `sandbox agent-run` (the plain foreground/background-process path `sandbox
// up` already spawns, in sandboxagent.go) is untouched. This adds a second,
// OS-invoked entry point (`sandbox agent-service-run`, hidden) that shares
// the same reconnect-loop logic (runAgentReconnectLoop) via a cancellable
// context, so Stop() can return promptly instead of relying on the OS to
// forcibly kill the process.

import (
	"context"
	"fmt"
	"log"
	"runtime"

	"github.com/kardianos/service"
	"github.com/spf13/cobra"
)

// agentServiceName is fixed, not per-agentID: this codebase only ever tracks
// one active paired agent per machine (see sandboxState/state.json), so the
// installed service follows the same single-instance model. Re-running
// `agent install` after re-pairing with a different project replaces this
// same service's registration rather than creating a second one.
const agentServiceName = "infracanvas-sandbox-agent"

func agentServiceConfig(agentID, gatewayURL string) *service.Config {
	return &service.Config{
		Name:        agentServiceName,
		DisplayName: "Whiparc Sandbox Agent",
		Description: "Bridges a local Whiparc DevOps Sandbox to the hosted Runner (see infracanvas sandbox up).",
		Arguments:   []string{"sandbox", "agent-service-run", "--agent-id=" + agentID, "--gateway=" + gatewayURL},
		Option: service.KeyValue{
			// Installs as a per-user systemd unit / launchd agent on
			// Linux/macOS — no root/sudo needed there. Windows has no
			// equivalent concept; a Windows Service always requires an
			// elevated (Administrator) shell to install/uninstall.
			"UserService": true,
		},
	}
}

// agentServiceProgram implements service.Interface. Only the process started
// via the hidden `agent-service-run` entry point ever has Start/Stop called
// on it — the `install`/`uninstall` commands' own calls to Service.Start()/
// Stop() shell out to the OS's service manager (systemctl/launchctl/SCM)
// instead of invoking these methods in-process; see the actual backend
// (e.g. service_systemd_linux.go's Run() vs Start()) for why constructing a
// fully-populated program there is unnecessary but harmless.
type agentServiceProgram struct {
	agentID    string
	gatewayURL string
	token      string
	cancel     context.CancelFunc
}

// Start must return quickly — the actual work runs in a goroutine.
func (p *agentServiceProgram) Start(s service.Service) error {
	ctx, cancel := context.WithCancel(context.Background())
	p.cancel = cancel
	go func() {
		_ = runAgentReconnectLoop(ctx, p.agentID, p.gatewayURL, p.token)
	}()
	return nil
}

// Stop cancels the context runAgentReconnectLoop is watching so it exits
// promptly (see connectAndServe's ctx-cancellation watcher) instead of being
// forcibly killed by the OS's stop timeout.
func (p *agentServiceProgram) Stop(s service.Service) error {
	if p.cancel != nil {
		p.cancel()
	}
	return nil
}

// agentServiceIsRunning reports whether the installed service is currently
// running, so `sandbox up` can skip spawning a redundant raw background
// process that would otherwise race the same agent_id against the service.
// Status() only inspects the service by Name (confirmed against
// service_systemd_linux.go's Status(), which shells out to `systemctl
// is-active <unit>`) — agentID/gatewayURL here only matter if New() ends up
// needing them for some backend's Status() path, so passing the real values
// costs nothing. An error (e.g. not installed at all) is treated as "not
// running" by the caller, not surfaced — this is a best-effort check, not a
// hard dependency for `sandbox up` to proceed.
func agentServiceIsRunning(agentID, gatewayURL string) (bool, error) {
	svc, err := service.New(&agentServiceProgram{}, agentServiceConfig(agentID, gatewayURL))
	if err != nil {
		return false, err
	}
	status, err := svc.Status()
	if err != nil {
		return false, err
	}
	return status == service.StatusRunning, nil
}

// ---- sandbox agent install/uninstall ----

func sandboxAgentCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "agent",
		Short: "Install or remove the local Sandbox Agent as a persistent OS service",
	}
	cmd.AddCommand(
		&cobra.Command{
			Use:   "install",
			Short: "Install the paired Agent as a service that survives reboots",
			Run:   runSandboxAgentInstall,
		},
		&cobra.Command{
			Use:   "uninstall",
			Short: "Stop and remove the installed Agent service",
			Run:   runSandboxAgentUninstall,
		},
	)
	return cmd
}

func runSandboxAgentInstall(cmd *cobra.Command, args []string) {
	cfg, err := getClientConfig()
	if err != nil {
		fmt.Printf("Config error: %v\n", err)
		return
	}
	if !requireSandboxBeta(cfg) {
		return
	}

	st, err := loadSandboxState()
	if err != nil {
		fmt.Println(err)
		return
	}

	token, err := resolveAgentToken(st.AgentID)
	if err != nil {
		fmt.Printf("Cannot install: %v\n", err)
		return
	}

	svcConfig := agentServiceConfig(st.AgentID, cfg.GatewayURL)
	prg := &agentServiceProgram{agentID: st.AgentID, gatewayURL: cfg.GatewayURL, token: token}
	svc, err := service.New(prg, svcConfig)
	if err != nil {
		fmt.Printf("Failed to prepare service: %v\n", err)
		return
	}

	// Best-effort: replace any prior registration (e.g. from an earlier
	// pairing with a different project) rather than erroring on "already
	// exists" — install is expected to be safely re-runnable.
	_ = svc.Stop()
	_ = svc.Uninstall()

	if err := svc.Install(); err != nil {
		fmt.Printf("Failed to install service: %v\n", err)
		if runtime.GOOS == "windows" {
			fmt.Println("On Windows, installing a service requires an elevated (Administrator) shell.")
		}
		return
	}
	if err := svc.Start(); err != nil {
		fmt.Printf("Service installed but failed to start: %v\n", err)
		return
	}

	fmt.Printf("Installed and started %q.\n", agentServiceName)
	switch runtime.GOOS {
	case "windows":
		fmt.Println("Registered as a Windows Service (visible in services.msc) — starts automatically on boot.")
	case "darwin":
		fmt.Println("Registered as a per-user launchd agent (~/Library/LaunchAgents) — starts automatically when you log in, not before boot.")
	default:
		fmt.Println("Registered as a per-user systemd unit (~/.config/systemd/user) — starts automatically when you log in, not before boot.")
	}
}

func runSandboxAgentUninstall(cmd *cobra.Command, args []string) {
	cfg, err := getClientConfig()
	if err != nil {
		fmt.Printf("Config error: %v\n", err)
		return
	}
	if !requireSandboxBeta(cfg) {
		return
	}

	st, err := loadSandboxState()
	if err != nil {
		fmt.Println(err)
		return
	}

	svcConfig := agentServiceConfig(st.AgentID, cfg.GatewayURL)
	svc, err := service.New(&agentServiceProgram{}, svcConfig)
	if err != nil {
		fmt.Printf("Failed to prepare service: %v\n", err)
		return
	}

	if err := svc.Stop(); err != nil {
		fmt.Printf("Warning: failed to stop service (continuing to uninstall): %v\n", err)
	}
	if err := svc.Uninstall(); err != nil {
		fmt.Printf("Failed to uninstall service: %v\n", err)
		return
	}
	fmt.Printf("Uninstalled %q.\n", agentServiceName)
}

// ---- sandbox agent-service-run (hidden — the OS service manager's actual entry point) ----

func sandboxAgentServiceRunCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:    "agent-service-run",
		Hidden: true,
		Short:  "Internal: entry point invoked by the installed OS service — do not run directly",
		Run:    runSandboxAgentServiceRun,
	}
	cmd.Flags().String("agent-id", "", "Agent ID this process registers as")
	cmd.Flags().String("gateway", "", "Agent Gateway base URL")
	return cmd
}

func runSandboxAgentServiceRun(cmd *cobra.Command, args []string) {
	agentID, _ := cmd.Flags().GetString("agent-id")
	gatewayURL, _ := cmd.Flags().GetString("gateway")
	if agentID == "" || gatewayURL == "" {
		log.Fatal("sandbox agent-service-run: --agent-id and --gateway are required")
	}
	token, err := resolveAgentToken(agentID)
	if err != nil {
		log.Fatalf("sandbox agent-service-run: %v", err)
	}

	svcConfig := agentServiceConfig(agentID, gatewayURL)
	prg := &agentServiceProgram{agentID: agentID, gatewayURL: gatewayURL, token: token}
	svc, err := service.New(prg, svcConfig)
	if err != nil {
		log.Fatalf("sandbox agent-service-run: %v", err)
	}
	// Run blocks: it calls prg.Start (returns immediately, real work in a
	// goroutine per agentServiceProgram.Start), waits for the OS service
	// manager's stop signal, then calls prg.Stop.
	if err := svc.Run(); err != nil {
		log.Fatalf("sandbox agent-service-run: %v", err)
	}
}
