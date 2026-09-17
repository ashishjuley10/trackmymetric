# Verification record

Checked on 17 September 2026 locally in Linux with Node.js 24.19.0 and independently on a GitHub-hosted Ubuntu runner using Node.js 24. Local checks reused the working project's locked dependency installation. GitHub Actions also completed a fresh frozen-lockfile installation, TypeScript checking, all 17 contract tests and the production build.

| Check | Result |
| --- | --- |
| TypeScript (`npm run typecheck`, same script as `pnpm typecheck`) | Passed. |
| Contract suite (`npm test`, same script as `pnpm test`) | 17 passed, 0 failed. |
| Production build (`npm run build`, portable execution profile) | Passed; compiled `/`, `/health`, `/api/data`, `/api/health` and `/mcp`. |
| Local D1 migrations | All three migrations applied successfully to a fresh local database. |
| ESLint | 19 errors and 10 warnings remain in existing application/test code. Not enabled as a required CI gate. |
| Local development server | Reported ready; HTTP checks from a separate execution session received connection-refused responses. Full local sign-in/browser workflow remains unverified in this environment. |
| GitHub Actions | Passed: frozen dependency install, TypeScript, all 17 tests and production build. [View the successful run](https://github.com/ashishjuley10/trackmymetric/actions/runs/35236044680). |
| Real iPhone / Shortcuts | Not tested. |
| Remote ChatGPT OAuth session | Not tested; hosting-account capability remains blocked. |

The contract suite uses real SQLite transactions with an in-memory D1-compatible adapter, production handlers and Zod validation. It verifies owner isolation, omitted notes, validation, retries, conflicts, atomic rollback, nutrition behaviour, Health conversions and sleep overlap/date handling. Expected simulated failures emit log lines during passing rollback tests.

The goal-patch test now seeds its own synthetic settings rather than depending on the original owner's default sleep target. The export starts with blank targets and uses the current host for the Health return address.

Lint findings include legacy CommonJS test imports, Next-style link/image rules, hook rules, explicit `any` types and unused declarations. They are recorded rather than hidden by broad rule suppression. Passing the selected CI gates should not be described as a clean lint result.

No visual browser, accessibility, performance, external security or native device audit is claimed. A compiled MCP route does not establish an active ChatGPT connection. A working Health parser does not establish that a Shortcut has been installed or authorised on an iPhone.

The successful GitHub run validated application commit `c057d21732a66c36725b2675c63ff74beac04611`. This subsequent documentation-only update records that result and skips another identical CI run.
