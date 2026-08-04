# Vercel Pro + Supabase Pro deployment

Deploy the frontend and API as separate Vercel projects. Keep both projects in
the same Vercel region as the Supabase project and enable Fluid Compute for the
API project.

## API environment

- `NODE_ENV=production`
- `DATABASE_URL`: Supabase transaction pooler URL on port `6543`, including
  `pgbouncer=true&connection_limit=5&pool_timeout=10`
- `DIRECT_URL`: direct Supabase database URL on port `5432`; use this only for
  Prisma migrations in CI, never as the Vercel runtime URL
- `PUBLIC_API_BASE_URL=https://<api-domain>/api/v1`
- `PUBLIC_WEB_BASE_URL=https://<web-domain>`
- `CORS_ORIGINS=https://<web-domain>` plus any explicitly approved preview URL
- unique 32+ character `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`
- `AUTH_COOKIE_SECURE=true`, `AUTH_STRICT_SESSION_CHECK=true`, and a cookie
  `SameSite` policy matching the final domains (`lax` for same-site web/API
  subdomains; `none` only when a genuinely cross-site frontend is required)
- a unique 32+ character `CRON_SECRET`; Vercel supplies it as the bearer token
  when invoking the protected background-job cron
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
  `SUPABASE_STORAGE_BUCKET=digital-vargani`
- `SUPABASE_RECEIPT_BUCKET=digital-vargani-receipts` and
  `STORAGE_SIGNED_URL_TTL_SECONDS=3600`
- WhatsApp and translation provider keys only when those integrations are enabled
- `SWAGGER_ENABLED=false`

Use the service-role key only in the API project. Never add it to a `VITE_*`
variable or the frontend project.

## Frontend environment

- `VITE_API_BASE_URL=https://<api-domain>/api/v1`

Update the frontend Content Security Policy `connect-src` when using a custom
API domain. Production assets are immutable and cached for one year.

## Release sequence

1. Run all committed SQL migrations through `DIRECT_URL` from CI, including
   `0010_background_job_idempotency.sql`.
2. Run backend typecheck, lint, tests, and build.
3. Deploy the API and verify `/api/v1/health`.
4. Run frontend lint and build; the build fails if the gzip bundle budget is
   exceeded.
5. Deploy the frontend and exercise login, year switching, slip creation,
   multipart receipt upload, filtered pagination, and streamed Excel export.

Monitor Vercel function error rate and p95 duration, Supabase database CPU,
connections and slow queries, and Storage egress. Raise function duration only
for a measured workload; the API is configured for 60 seconds, while normal
interactive routes should remain below two seconds.

## Production safety checklist

- Keep `digital-vargani-receipts` private. The API stores an internal object
  reference and creates an expiring URL only for an authenticated share.
  Branding and template assets may remain in the public asset bucket.
- Audit legacy receipt objects before launch with `pnpm storage:migrate-receipts`.
  This is a dry run by default. Set `APPLY=true` only after reviewing its exact
  object list; applied runs copy each receipt, update its database reference,
  and remove that exact object from the legacy public bucket.
- Place Vercel Functions beside the Supabase primary region. Use the transaction
  pooler on port `6543` at runtime and the direct port `5432` connection only for
  migrations.
- Enable Supabase daily backups before launch. If the required recovery point is
  below 24 hours, enable PITR and rehearse a restore into a separate project.
- Enable Vercel Web Analytics and Speed Insights. Alert when API p95 exceeds
  800 ms, the error rate exceeds 0.5%, readiness fails, or database connections
  approach the project limit.
- Configure Vercel Firewall rate limits for `/api/v1/auth/*` and write-heavy
  `/api/v1/vargani/*` routes. NestJS endpoint throttles remain a second layer;
  their in-memory counters are not global across horizontally scaled Functions.
- Failed WhatsApp calls are persisted as idempotent background jobs. Keep the
  one-minute Vercel cron enabled, alert on jobs that reach `FAILED`, and do not
  remove `CRON_SECRET` while automatic delivery is active. The first delivery
  remains synchronous for immediate user feedback; transient failures retry
  outside the request lifecycle.

## Performance verification

Install `k6`, deploy a staging environment with production-equivalent database
settings, then run:

```powershell
$env:BASE_URL='https://your-staging-api.vercel.app'
$env:ACCESS_TOKEN='short-lived-staging-token'
pnpm load:test
```

The committed thresholds require an error rate below 0.5% and p95 latency below
800 ms. Test 50 users first. Add a 200-user launch-surge scenario only after
reviewing Supabase Performance Advisor and `pg_stat_statements`.
