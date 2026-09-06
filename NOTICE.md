# License Notice

Whiparc is **open-core**: different parts of this repository are under
different licenses, split by directory. There is no single license that
covers the whole tree — check the table below (or the `LICENSE` file closest
to the code you're looking at) before reusing something.

| Path | License | Why |
| :--- | :--- | :--- |
| `apps/web/` | [Business Source License 1.1](LICENSE) | The visual canvas and Terraform/Ansible/Kubernetes compilers — the core product. |
| `apps/api/` | [Business Source License 1.1](LICENSE) | The Go runner, orchestration engine, RBAC, realtime collaboration backend, and credential vault. |
| `apps/cli/` | [MIT](apps/cli/LICENSE) | The `infracanvas` CLI and local Sandbox Agent client. Safe to audit and easy to contribute to. |
| `sandbox/` | [MIT](sandbox/LICENSE) | Docker Compose / Dockerfile configs for the local DevOps sandbox (LocalStack + SSH targets). |
| `spikes/` | [MIT](spikes/LICENSE) | Experimental / exploratory code, not part of the shipped product. |
| Everything else (docs, root config, this file) | MIT | Documentation and repo tooling. |

## What the Business Source License 1.1 (BSL) means in practice

- You can read, fork, modify, and self-host the BSL-licensed code, including
  for internal production use at your own organization, at no cost.
- You **cannot** offer it (or a substantial part of its functionality) to
  third parties as a hosted/managed multi-tenant service without a separate
  commercial agreement — see the Additional Use Grant in [`LICENSE`](LICENSE).
- Each version automatically converts to Apache License 2.0 four years after
  its first public release (the "Change Date"). This is a real commitment,
  not a marketing line — it's a mechanical term of the license text.
- Full parameters (Licensor, Additional Use Grant, Change Date, Change
  License) are declared at the top of [`LICENSE`](LICENSE).

## Contributing under this split

Pull requests that touch a BSL-licensed path (`apps/web/`, `apps/api/`)
require signing the [Contributor License Agreement](CLA.md) before merge.
PRs limited to MIT-licensed paths (`apps/cli/`, `sandbox/`, `spikes/`, docs)
do not require a CLA. See [CONTRIBUTING.md](CONTRIBUTING.md).

Note: the hosted Sandbox Agent Gateway that used to live at
`apps/agent-gateway/` in this repo has moved to a separate, fully private
Whiparc repository — it was never a good fit for either bucket above (it's
hosted-only infrastructure, not something meant to be publicly readable or
self-hostable at all), so it doesn't appear in this repo's tree or history
anymore.

This file is a plain-language summary for convenience; the license files
themselves are the actual legal terms and control in the event of any
conflict. Nothing here is legal advice.
