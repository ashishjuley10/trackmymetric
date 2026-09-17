# Development setup

## Prerequisites

- Node.js 24, also recorded in `.nvmrc`. The tests use `node:sqlite`.
- pnpm 11.25.0, recorded in `package.json`.
- Git if cloning; an extracted source archive works too.

The reference environment is Linux. Windows developers can use WSL2. Native Windows and macOS setup have not been verified for this snapshot.

```bash
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm dev
```

Visit `http://localhost:5173`. Follow the development sign-in redirect. The bundled Vite plugin creates a synthetic local session for `seedy@sites.test`; it is not a real ChatGPT login. No API key or Cloudflare account is needed for local emulation.

## Local database

`wrangler.local.json` configures a placeholder D1 ID matching `vite.config.ts`. The `db:migrate:local` command explicitly uses `--local` and applies `drizzle/*.sql` to `.wrangler/state`. It does not modify the hosted database.

Run migrations before the first visit, and again after pulling a new migration. Existing migrations must remain immutable; add new ones with `pnpm db:generate`, then inspect the generated SQL before applying it.

Local records persist between development sessions in `.wrangler/state`. That directory is ignored by Git. The contract tests use a separate in-memory database and do not touch local or production records.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Development server on port 5173. |
| `pnpm typecheck` | TypeScript checking without emitting application JavaScript. |
| `pnpm test` | Database, MCP and Health contract tests. |
| `pnpm build` | Compile the server and browser application into `dist/`. |
| `pnpm db:generate` | Generate a migration after a schema change. |
| `pnpm db:migrate:local` | Apply migrations to the local emulated D1 database only. |
| `pnpm lint` | Existing ESLint configuration; see verification notes for its current status. |

Use the pnpm lockfile. Do not run the unused legacy npm installer helpers or generate a second package lockfile. `install:ci` is retained for the original managed Sites environment; ordinary clones use `pnpm install --frozen-lockfile`.

## Authentication and preview

The local mock is limited to Vite development mode, loopback hostnames and loopback client addresses. It strips incoming identity headers before adding its synthetic identity. It will not authenticate an iPhone visiting your computer's LAN address.

`pnpm start` serves the compiled Worker with Wrangler, but does not include Vite's local sign-in middleware. Use `pnpm dev` for an authenticated local preview. Do not send fake identity headers to simulate production authentication.

## Production hosting

This snapshot was derived from a private Sites deployment. The export omits the original deployment's project ID and private URL. `.openai/hosting.json` retains the binding declaration (`DB`) and MCP capability declaration, without pointing at the owner's existing project.

Production needs a real D1 binding, the committed migrations, HTTPS, and a trusted authentication layer that authenticates users and overwrites identity headers. Sites provides this gateway and owns its sign-in routes. A plain Worker deployment does not provide that identity layer automatically.

For another host, implement and verify authentication in `app/chatgpt-auth.ts` before exposing the service. Keep local mock authentication out of production. The GitHub workflow validates source; it does not deploy a website or touch the original app.

## Common issues

| Symptom | Check |
| --- | --- |
| `node:sqlite` unavailable | Use Node 24 rather than an older system installation. |
| A table does not exist | Run `pnpm db:migrate:local` from the repository root. |
| Sign-in loops on a network IP | Use `localhost`; the local mock deliberately rejects LAN clients. |
| Build succeeds but compiled preview redirects | Production output expects a trusted auth gateway; use the Vite dev server locally. |
| Frozen installation fails | Verify the pinned pnpm version and read the error; do not delete the lockfile to suppress it. |
