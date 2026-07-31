# Samavet ePawati backend

NestJS and PostgreSQL API for mandal management and digital Vargani receipts.

See [Production readiness](docs/PRODUCTION_READINESS.md) before any deployment.

## Local development

Copy `.env.example` to `.env.local`, start Redis if required by local tooling, and run:

```bash
pnpm install --frozen-lockfile
pnpm dev:api
```

Health endpoints:

- `/api/v1/health/live` checks the API process only.
- `/api/v1/health/ready` checks the database with a timeout.

## Verification

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The Render blueprint and Dockerfile are deployment inputs only. Review secrets, database migrations, region placement, backups, and load-test results before enabling production traffic.

