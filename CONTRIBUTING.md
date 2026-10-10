# Contributing to Whiparc

Thanks for taking the time to contribute. This document covers how the repo
is organized license-wise, how to get a dev environment running, and the
mechanics of getting a PR merged.

## Contents

- [Ways to contribute](#ways-to-contribute)
- [Before you start: the license split](#before-you-start-the-license-split)
- [Where things live](#where-things-live)
- [Development setup](#development-setup)
- [Your first pull request](#your-first-pull-request)
- [Branching and PRs](#branching-and-prs)
- [Commit style](#commit-style)
- [What reviewers look for](#what-reviewers-look-for)
- [AI-assisted contributions](#ai-assisted-contributions)
- [Code of Conduct](#code-of-conduct)
- [How decisions get made](#how-decisions-get-made)
- [Reporting bugs and requesting features](#reporting-bugs-and-requesting-features)

## Ways to contribute

Code is only one way to help:

- **Report a bug** with clear reproduction steps, using the issue template.
- **Improve documentation**: fix a confusing step in
  [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), or correct something in the
  README. Documentation-only PRs are welcome and need no CLA.
- **Pick up an issue** labelled
  [`good first issue`](https://github.com/whiparc/whiparc/labels/good%20first%20issue)
  or [`help wanted`](https://github.com/whiparc/whiparc/labels/help%20wanted).
  Comment on it first so two people do not do the same work.
- **Propose a feature** through a feature request or a
  [Discussion](https://github.com/whiparc/whiparc/discussions) before
  writing code, especially for anything touching the canvas, the compilers
  or the API surface.
- **Review** open pull requests and try them locally.

## Before you start: the license split

This repo is **open-core**: not everything in it carries the same license.
Read [NOTICE.md](NOTICE.md) for the full breakdown. Short version:

- `apps/cli/`, `sandbox/`, `spikes/`, and documentation are **MIT**: the
  easiest, lowest-friction place to contribute. No CLA required.
- `apps/web/` and `apps/api/` are **Business Source
  License 1.1**: the core product. PRs touching these paths require
  signing the [Contributor License Agreement](CLA.md); a bot will prompt
  you on your first such PR.

If you are picking your first issue and want the lowest-friction path,
`apps/cli/` and `sandbox/` are the best place to start.

## Where things live

| You want to change | Look in | Check it with |
| :--- | :--- | :--- |
| Canvas, dashboard, pages, generated Terraform/Ansible/K8s output | `apps/web/` ([notes](apps/web/README.md)) | `cd apps/web && npm run lint && npm run build` |
| API, auth, runner, credential vault, importer | `apps/api/` ([notes](apps/api/README.md)) | `cd apps/api && go vet ./... && go test ./...` |
| The `whiparc` CLI and installers | `apps/cli/`, `installers/` ([notes](apps/cli/README.md)) | `cd apps/cli && go vet ./... && go test ./...` |
| Local sandbox containers | `sandbox/` | `docker compose -f sandbox/docker-compose.sandbox.yml up -d` |
| Docs | `README.md`, `docs/`, `apps/web/app/docs/DocsPageV2.tsx` (user-facing) | Read it rendered; check links |

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains how the pieces fit
together and is the best first read before a non-trivial change.

## Development setup

See the [README quickstart](README.md#quickstart) for the short version, or
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for full setup detail (sandbox
containers, OAuth app registration, running each service independently,
tests).
Note that `npm run dev` starts its own API on port `8080`, so it cannot run
alongside the Docker compose backends; DEVELOPMENT.md has a table of which
combinations work together.

Prerequisites: Node.js 20.9 or newer, Go 1.26 or newer, Docker with Docker
Compose.

## Your first pull request

1. **Fork** [whiparc/whiparc](https://github.com/whiparc/whiparc) and clone
   your fork. A plain clone checks out `dev`, which is the branch you
   should build on.
2. **Create a branch** from `dev`:
   ```bash
   git checkout -b fix/short-description
   ```
3. **Make the change**, running the checks from the table above for the
   area you touched.
4. **Commit** using [Conventional Commits](#commit-style).
5. **Push** to your fork and open a pull request against `dev`.
6. **Fill in the PR template**: summary, linked issue, how you tested it,
   and screenshots for any UI change.
7. **Sign the CLA** if the bot asks (only for `apps/web/` and `apps/api/`).
8. **Respond to review**. Push follow-up commits to the same branch; do not
   open a new PR.

## Branching and PRs

- `main` is the release branch: protected, always deployable. What runs on
  whiparc.com is cut from `main`.
- `dev` is the integration branch and this repository's default branch, so a
  plain `git clone` checks out `dev`, which can be ahead of what is deployed.
  Branch from `dev` and PR your feature/fix branches back into `dev`. Use
  `git checkout main` if you want to see what is currently released.
- Branch naming: `feature/<short-description>`, `fix/<short-description>`,
  `docs/<short-description>` (not enforced by tooling, just a convention).
- Keep PRs scoped to one change. Large, multi-purpose PRs are harder to
  review and more likely to get stuck.
- Fill out the PR template. It exists so reviewers do not have to
  reconstruct context you already have.
- CI (`.github/workflows/ci.yml`) must pass: lint + build for the web
  workspace, `go build`/`go vet`/`go test` for each Go module. Run the
  relevant commands locally before pushing:
  ```bash
  # web
  cd apps/web && npm run lint && npm run build

  # any Go module (apps/api, apps/cli)
  cd apps/api && go vet ./... && go test ./...
  ```
- If your PR touches a BSL-licensed path, the CLA check will comment with
  instructions. Follow them before requesting review.

## Commit style

New commits should follow [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`) going forward;
this is not retroactively enforced on existing history, but it makes future
changelog generation possible. Squash-merge is fine; the PR title becomes
the commit message, so make it descriptive. Use a scope when it helps, for
example `fix(api): reject empty project names`.

## What reviewers look for

- **One purpose.** The PR does what its title says and nothing else.
- **It works.** You ran it, and the PR description says how. For UI changes,
  include a screenshot or short recording.
- **Tests.** Behavior changes in Go come with a `_test.go` case. The web
  workspace has no unit-test runner yet, so describe your manual test steps.
- **Docs move with code.** If you change setup steps, commands, flags or
  config keys, update the matching doc in the same PR. CLI changes also
  update `apps/web/app/docs/DocsPageV2.tsx`.
- **Matches the surrounding code.** Follow the naming, comment density and
  style already in the file; the repo's `.editorconfig` covers indentation.
- **No secrets, binaries or generated files.** Do not commit `.env`, build
  outputs, or compiled executables.

Maintainers aim to give a first response within a few working days.
Reviews are volunteer time; a polite ping after a week is fine.

## AI-assisted contributions

Using AI tools is fine. You remain the author: read and understand every
line you submit, run it, and be ready to explain it in review. Do not submit
generated changes you have not tested, and mention in the PR description
when a substantial part was AI-generated.

## Code of Conduct

Participation in this project is governed by the
[Code of Conduct](CODE_OF_CONDUCT.md). Report concerns to
bishalprasad321@gmail.com.

## How decisions get made

Whiparc currently has one maintainer ([@bishalprasad321](https://github.com/bishalprasad321))
who reviews and merges PRs. As the contributor base grows, component-level
maintainers may be added; see [.github/CODEOWNERS](.github/CODEOWNERS),
which is deliberately structured so a directory can be handed to a new
owner with a one-line change. If you have been consistently contributing to
a specific area and want to take on review responsibility there, open an
issue proposing it.

## Reporting bugs and requesting features

Use the issue templates. They ask for the information that is actually
needed to act on a report (repro steps, environment, expected vs. actual
behavior). Security vulnerabilities go through [SECURITY.md](SECURITY.md)
instead, not a public issue. Questions go to
[Discussions](https://github.com/whiparc/whiparc/discussions); see
[SUPPORT.md](SUPPORT.md).
