<img src="public/icon-192.png" alt="TrackMyMetric icon" width="72" height="72">

# TrackMyMetric

**One place to record training, nutrition, recovery and daily progress.**

TrackMyMetric is a private web tracker designed for iPhone use. It brings workout sets, meal macros, daily habits and study goals into the same timeline, then turns recorded data into charts and a weekly review you can discuss in your own ChatGPT account.

This repository contains the working web application and the integration code built so far. **It is not yet a native iOS app. No OpenAI model API key is required.**

[Get started](docs/SETUP.md) · [Architecture](docs/ARCHITECTURE.md) · [Engineering decisions](docs/DECISIONS.md) · [Roadmap](docs/ROADMAP.md)

## What works today

| Area | Implemented behaviour |
| --- | --- |
| **Today** | Daily metrics, recovery notes, custom habits, consecutive-day streaks and editable targets. |
| **Train** | Exercises with per-set weight, reps and optional RPE; repeat a previous session; track heaviest loads. |
| **Fuel** | Portion-specific calories and macros, optional sugar/fibre/sodium, saved meal reuse and water logging. |
| **Progress** | 7-, 30- and 90-day charts, study and exam goals, and calculated weekly summaries. |
| **Coach** | Copy a weekly review into your existing ChatGPT conversation. Journal notes are excluded from this review. |
| **Your data** | Account-scoped storage, revision checks, JSON export, entry editing, and habit archive/restore/delete. |
| **iPhone web experience** | Responsive layout, Home Screen manifest and app icons. Internet access is required. |

### Integration status

| Integration | Current status | Remaining work |
| --- | --- | --- |
| ChatGPT conversation through copy-and-paste | Available | Paste the review into ChatGPT; recommendations do not write back automatically. |
| Direct ChatGPT connection through `/mcp` | Eight authenticated tools implemented and contract-tested | The current hosting account has not enabled Sites MCP; no plugin installation or live OAuth session has been verified. |
| Apple Health transfer through `/health` | Paste, preview, select and save interface plus Shortcuts setup guide implemented | Build the Shortcut and grant Health access on the iPhone; end-to-end device testing is outstanding. |
| Native HealthKit / background sync | Planned | Requires an iOS application and native permissions/integration. |
| App Store / TestFlight | Planned | No signed iOS build or distribution setup exists yet. |

The tracker itself makes no OpenAI model API calls. ChatGPT conversation uses the user's own account and its limits. The quick workout text parser is deterministic; it is not an AI model. Food photo recognition, WHOOP integration, push reminders and offline operation are not implemented.

## Run locally

Use **Node.js 24** and **pnpm 11.25.0**, matching the repository's package manager pin.

```bash
git clone https://github.com/ashishjuley10/trackmymetric.git
cd trackmymetric
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm dev
```

When using the source ZIP, extract it and run the remaining commands inside its `trackmymetric` directory.

Open **http://localhost:5173**. The development sign-in uses the starter's synthetic local account (`seedy@sites.test`), with a local database and no connection to the owner's saved records. It only works on loopback addresses. The [setup guide](docs/SETUP.md) explains local authentication, migrations and production hosting.

Fresh checkouts start with empty goals and exam details. Configure your own targets in the tracker.

## Stack

- **UI:** React 19, TypeScript, Tailwind CSS 4, shadcn components, Lucide icons and Recharts.
- **Application runtime:** Vinext with Vite and Next.js-style App Router conventions.
- **Storage:** Cloudflare D1 / SQLite, Drizzle schema definitions and committed SQL migrations.
- **Validation:** Zod schemas shared with server-side write paths.
- **Integrations:** Custom MCP Streamable HTTP endpoint and a user-reviewed Health transfer format.
- **Checks:** TypeScript, Node's test runner with real in-memory SQLite transactions, and a production build.

Exact dependency versions are pinned in [pnpm-lock.yaml](pnpm-lock.yaml).

## Data correctness

A blank day stays unknown; it is not counted as zero. Weekly averages use recorded days. Food values describe the whole entered portion, and an optional daily nutrient total is shown only when every meal provides that nutrient. Dates use `Europe/London`.

Edits carry revisions so a stale form cannot silently replace a newer update. MCP writes and Health imports store durable request receipts in the same database transaction as the write, allowing safe retries without duplicate meals, workouts or imports. Every database operation is scoped to the authenticated owner.

Read [the design notes](docs/DECISIONS.md) for the trade-offs and problems encountered during development.

## Checks

```bash
pnpm typecheck
pnpm test
pnpm build
```

The test suite covers authentication boundaries, owner isolation, protocol handling, note minimisation, validation, retries, transaction rollback, conflicting edits, Health conversions and overlapping sleep intervals. It uses the production handlers with an in-memory D1-compatible SQLite adapter.

GitHub Actions configuration is included in [.github/workflows/ci.yml](.github/workflows/ci.yml). See [verification notes](docs/VERIFICATION.md) for the results and the checks that still require a real device or hosted account. A passing build does not establish an active ChatGPT connection.

## Documentation

| Guide | What it covers |
| --- | --- |
| [Setup](docs/SETUP.md) | Install, local sign-in, database setup, commands and deployment boundaries. |
| [Architecture](docs/ARCHITECTURE.md) | Routes, application modules, storage and authentication trust boundary. |
| [Apple Health](docs/APPLE_HEALTH.md) | Transfer formats, source selection, sleep aggregation and import behaviour. |
| [ChatGPT / MCP](docs/CHATGPT.md) | Tool catalogue, activation blocker, privacy and retry semantics. |
| [Decisions](docs/DECISIONS.md) | Key implementation difficulties and why the current choices were made. |
| [Roadmap](docs/ROADMAP.md) | Concrete acceptance criteria for the next stages, including native iOS. |
| [Verification](docs/VERIFICATION.md) | Test evidence and known validation gaps. |
| [Changelog](CHANGELOG.md) | Implemented milestones and repository preparation. |

## Privacy and contributions

Production authentication relies on a trusted Sites gateway; the raw Worker must not be exposed as an independently authenticated service. The project is account-private, but does not claim end-to-end encryption. JSON exports contain journal notes and should be treated as personal data. See [SECURITY.md](SECURITY.md).

[CONTRIBUTING.md](CONTRIBUTING.md) describes the development workflow. No project-wide open-source licence has been selected. Existing third-party licence notices are retained in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
