# Development workflow

1. Follow [SETUP.md](docs/SETUP.md) and use the pinned pnpm version.
2. Create a focused branch. Keep generated migrations, schema changes and their call sites together.
3. Make the change and update the relevant documentation. Do not describe an integration as connected until an actual authorised session has been verified.
4. Run `pnpm typecheck`, `pnpm test` and `pnpm build`.
5. Review the diff for credentials, local state and personal records before committing.

Tests should exercise behaviour: account isolation, conflicting writes, retries, validation and derived values. Use synthetic fixtures. Changes to transactional writes need rollback and duplicate-request coverage. Do not edit previously applied migrations.

Use a pull request that explains the problem, resulting behaviour, verification and remaining limitations. The repository has a PR template. ESLint is currently an advisory command, not a required gate; see [VERIFICATION.md](docs/VERIFICATION.md).

The GitHub source snapshot has generic defaults and deployment metadata. Changes here do not automatically update the original private Site; deployment is a separate workflow.
