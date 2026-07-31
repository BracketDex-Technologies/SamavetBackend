# Samavet ePawati production readiness

Deployment must only begin after every blocking item below is complete.

## Hosting topology

- Frontend: Vercel, with `VITE_API_BASE_URL=https://samavetbackend.onrender.com/api/v1` configured for the Production environment. Only `VITE_` values are exposed to browser code; no database, JWT, Supabase service-role, or WhatsApp secret belongs in Vercel.
- API: Render Docker web service in Singapore. Let Render supply `PORT`; the API binds to `0.0.0.0` and honors that value automatically. Keep `/api/v1/health/live` as Render's deployment health check.
- Database and Storage: Supabase Pro. Runtime Prisma traffic uses the pooled `DATABASE_URL`; migrations and administrative commands use `DIRECT_URL`.
- Public frontend: `https://epawati.samavet.in`. Set this exact origin in Render `CORS_ORIGINS`; add the stable Vercel project domain only if it must also access production APIs.

## 1. Security gates

- Rotate the database password, both JWT secrets, Supabase service-role key, and WhatsApp API key. Values previously shared in chat or screenshots must be considered compromised.
- Store production secrets only in the hosting provider's encrypted environment variables. Never put them in Git, Vite variables, screenshots, or frontend code.
- Set `NODE_ENV=production`, `SWAGGER_ENABLED=false`, and a production-only `CORS_ORIGINS` value.
- Keep `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` different and randomly generated.
- Confirm Supabase Storage buckets are private unless an asset is intentionally public.

## 2. Database gates

- Apply every SQL file in `supabase/migrations` in numeric order, including `0008_mandal_delivery_controls_and_scale_guards.sql`.
- Use the Supabase transaction pooler for `DATABASE_URL`; reserve `DIRECT_URL` for migrations and administration.
- Add a conservative Prisma connection limit to the pooled URL, for example `connection_limit=10&pool_timeout=10`, then tune from actual pool metrics.
- Supabase Pro includes daily backups with seven-day retention. Decide whether paid Point-in-Time Recovery is required for the business recovery objective before onboarding paying mandals.
- Restore a backup into a staging project at least once. A backup that has not been restored is not verified.

## 3. Region and scaling gates

- Keep the API and database geographically close. The supplied database hostname is in `ap-northeast-1`; the Render blueprint uses Singapore because it is the closest available Render region. Do not place this API in Oregon, Frankfurt, or another distant Render region.
- Use a paid always-on API instance for production. Free/cold-start instances are unsuitable for login and receipt generation.
- Start with one API instance. Scale horizontally only after verifying database connection headroom; the API is stateless and the database job claim is multi-worker safe.
- Serve the Vite frontend through a CDN (Vercel or the included Nginx image).

## 4. Verification gates

Run from the backend repository:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm audit --prod
docker build -t samavet-api:release-candidate .
```

Run from the frontend repository:

```bash
npm ci
npm run lint
npm run build
npm audit --omit=dev
docker build -t samavet-frontend:release-candidate .
```

After staging deployment, verify:

- `GET /api/v1/health/live` responds without touching the database.
- `GET /api/v1/health/ready` returns HTTP 200 and `database: ok`.
- Login, refresh, and logout work on Android and iPhone browsers.
- A member only sees their own slips.
- Admin sees collector names and date ordering.
- Slip quota rejects the first slip beyond the configured limit.
- Automatic and manual WhatsApp modes both work.
- Template upload, Marathi preview, save, reload, and receipt rendering work.
- A generated receipt remains downloadable after a fresh login.

## 5. Operational gates

- Configure uptime checks against `/api/v1/health/live` and a separate lower-frequency readiness check against `/api/v1/health/ready`.
- Alert on HTTP 5xx rate, p95 latency, database pool saturation, failed WhatsApp calls, and failed background jobs.
- Preserve the `x-request-id` response header in proxy logs for incident tracing.
- Define an incident owner and support contact before launch.
- Run a staged load test with realistic images and data. Minimum acceptance target: no errors at expected peak concurrency, p95 read latency below 1 second, and p95 slip creation below 2 seconds when the API and database are co-located.

## 6. Release sequence

1. Rotate and configure secrets.
2. Back up the database.
3. Apply migrations.
4. Deploy to staging.
5. Complete functional and load verification.
6. Freeze schema changes.
7. Deploy the API and confirm readiness.
8. Deploy the frontend with the production API URL.
9. Monitor errors and latency throughout the first live collection window.
