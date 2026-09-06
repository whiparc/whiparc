package main

import (
	"os"
	"path/filepath"
	"testing"
)

// TestEmbeddedSandboxFilesMatchCanonical guards apps/cli/embedded/sandbox/*
// against drifting from the canonical root sandbox/* files that root
// docker-compose.yml also builds from (see obsidian_memory/08.4). apps/cli
// sits at the same depth as apps/api (apps/<name>), so ../../sandbox/<name>
// reaches the repo root the same way apps/api/main.go's own native-run
// fallback (readSandboxPublicKey) already does — go test's working directory
// is always the package's source directory, regardless of where `go test`
// is invoked from.
func TestEmbeddedSandboxFilesMatchCanonical(t *testing.T) {
	for _, name := range []string{"docker-compose.sandbox.yml", "Dockerfile.ssh"} {
		t.Run(name, func(t *testing.T) {
			embedded, err := os.ReadFile(filepath.Join("embedded", "sandbox", name))
			if err != nil {
				t.Fatalf("read embedded copy: %v", err)
			}
			canonical, err := os.ReadFile(filepath.Join("..", "..", "sandbox", name))
			if err != nil {
				t.Skipf("root sandbox/%s not found (not a full monorepo checkout): %v", name, err)
			}
			if string(embedded) != string(canonical) {
				t.Errorf("apps/cli/embedded/sandbox/%s has drifted from sandbox/%s — edit both together, see obsidian_memory/08.4", name, name)
			}
		})
	}
}
