# Development Setup

Full local setup instructions for Whiparc. For the condensed version,
see the [README quickstart](../README.md#quickstart).

## Contents

- [Prerequisites](#prerequisites)
- [Developer sandbox setup](#developer-sandbox-setup)
- [Social login setup](#social-login-google--github-setup)
- [Running the full stack](#running-the-full-stack-frontend--backend)
- [Choosing how to run the backend](#choosing-how-to-run-the-backend-port-8080)
- [Running the tests](#running-the-tests)
- [Troubleshooting](#troubleshooting)
- [Running the backend separately](#running-the-backend-server-separately)
- [Running everything inside Docker](#running-everything-inside-docker)
- [Testing against the hosted stack](#testing-against-the-hosted-stack-postgres-locally)
- [CLI configuration](#cli-configuration)
- [CLI releases and installers](#cli-releases-and-installers)
- [CI](#ci)

For how the pieces fit together, read [ARCHITECTURE.md](ARCHITECTURE.md).

## Prerequisites

- Node.js 20.9 or newer (CI runs Node 20; Next.js 16 does not support older versions)
- Go 1.26 or newer (see the `go` line in `apps/api/go.mod` and `apps/cli/go.mod`)
- Docker and Docker Compose

## Developer Sandbox Setup

Before running the application or executing deployments, you must spin up
the local DevOps sandbox. This simulates the target cloud environment (AWS
via LocalStack, and virtual machines via SSH-enabled Ubuntu containers)
without incurring costs or needing real servers.

1. Generate the SSH key pair:
   ```bash
   ssh-keygen -t rsa -b 4096 -f sandbox/id_rsa -N ""
   ```
   - _Note: If you already have an SSH key pair, you can skip this step._

2. Spin up the sandbox services:
   ```bash
   docker compose -f sandbox/docker-compose.sandbox.yml up -d
   ```

This starts:
- LocalStack on port 4566 (simulating AWS VPC, S3, EC2 APIs)
- ubuntu_ssh_1 on port 2222 (representing Ansible server target 1)
- ubuntu_ssh_2 on port 2223 (representing Ansible server target 2)

The Go backend runner automatically reads the private key from
`sandbox/id_rsa` to execute commands against the containers.

## Social Login (Google / GitHub) Setup

Optional — email/password login works without this. To test "Continue with
Google" / "Continue with GitHub" locally:

1. Copy the example env file at the repo root:
   ```bash
   cp .env.example .env
   ```

2. Register an OAuth app with each provider you want to test:
   - **Google** — [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → Create Credentials → OAuth client ID (type: Web application). Set the authorized redirect URI to `http://localhost:8080/api/auth/google/callback`.
   - **GitHub** — [GitHub Developer Settings](https://github.com/settings/developers) → OAuth Apps → New OAuth App. Set the authorization callback URL to `http://localhost:8080/api/auth/github/callback`.

3. Fill in the four resulting values in `.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GITHUB_CLIENT_ID=...
   GITHUB_CLIENT_SECRET=...
   ```
   `API_PUBLIC_URL` and `FRONTEND_URL` can stay at their defaults unless the
   app is reachable somewhere other than `localhost:8080`/`localhost:3000`.

`.env` is git-ignored — never commit real Client Secrets. Docker Compose
loads it automatically for the `api` service; if running the API directly
via `go run .`, export the four variables in your shell instead, since only
`docker compose`'s `env_file` reads `.env` automatically.

## Running the Full Stack (Frontend + Backend)

To launch both the Next.js frontend application and the Go API backend
concurrently for development:

1. Install all dependencies from the root directory:
   ```bash
   npm install
   ```

2. Start the development servers:
   ```bash
   npm run dev
   ```

This uses Turborepo to run:
- Next.js frontend at `http://localhost:3000`
- Go API backend at `http://localhost:8080`

Turborepo only runs npm workspace packages. `apps/api` is a Go module, not a
JavaScript package, so it has a stub `apps/api/package.json` whose only job is
a `dev` script (`go run .`) that lets this one command start it alongside the
web app. Go must be installed (see Prerequisites). Environment variables you
export in the shell reach both
processes; the API does not read `.env` itself.

On first run, open `http://localhost:3000`, create an account, and use the
verification link the API prints to its terminal (no mail provider is
configured locally, so nothing is emailed).

Both servers run in one terminal and share Ctrl+C. If you only want one of
them, run it directly: `npm run dev --workspace=web` or
`npm run dev --workspace=api`.

`npm run dev` binds the API to port `8080`, so it **cannot run at the same
time as a Docker backend** (see
[Choosing How to Run the Backend](#choosing-how-to-run-the-backend-port-8080)
below). If you use Docker for the backend, start only the frontend with
`npm run dev --workspace=web`.

## Choosing How to Run the Backend (Port 8080)

The frontend always calls the API at `http://localhost:8080` (override with
`NEXT_PUBLIC_API_URL`), and it does not care which backend answers. But three
different commands all publish port `8080`, so on one machine you can run
**only one of them at a time**:

| Backend you want | Start the backend | Start the frontend | Database |
| :--- | :--- | :--- | :--- |
| Native Go API (default for contributors) | `npm run dev` starts it for you | `npm run dev` (same command) | SQLite (`apps/api/data/dev.db`) |
| Docker API, SQLite | `docker compose up -d` | `npm run dev --workspace=web` | SQLite on a Docker volume |
| Docker API, hosted shape | `docker compose -f docker-compose.hosted.yml up -d` | `npm run dev --workspace=web` | Postgres (bundled container) |

Rules of thumb:

- **`npm run dev` plus a Docker backend fails** with a "port is already
  allocated" / "address already in use" error on `8080` (whichever started
  second loses). Use `npm run dev --workspace=web` whenever Docker owns the
  backend.
- **`docker-compose.yml` and `docker-compose.hosted.yml` also cannot run
  together**: both publish `8080` and LocalStack's `4566`. Stop one first
  (`docker compose down`, or `docker compose -f docker-compose.hosted.yml down`).
- **The sandbox stack** (`sandbox/docker-compose.sandbox.yml`, ports `2222`,
  `2223`, `4566`) overlaps with both compose files' LocalStack and SSH
  containers. Use it with the native backend; the compose files bring their own.
- **The hosted stack refuses to start without `JWT_SECRET` and `FRONTEND_URL`**
  (see
  [Testing Against the Hosted Stack](#testing-against-the-hosted-stack-postgres-locally)).
- Only the Docker stacks' API runs in a container. The Next.js frontend is
  never containerized by either compose file, so it is always started with npm.

To find what currently owns the port: `docker ps` for containers, or
`netstat -ano | findstr :8080` (Windows) / `lsof -i :8080` (macOS, Linux).

## Running the Tests

| Area | Command | Notes |
| :--- | :--- | :--- |
| Web | `cd apps/web && npm run lint && npm run build` | No unit-test runner yet; the build type-checks the app |
| API | `cd apps/api && go vet ./... && go test ./...` | Postgres integration tests are skipped unless `TEST_DATABASE_URL` is set |
| CLI | `cd apps/cli && go vet ./... && go test ./...` | |

These are what CI runs (see [CI](#ci)). To run the API's Postgres tests
locally, start a disposable database and set the variable:

```bash
docker run --rm -d --name whiparc-test-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=whiparc_test postgres:16-alpine
export TEST_DATABASE_URL="postgres://postgres:postgres@localhost:5432/whiparc_test?sslmode=disable"
cd apps/api && go test ./...
```

## Troubleshooting

| Symptom | Likely cause and fix |
| :--- | :--- |
| `address already in use` or `port is already allocated` on `8080` | Another backend owns the port. See [Choosing how to run the backend](#choosing-how-to-run-the-backend-port-8080). |
| The first page load takes a minute | Normal: Next.js compiles routes on demand in dev mode. |
| `go run main.go` fails with undefined symbols | The package spans many files. Run `go run .` from `apps/api`. |
| The web app cannot reach the API | Confirm the API is up on `http://localhost:8080`, or set `NEXT_PUBLIC_API_URL`. |
| Sign-up works but no email arrives | Expected locally. The verification link is printed in the API terminal. |
| Deploys fail immediately | Start the sandbox (`docker compose -f sandbox/docker-compose.sandbox.yml up -d`) and make sure `sandbox/id_rsa` exists. |
| `npm install` errors about the Node version | Use Node.js 20.9 or newer. |

## Running the Backend Server Separately

If you are focusing on backend development or debugging the Go runner, you
can run the API server independently:

1. Ensure the developer sandbox is running:
   ```bash
   docker compose -f sandbox/docker-compose.sandbox.yml up -d
   ```

2. Navigate to the API app directory:
   ```bash
   cd apps/api
   ```

3. Run the Go server (the package spans several files, so run `.`, not
   `main.go`):
   ```bash
   go run .
   ```

By default:
- The server listens on port `8080` (overwrite by setting the `PORT`
  environment variable).
- It creates and connects to a SQLite database at `apps/api/data/dev.db`.
  This is the default for local development and for contributors — no
  external database or account is needed to run or test Whiparc.
- It reads the private SSH key from `../../sandbox/id_rsa` to authenticate
  against the sandbox containers.

## Running Everything inside Docker

To run the backend (Go API, LocalStack and the SSH sandbox targets) in
containers:

```bash
docker compose up --build
```

This does not include the Next.js frontend, which neither compose file
defines. Start it separately with `npm run dev --workspace=web`; do not use
plain `npm run dev` here, since it would try to start a second API on port
`8080` (see [Choosing How to Run the Backend](#choosing-how-to-run-the-backend-port-8080)).

This also defaults to the SQLite file (on the `api-db-data` named volume) —
`docker-compose.yml` does not set `DB_DRIVER`.

## Testing Against the Hosted Stack (Postgres) Locally

The production deployment runs against Postgres (currently Supabase), not
SQLite. Contributors do not need this — it's for maintainers who need to
reproduce hosted-only behavior (e.g. Postgres-specific SQL errors) before it
reaches production.

`docker-compose.hosted.yml` simulates the hosted backend (`api` +
`agent-gateway` + LocalStack) as a separate Compose project, and — unlike
`docker-compose.yml` — always runs on Postgres, via its own bundled,
disposable `postgres` service (same `postgres:16-alpine` image and config
`.github/workflows/ci.yml` uses for tests). There's no SQLite mode here and
nothing external to provision:

```bash
docker compose -f docker-compose.hosted.yml up --build
```

Like the default compose file, this publishes port `8080` for the API, so
stop `docker compose up` and any `npm run dev` first, and run the frontend
with `npm run dev --workspace=web`.

`DB_DRIVER=postgres` is fixed in the compose file itself. `DATABASE_URL`
defaults to the bundled `postgres` service; set `DATABASE_URL` in a `.env`
file alongside this compose file only if you deliberately want to point at
something else instead (a real scratch Supabase project, say) — see
`.env.example`.

Because this stack runs on Postgres, the API treats it as a hosted
deployment and **refuses to start** unless `JWT_SECRET` and `FRONTEND_URL`
are set to real values (see `apps/api/config_check.go`) — otherwise it would
sign sessions with the development key from the public source tree and accept
any CORS/WebSocket origin. Put both in the `.env` file next to the compose
file (`openssl rand -base64 32` for the secret; `http://localhost:3000` is a
fine `FRONTEND_URL` locally). For a purely throwaway run you can instead set
`WHIPARC_ALLOW_INSECURE_DEV=true` in that `.env`; the API logs a warning and
skips the check. Never set it on a real deployment.

Per-IP rate limits (signup, login, forgot-password) key on the client IP, and
only believe `X-Forwarded-For` / `X-Real-IP` when the direct peer is a
trusted proxy. By default loopback and private ranges are trusted (the Caddy
reverse proxy in `deploy/Caddyfile` reaches the container over Docker's
private bridge); set `TRUSTED_PROXY_CIDRS` to a comma-separated CIDR list to
narrow that, or to `none` when the API is exposed with no proxy in front.

On first run, the bundled `postgres` service's `initdb` can appear to hang
at "performing post-bootstrap initialization" for several minutes with
near-zero CPU — a known Windows/Docker Desktop quirk, not a real problem.
`api`'s `depends_on: postgres: condition: service_healthy` already accounts
for this; just let it finish rather than restarting the stack.

The API's `apps/api/db_driver.go` is the single abstraction point between
the two backends: one SQLite-dialect schema is the source of truth, and a
small query-rebinding shim (placeholders, `LIKE`→`ILIKE`, `datetime('now')`)
adapts it to Postgres at runtime. When adding a new raw SQL query, keep it
written in SQLite's dialect and consider whether it needs a
backend-specific branch (see the `INSERT OR IGNORE`/`INSERT OR REPLACE`
call sites in `projects.go`/`pairing.go` for the pattern), the same way
`.github/workflows/ci.yml` already runs the Go test suite against a real
`postgres:16-alpine` service container on every PR.

## CLI Configuration

The `whiparc` CLI (`apps/cli/`) persists its settings to
`~/.whiparc/config.json`, managed via `whiparc config set <key> <value>`.
Three keys are supported: `api-url`, `gateway-url`, and `sandbox-agent-beta`.

**Which URL a fresh CLI install defaults to depends on how it was built**,
via two build-time-injected variables (`apps/cli/main.go`'s
`apiURLDefault`/`gatewayURLDefault`, set with `-ldflags "-X ..."` — see
`.github/workflows/cli-release.yml`):

- A plain local build (`go build .` / `go run .` from `apps/cli/`, exactly
  what contributors get) has both variables empty, so it defaults to
  `http://localhost:8080` / `http://localhost:9090` — matching this repo's
  own `docker-compose.yml`/`sandbox` setup with zero configuration needed.
- A **tagged CLI release** (`cli-v*`, what a hosted user downloads) has both
  compiled in as `https://api.whiparc.com` / `https://gateway.whiparc.com`,
  so it also works with zero configuration — for the hosted deployment.

**Either default can always be overridden**, regardless of how the binary
was built — this matters if you're a contributor testing against your own
local `apps/api` while using an officially downloaded release binary rather
than a build from source, or conversely pointing a locally-built CLI at a
real deployment:

```bash
# Persists across future commands, whichever binary you're running:
whiparc config set api-url http://localhost:8080
whiparc config set gateway-url http://localhost:9090

# One-shot, this invocation only, without touching the saved config:
whiparc --api-url http://localhost:8080 projects list
```

`whiparc login` also accepts `--api-url` directly and persists whatever it
resolves to, so `whiparc login --api-url http://localhost:8080` both logs in
against your local backend and leaves every later command pointed there too.

## CLI Releases and Installers

`.github/workflows/cli-release.yml` builds the CLI for Windows, macOS and Linux
and packages it. Pushing a `cli-vX.Y.Z` tag publishes a GitHub Release; a push
to `main` refreshes the rolling `cli-latest` release; pull requests build and
upload artifacts only.

| Artifact | Built by | Notes |
| --- | --- | --- |
| `whiparc-setup-windows-amd64.exe` | NSIS, `installers/windows/whiparc.nsi` | Per-user install, adds itself to the user PATH |
| `whiparc-macos.pkg` | `installers/macos/build-pkg.sh` (macOS runner) | Universal binary, branded installer window |
| `.deb` / `.rpm` | nfpm, `installers/linux/nfpm.yaml` | Also installs the app-menu icons and launcher |
| `install.sh` | `installers/linux/install.sh` | Fallback for any other distro; honours `WHIPARC_INSTALL_DIR` |
| `SHA256SUMS.txt` | release job | Checksums for every file above |

Build a Windows installer locally (needs [NSIS](https://nsis.sourceforge.io/)
on PATH, for example `winget install NSIS.NSIS`):

```powershell
./installers/windows/build-local.ps1 -Version 0.2.0
```

The Windows binary embeds its icon and version information through
[go-winres](https://github.com/tc-hib/go-winres) (`apps/cli/winres/winres.json`);
the generated `rsrc_windows_amd64.syso` is git-ignored and recreated by CI and
`build-local.ps1`.

All installer icons come from one source and are regenerated with
`python installers/generate-icons.py` (needs `pip install pillow`).

Related documents:

- [RELEASE_SIGNING.md](RELEASE_SIGNING.md): Windows Authenticode signing, macOS
  Developer ID signing and notarization, and the repository secrets they need.
  Without those secrets the pipeline still works but ships unsigned installers
  and logs a warning on tagged releases.
- [`installers/windows/winget/README.md`](../installers/windows/winget/README.md):
  the winget manifest, the one-time first submission to `microsoft/winget-pkgs`,
  and the `WINGET_TOKEN` secret that automates later version bumps.

User-facing CLI documentation lives in `apps/web/app/docs/DocsPageV2.tsx`.
When you add or change a command, flag, config key or install path, update the
matching section and its entries in `NAV_SECTIONS`, `SECTION_TOC` and
`SEARCH_CONTENT` in that file, otherwise the docs search will not find it.

## CI

Pull requests run `.github/workflows/ci.yml` (lint/build for `apps/web`,
`go build`/`go vet`/`go test` for each Go module) and
`.github/workflows/codeql.yml` (static analysis). Run the same commands
locally before pushing — see [CONTRIBUTING.md](../CONTRIBUTING.md).
