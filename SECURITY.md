# Security Policy

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report privately using one of these two channels:

1. **GitHub Private Vulnerability Reporting** (preferred): open the
   [Security tab](../../security) on this repository and click "Report a
   vulnerability." This creates a private advisory only the maintainers can
   see. *(Note to maintainers: enable this under Settings → Security →
   Private vulnerability reporting — it isn't on by default.)*
2. **Email**: bishalprasad321@gmail.com. Include steps to reproduce, the
   affected component/path, and — if applicable — a proof of concept.
   Please don't include real credentials, tokens, or another person's data
   in the report.

We'll acknowledge your report within **3 business days** and aim to provide
an initial assessment (severity, affected versions, expected fix timeline)
within **10 business days**. We'll credit you in the fix's release notes
unless you'd prefer to stay anonymous.

## Scope

| Component | In scope |
| :--- | :--- |
| `apps/web/` (canvas UI, compilers) | Yes |
| `apps/api/` (auth, RBAC, credential vault, runner, WebSockets) | Yes |
| `apps/cli/` (CLI, local Sandbox Agent client) | Yes |
| `sandbox/` (local dev LocalStack/SSH containers) | **No** — this is a
  development-only simulated environment, not a security boundary. Its
  pre-generated SSH keypair and `docker-compose.sandbox.yml` are for local
  testing only and are never intended to face the internet. |

Areas of particular interest given the architecture: credential vault
encryption/handling (`apps/api/vault/`), JWT/OAuth session handling
(`apps/api/auth.go`, `apps/api/oauth.go`), RBAC/project-scoping checks
(`apps/api/projects.go`), and the HCL/YAML AST validators for custom nodes
(`apps/api/custom_node_validator.go`), since they parse user-supplied code.

## Supported Versions

This project does not yet have a stable versioned release line — security
fixes land on `main`. Once tagged releases exist, this section will list
which lines receive backported fixes.

## Disclosure

We follow coordinated disclosure: please give us a reasonable window to
ship a fix before any public write-up. We're happy to agree on a disclosure
date with you as part of the report.
