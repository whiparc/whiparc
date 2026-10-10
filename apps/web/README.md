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
npm test
npm run build
```

`npm test` runs the [Vitest](https://vitest.dev) unit tests, which live next to
the code in `__tests__/` folders (for example `app/lib/__tests__/` covers the
Terraform and Ansible compilers). Use `npm run test:watch` while developing.

Playwright smoke tests in `e2e/` check that the main routes render and that
signed-out visitors are sent to login. They need only the web app, not the API:

```bash
npx playwright install chromium   # once
npm run test:e2e
```

Playwright starts `npm run dev` itself, or reuses a server already running on
port 3000. The first request to each route compiles it, so the first run is
slow. If you already have Chrome installed, `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`
skips the browser download.

CI runs lint, unit tests, the build and the e2e smoke tests. Add a unit test
for any change to a compiler or store, and describe manual steps (with a
screenshot for visual changes) for anything the tests do not cover.

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
