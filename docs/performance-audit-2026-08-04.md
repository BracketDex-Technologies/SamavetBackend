# Production performance audit — 2026-08-04

## Scope and corrected assumptions

The supplied brief described a Vue/Pinia frontend and Supabase Auth. The deployed code uses React 19, React Query, an app-owned NestJS authentication flow, Prisma, Supabase Postgres, and Supabase Storage. Recommendations and changes below follow the actual architecture.

## Executive summary

The application already had several production safeguards: Vercel/Supabase transaction pooling, API compression, global DTO validation, tenant-scoped indexes, paginated slip queries, idempotent slip creation, client-side session persistence through an HttpOnly refresh cookie, optimistic local insertion after most successful mutations, and a durable Postgres retry queue.

The main bottlenecks found were:

1. Strict session authorization queried Postgres for every protected API request.
2. Workspace bootstrap is a large fan-out query containing dashboard, user, member, group, template, audit, metric, and first-page slip data.
3. Expenses and tasks were refreshed only during a full workspace load or local mutation, allowing cross-device data to become stale.
4. Expense creation waited for the proof-photo upload before closing the form.
5. Expense listing created one Supabase signed-URL request per proof image.
6. WhatsApp retry delay was constant, and provider requests needed a hard timeout.
7. The frontend is a large single `App.tsx`; route-level lazy loading requires a future component/route split.

## Current request flows

### Login and workspace

Fresh login now performs this critical path:

1. `POST /auth/login` verifies the indexed email/phone lookup and Argon2 password, creates the server session, and sets the HttpOnly refresh cookie (`apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/auth.controller.ts`).
2. `GET /workspace/bootstrap` returns the minimum complete workspace required to render (`apps/api/src/workspace/workspace.service.ts:206`).
3. Tasks and expenses hydrate after the workspace is visible (`src/App.tsx:1282`).

The frontend keeps one sign-in state until bootstrap completes (`src/App.tsx:1073`). Saved sessions use the refresh cookie and cached workspace, so route changes do not reauthenticate.

Strict authorization remains enabled, but a bounded 15-second session cache now avoids repeated database checks during API bursts while limiting revocation staleness (`apps/api/src/auth/auth.service.ts:137`). Logout evicts the cached session immediately.

### Dashboard/API load

Mandal bootstrap launches its independent reads concurrently rather than serially (`apps/api/src/workspace/workspace.service.ts:270`). It returns:

- current mandal and active festival;
- custom fields, groups, up to 100 members, templates and users;
- the first 25 slips plus pagination metadata;
- collection/expense aggregates and recent audit events.

After render, the frontend refreshes lightweight metrics, current tasks, expenses, and the newest slip page concurrently. It repeats every 30 seconds only while visible and refreshes immediately when the tab regains focus (`src/App.tsx:1161`, `src/App.tsx:1226`).

### Expenses and stale data

Creating an expense now inserts a temporary row and adjusts dashboard totals immediately, closes the form, uploads/saves in the background, replaces the temporary row with the server record, and rolls back both row and totals on failure (`src/App.tsx:1899`).

Cross-device changes reconcile through the polling/focus fallback. Expense proof links are signed in one batch per bucket instead of one storage request per expense (`apps/api/src/expenses/expenses.service.ts:93`, `apps/api/src/storage/storage.service.ts:142`).

### WhatsApp receipt path

For a paid slip, the UI creates the slip immediately, then renders and uploads its receipt image in the background. The upload request asks the backend to submit the AuthKey message in the same server invocation, removing a second browser-dependent round trip. The UI remains responsive while this happens (`src/App.tsx:1599`, `apps/api/src/vargani/vargani.service.ts`).

AuthKey calls have a 10-second timeout (`apps/api/src/vargani/whatsapp-receipt.service.ts:153`). Failed calls enter the durable `background_jobs` table and retries now use exponential backoff with a 15-minute cap (`apps/api/src/jobs/jobs.service.ts:92`). The Vercel cron safely drains jobs with row locking and deduplication.

This is a hybrid direct-send plus durable-retry design. It avoids the one-minute minimum Vercel cron delay on successful messages while retaining failure recovery. A pure BullMQ worker is not appropriate inside ephemeral Vercel functions without a persistent Redis worker.

## Database and Supabase findings

- Production configuration already targets Supabase's transaction pooler on port 6543 with `pgbouncer=true`, a bounded connection pool, and a direct URL reserved for migrations (`.env.example:19`).
- Existing slip, expense, task, session, and audit indexes cover the principal tenant filters.
- Migration `0011_high_scale_query_indexes.sql` adds missing workspace sort/filter indexes for users, festivals, members, templates, and action-filtered audit timelines.
- Prisma is the only application data path and connects with the backend database role. RLS is enabled to deny unintended direct browser access; the app does not run complex per-row Supabase client policies, so RLS is not adding query-plan overhead to the Prisma path.
- Slip lists are paginated at 25 records. Owner bootstrap is capped at 24 mandals, members at 100, users at 50, and audit events at 25.
- Expense and task list endpoints remain array-shaped for backward compatibility. They should receive cursor pagination before individual festivals can accumulate thousands of rows.

## Frontend findings

The production build currently emits approximately 128 KB gzip JavaScript and 27 KB gzip CSS. React, React Query, and icons are already split into stable manual chunks (`vite.config.ts:14`). Query data has a 30-second stale time and does not refetch on every window focus (`src/lib/queryClient.ts:12`).

The main remaining bundle limitation is that all product screens live in one `App.tsx`, preventing useful route-level lazy imports. Splitting owner, mandal, member, receipt renderer, and template editor into independent route components is recommended before adding more features.

Long slip history uses backend pagination. Expense/task tables still render the loaded collection directly and need cursor pagination or virtualization at high per-festival volumes. Search/filter requests for slips are explicit user actions rather than keystroke-triggered network requests, so no network debounce is currently required.

## Backend findings

- Compression is enabled globally (`apps/api/src/common/bootstrap/configure-http-app.ts:24`).
- DTO transformation, whitelisting, and early rejection are enabled globally (`apps/api/src/common/bootstrap/configure-http-app.ts:58`).
- Personalized responses default to `Cache-Control: no-store`; the lightweight workspace summary now uses a safe five-second private browser cache (`apps/api/src/workspace/workspace.controller.ts:22`).
- Slow requests at or above two seconds and all 5xx responses are logged with request IDs and response-time headers.
- Bootstrap contains many queries, but they are issued concurrently. At larger tenant sizes, it should be split into route-specific resources and fetched only for the active screen.

## Prioritized follow-up list

### Critical before very high scale

1. Add cursor pagination to expenses, tasks, members, users, and owner mandals.
2. Move workspace screen data out of the bootstrap payload and lazy-fetch only the active route.
3. Add durable WhatsApp delivery-status columns/events and expose queued/sent/delivered/failed states in the slip table.
4. Configure AuthKey delivery webhooks so “delivered” reflects provider delivery rather than HTTP acceptance.
5. Apply and verify migration `0011_high_scale_query_indexes.sql` in staging, then production with `EXPLAIN (ANALYZE, BUFFERS)` on representative tenant data.

### High value

1. Split `App.tsx` by role and route, then lazy-load the template editor and receipt renderer.
2. Replace the 30-second polling fallback with Supabase Realtime only after authenticated tenant-scoped RLS policies and reconnect/backfill behavior are implemented.
3. Add server-side timing histograms for login lookup, Argon2 verification, bootstrap query groups, storage upload/signing, and AuthKey latency.
4. Add a managed push queue such as Upstash QStash or a persistent Redis/BullMQ worker if message volume outgrows the direct-send/retry hybrid.

### Nice to have

1. Split the large stylesheet by route after component extraction.
2. Add list virtualization only when real row counts demonstrate a rendering bottleneck.
3. Add CDN caching for explicitly public, immutable assets; keep receipts and authenticated JSON private.

## Expected impact

- Repeated protected requests within a 15-second burst reuse verified authorization instead of each querying `user_sessions`.
- Cross-device dashboard data self-heals within 30 seconds and immediately on focus, without manual refresh.
- Expense forms close immediately; proof upload latency no longer blocks the interaction.
- Expense proof URL generation changes from up to N Supabase calls to one call per storage bucket.
- AuthKey hangs are bounded at 10 seconds and retries spread exponentially instead of creating synchronized retry traffic.
- New composite indexes remove sort/filter work from the most common workspace bootstrap query shapes.

## Assumptions

- Vercel and the frontend remain separate deployments.
- The production API continues using Supabase's transaction-pooler URL.
- AuthKey credentials and the Vercel cron secret are configured in the backend project.
- A maximum 15-second delay in enforcing a revoked session on an already-warm function is acceptable; lower the cache TTL if policy requires immediate revocation.
