package main

// Embeds the sandbox's docker-compose.sandbox.yml and Dockerfile.ssh into the
// infracanvas binary so `sandbox up` works for a user who only downloaded the
// CLI, without a repository checkout (see obsidian_memory/08.4's Phase 2 —
// "Zero-clone sandbox up"). These MUST stay byte-identical to the root
// sandbox/ copies that root docker-compose.yml also builds from;
// embedded_sandbox_test.go enforces that.

import (
	"embed"
	"fmt"
	"os"
	"path"
	"path/filepath"
)

//go:embed embedded/sandbox/docker-compose.sandbox.yml embedded/sandbox/Dockerfile.ssh
var embeddedSandboxFiles embed.FS

// embed.FS paths are always "/"-separated, even on Windows — do not use
// filepath.Join for these lookups.
const embeddedSandboxDir = "embedded/sandbox"

// extractEmbeddedSandboxFiles writes the embedded compose file and Dockerfile
// out to ~/.infracanvas/sandbox/compose/ and returns that directory. Runs
// unconditionally on every `sandbox up`/`sandbox down` call — the files are
// tiny, so there's no reason to version-check a possibly-stale prior extract
// from an older CLI install.
func extractEmbeddedSandboxFiles() (string, error) {
	stateDir, err := sandboxStateDir()
	if err != nil {
		return "", err
	}
	composeDir := filepath.Join(stateDir, "compose")
	if err := os.MkdirAll(composeDir, 0755); err != nil {
		return "", err
	}

	for _, name := range []string{"docker-compose.sandbox.yml", "Dockerfile.ssh"} {
		data, err := embeddedSandboxFiles.ReadFile(path.Join(embeddedSandboxDir, name))
		if err != nil {
			return "", fmt.Errorf("read embedded %s: %w", name, err)
		}
		if err := os.WriteFile(filepath.Join(composeDir, name), data, 0644); err != nil {
			return "", fmt.Errorf("write %s: %w", name, err)
		}
	}
	return composeDir, nil
}
