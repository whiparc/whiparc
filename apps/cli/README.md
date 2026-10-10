# apps/cli

The `whiparc` command-line tool: log in, manage projects, import existing
Terraform and Ansible files, trigger deployments, and manage the local
sandbox and its Agent.

License: MIT ([LICENSE](LICENSE)). No CLA is required, which makes this the
easiest place to make a first contribution. Keep it free of imports from the
BSL-licensed `apps/api` and `apps/web` code.

## Build and run

```bash
cd apps/cli
go run . --help          # run without installing
go build -o whiparc .    # build a binary
```

A local build talks to `http://localhost:8080` by default. Release builds are
compiled against the hosted API. See
[docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md#cli-configuration) for how to
override the target.

## Test it

```bash
cd apps/cli
go vet ./...
go test ./...
```

## Layout

| File | What is there |
| :--- | :--- |
| `main.go` | Root command, `login`, `logout`, `projects`, `import`, `deploy` |
| `config.go` | `config set` and `~/.whiparc/config.json` handling |
| `sandbox.go`, `sandboxagent.go`, `sandboxservice.go` | `sandbox` commands and the local Agent |
| `embedded.go`, `embedded/` | Sandbox compose files embedded into the binary |
| `ui.go` | Terminal output helpers |

## Releases and installers

Installers (Windows, macOS, Linux) are in [`installers/`](../../installers)
and built by `.github/workflows/cli-release.yml`. See the "CLI Releases and
Installers" section of [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md#cli-releases-and-installers)
and [docs/RELEASE_SIGNING.md](../../docs/RELEASE_SIGNING.md).

When you add or change a command, flag, config key or install path, also
update the CLI section of `apps/web/app/docs/DocsPageV2.tsx`.
