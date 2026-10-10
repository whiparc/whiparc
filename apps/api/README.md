# apps/api

The Whiparc backend: authentication and RBAC, project and canvas storage,
real-time collaboration, the credential vault, the HCL/YAML importer, and the
runner that executes deploy and destroy pipelines. A single Go module.

License: Business Source License 1.1 (see [NOTICE.md](../../NOTICE.md)).
Pull requests here require the [CLA](../../CLA.md).

## Run it

Start the sandbox first (LocalStack and SSH targets), then the API:

```bash
docker compose -f sandbox/docker-compose.sandbox.yml up -d   # from the repo root
cd apps/api
go run .
```

(`go run .`, not `go run main.go`: the package spans many files.)

- Listens on `PORT` (default `8080`).
- Uses SQLite at `apps/api/data/dev.db` unless `DB_DRIVER=postgres` and
  `DATABASE_URL` are set. No external database is needed for development.
- Does not read `.env` itself; export variables in your shell. See
  [`.env.example`](../../.env.example) for what exists.
- With no mail provider configured, verification and reset links are printed
  to the console.

Or use `npm run dev` at the repository root to start it next to the web app.

## Test it

```bash
cd apps/api
go vet ./...
go test ./...
```

Postgres integration tests are skipped unless `TEST_DATABASE_URL` is set; CI
provides a `postgres:16-alpine` service. To run them locally, point it at a
disposable database:

```bash
TEST_DATABASE_URL="postgres://postgres:postgres@localhost:5432/whiparc_test?sslmode=disable" go test ./...
```

## Layout

| Path | What is there |
| :--- | :--- |
| `main.go` | Startup, route registration, deploy handlers |
| `auth.go`, `oauth.go`, `password_*.go`, `email_*.go` | Sessions, social login, passwords, email flows |
| `projects.go`, `teams.go`, `snapshots.go` | Projects, members, canvas state |
| `importer/` | Server-side graph compiler and HCL/YAML/Kubernetes reverse importer |
| `runner/` | Deploy and destroy pipelines, log streaming |
| `vault/` | Credential encryption |
| `db_driver.go`, `migrations.go` | SQLite/Postgres abstraction and numbered migrations |

## Conventions

- Write SQL in SQLite's dialect; `db_driver.go` adapts it for Postgres. Add a
  numbered migration in `migrations.go` for any schema change.
- Add a `*_test.go` case next to any behavior change.
- Never log secrets; the runner scrubs known secrets from streamed output.
- Public endpoints that send mail to a caller-supplied address need abuse
  controls; follow the existing newsletter and contact handlers.
