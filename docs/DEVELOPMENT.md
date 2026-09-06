# Development Setup

Full local setup instructions for Whiparc. For the condensed version,
see the [README quickstart](../README.md#quickstart).

## Prerequisites

- Node.js (v18+)
- Go (v1.22+)
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

3. Run the Go server:
   ```bash
   go run main.go
   ```

By default:
- The server listens on port `8080` (overwrite by setting the `PORT`
  environment variable).
- It creates and connects to a SQLite database at `apps/api/data/dev.db`.
- It reads the private SSH key from `../../sandbox/id_rsa` to authenticate
  against the sandbox containers.

## Running Everything inside Docker

To run the entire ecosystem (Next.js web client, Go API, database, and
DevOps sandbox) in containerized form:

```bash
docker compose up --build
```

## CI

Pull requests run `.github/workflows/ci.yml` (lint/build for `apps/web`,
`go build`/`go vet`/`go test` for each Go module) and
`.github/workflows/codeql.yml` (static analysis). Run the same commands
locally before pushing — see [CONTRIBUTING.md](../CONTRIBUTING.md).
