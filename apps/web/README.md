# apps/web

The Whiparc web application: marketing site, dashboard, and the visual
canvas workspace. Next.js 16 (App Router), React 19, `@xyflow/react`,
Zustand and Tailwind CSS 4.

License: Business Source License 1.1 (see [NOTICE.md](../../NOTICE.md)).
Pull requests here require the [CLA](../../CLA.md).

> Next.js 16 differs from older versions in routing, async `params` and file
> conventions. Read the relevant guide in `node_modules/next/dist/docs/`
> before changing routes.

## Run it

From the repository root (starts the web app and the Go API together):

```bash
npm install
npm run dev
```

Or just this app, for example when the API runs in Docker:

```bash
npm run dev --workspace=web
```

It serves `http://localhost:3000` and calls the API at
`http://localhost:8080`. Override the API address with `NEXT_PUBLIC_API_URL`.
See [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md) for the backend options.

## Check your change

```bash
cd apps/web
npm run lint
npm run build
```

CI runs the same two commands. There is no unit-test runner yet, so describe
your manual test steps in the pull request (and add a screenshot for visual
changes).

## Layout

| Path | What is there |
| :--- | :--- |
| `app/<route>/page.tsx` | One folder per route: `dashboard`, `workspace`, `templates`, `runs`, `credentials`, `team`, `account`, `docs`, `login`, ... |
| `app/workspace/` | The canvas editor and its panels |
| `app/components/` | Shared components, including canvas nodes and edges (`canvas/`) and landing sections (`landing-v2/`) |
| `app/store/` | Zustand stores for the canvas and the session |
| `app/lib/` | Compilers (`exportYaml.ts`, `bundleGenerator.ts`), shared types and hooks |
| `public/brand/` | Logo and icon SVGs |

[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) explains how the canvas,
compilers and API connect.

## Conventions

- Pages named `*V2` use the blueprint design system; do not mix its styling
  with older pages' styling on the same page.
- When you change a node type, check both the browser compiler here and the
  server compiler in `apps/api/importer/compiler.go`.
- User-facing documentation (including CLI docs) lives in
  `app/docs/DocsPageV2.tsx`; update its navigation and search entries when
  you add content.
