# Roadmap

This file tracks **known gaps between the UI and what is actually wired
up**, so contributors can find work that is clearly scoped. The live backlog
and in-flight work are in
[GitHub Issues](https://github.com/whiparc/whiparc/issues) and
[Discussions](https://github.com/whiparc/whiparc/discussions).

## Known placeholders

These pieces render something that is not backed by real data or behavior
yet. Each is a good, self-contained first contribution.

| Where | What is not real | Suggested direction |
| :--- | :--- | :--- |
| Dashboard overview, "Cloud spend this month" card (`apps/web/app/dashboard/DashboardV2.tsx`) | The amount and the "N of M runs were local" caption are hard-coded | Derive the caption from the runs already fetched for the dashboard, and either compute spend or remove the card until it can be |
| Right panel, security audit (`apps/web/app/components/RightPanel.tsx`) | Shows "Security audit coming soon" | Implement basic checks over the canvas graph (for example open ports, public storage), or hide the section |
| Template catalog, "Contribute" action | Not wired to a contribution workflow | Define the workflow in a Discussion first |

If you fix one, remove its row in the same pull request.

## How to propose something new

Open a [feature request](.github/ISSUE_TEMPLATE/feature_request.yml) or start
a [Discussion](https://github.com/whiparc/whiparc/discussions) rather than
editing this file directly. Issues are easier to discuss and track than a
Markdown list.
