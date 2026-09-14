package main

import (
	"github.com/spf13/cobra"
)

// configCmd is a small `whiparc config` group for persisted CLI settings
// that don't warrant their own flag — currently the sandbox agent beta
// opt-in, the Agent Gateway URL (see obsidian_memory/08.4's Phase 1), and the
// API backend URL.
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
		Short: "Set a persisted config value (sandbox-agent-beta | gateway-url | api-url)",
		Args:  cobra.ExactArgs(2),
		Run: func(cmd *cobra.Command, args []string) {
			key, value := args[0], args[1]

			cfg, err := getClientConfig()
			if err != nil {
				printError("Config error: %v", err)
				return
			}

			switch key {
			case "sandbox-agent-beta":
				cfg.SandboxAgentBeta = value == "true"
			case "gateway-url":
				cfg.GatewayURL = value
			case "api-url":
				cfg.APIURL = value
			default:
				printError("Unknown config key %q. Supported keys: sandbox-agent-beta, gateway-url, api-url", key)
				return
			}

			if err := saveClientConfig(cfg); err != nil {
				printError("Failed to save config: %v", err)
				return
			}
			printSuccess("Set %s = %s", key, value)
		},
	}
}
