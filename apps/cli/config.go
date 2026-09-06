package main

import (
	"fmt"

	"github.com/spf13/cobra"
)

// configCmd is a small `infracanvas config` group for persisted CLI settings
// that don't warrant their own flag — currently just the sandbox agent beta
// opt-in and the Agent Gateway URL (see obsidian_memory/08.4's Phase 1).
func configCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "config",
		Short: "View or change persisted CLI configuration",
	}
	cmd.AddCommand(configSetCmd())
	return cmd
}

func configSetCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "set <key> <value>",
		Short: "Set a persisted config value (sandbox-agent-beta | gateway-url)",
		Args:  cobra.ExactArgs(2),
		Run: func(cmd *cobra.Command, args []string) {
			key, value := args[0], args[1]

			cfg, err := getClientConfig()
			if err != nil {
				fmt.Printf("Config error: %v\n", err)
				return
			}

			switch key {
			case "sandbox-agent-beta":
				cfg.SandboxAgentBeta = value == "true"
			case "gateway-url":
				cfg.GatewayURL = value
			default:
				fmt.Printf("Unknown config key %q. Supported keys: sandbox-agent-beta, gateway-url\n", key)
				return
			}

			if err := saveClientConfig(cfg); err != nil {
				fmt.Printf("Failed to save config: %v\n", err)
				return
			}
			fmt.Printf("Set %s = %s\n", key, value)
		},
	}
}
