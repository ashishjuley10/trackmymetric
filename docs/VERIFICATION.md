# Verification record

Checked on 17 September 2026 in Linux with Node.js 24.19.0. Validation used the existing locked dependency installation from the working project; a fresh registry download and GitHub-hosted Actions run have not been performed for this export.

| Check | Result |
| --- | --- |
| TypeScript (`npm run typecheck`, same script as `pnpm typecheck`) | Passed. |
| Contract suite (`npm test`, same script as `pnpm test`) | 17 passed, 0 failed. |
| Production build (`npm run build`, portable execution profile) | Passed; compiled `/`, `/health`, `/api/data`, `/api/health` and `/mcp`. |
| Local D1 migrations | All three migrations applied successfully to a fresh local database. |
| ESLint | 19 errors and 10 warnings remain in existing application/test code. Not enabled as a required CI gate. |
| Local development server | Reported ready; HTTP checks from a separate execution session received connection-refused responses. Full local sign-in/browser workflow remains unverified in this environment. |
| GitHub Actions | Workflow prepared; has not run on GitHub. |
| Real iPhone / Shortcuts | Not tested. |
| Remote ChatGPT OAuth session | Not tested; hosting-account capability remains blocked. |

The contract suite uses real SQLite transactions with an in-memory D1-compatible adapter, production handlers and Zod validation. It verifies owner isolation, omitted notes, validation, retries, conflicts, atomic rollback, nutrition behaviour, Health conversions and sleep overlap/date handling. Expected simulated failures emit log lines during passing rollback tests.

The goal-patch test now seeds its own synthetic settings rather than depending on the original owner's default sleep target. The export starts with blank targets and uses the current host for the Health return address.

Lint findings include legacy CommonJS test imports, Next-style link/image rules, hook rules, explicit `any` types and unused declarations. They are recorded rather than hidden by broad rule suppression. Passing the selected CI gates should not be described as a clean lint result.

No visual browser, accessibility, performance, external security or native device audit is claimed. A compiled MCP route does not establish an active ChatGPT connection. A working Health parser does not establish that a Shortcut has been installed or authorised on an iPhone.
