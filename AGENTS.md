<!-- BEGIN:nextjs-agent-rules -->
# Next.js 16 App Router Conventions

This project runs Next.js 16 (App Router) and React 19. APIs, conventions, dynamic route parameters (e.g. async `params`), and file structure differ from older versions. Read the relevant guide in `node_modules/next/dist/docs/` before modifying Next.js routes. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project Knowledge Base & Second Brain Protocol

## 1. Single Source of Truth (private, not in this repo)

This repository is public-facing / source-available and does not contain the
project's internal architecture knowledge base. Detailed architectural
context, data models, compiler internals, security implementation notes,
historical bug post-mortems, and business/licensing strategy are maintained
privately by Whiparc maintainers in a separate private repository, not
checked into `whiparc/whiparc`.

**If you are a Whiparc maintainer with access to that private repo**: consult
it first before planning, designing, or implementing non-trivial changes, and
update the corresponding note there when you add new database tables,
routes, or compiler features, or resolve a non-trivial bug — the same
discipline this file used to describe for a local `/obsidian_memory`, just
relocated.

**If you are an external contributor**: this file intentionally does not
enumerate that vault's contents or location. Use [CONTRIBUTING.md](CONTRIBUTING.md),
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), and the code itself as your
primary references; open an issue or ask in your PR if you need architectural
context a maintainer can supply from the private vault.

---

## 2. Documentation Style & Maintenance Rules

1. **No Emojis or Casual Icons**: Markdown documentation in this repository must maintain an engineering-grade, professional technical style. Do not use decorative emojis or casual icons in headings or body text.
2. **Preserve Cross-Links**: Maintain relative markdown file links within this repo (`README.md`, `docs/`, `NOTICE.md`, etc.) so documentation stays traversable.
