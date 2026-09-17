# Security and privacy

## Trust boundary

The production application expects a trusted Sites gateway to authenticate requests and set `oai-authenticated-user-*` headers. The application must not be exposed directly where arbitrary clients can forge these headers. Another hosting provider needs a verified authentication adapter first.

The Vite development plugin strips supplied identity headers and uses a synthetic local account only for loopback traffic. This mock is not included as production authentication.

## Implemented controls

- Server-resolved owner IDs and owner-scoped database keys/queries.
- Strict request validation, same-origin checks and bounded JSON bodies.
- Revision conflicts instead of silent overwrites.
- Atomic write receipts and idempotent retries for MCP and Health imports.
- Notes omitted from default tool reads and copied weekly reviews.
- Explicit Health preview and field selection; no raw Health data in URL parameters.
- Private/no-store API responses.

These controls have focused automated tests; they are not an independent security assessment.

## Handling data

The repository contains application source and synthetic test fixtures, not a production database or user log export. Do not commit personal exports, local databases, credentials, auth cookies, signing keys or environment files. Ignore patterns cover common locations, but do not replace a review of what is staged.

Account-private storage is not end-to-end encryption. JSON exports include journal notes. Health source labels are supplied by the importer and should not be treated as verified device signatures.

## Reporting a problem

Share a minimal synthetic reproduction with the repository owner through an existing private contact channel. Do not post health records, credentials or another user's data in an issue. If the repository later enables GitHub private vulnerability reporting, that can be used instead. No reporting inbox or private reporting feature is claimed to be configured.
