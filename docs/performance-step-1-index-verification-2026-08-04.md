# Performance follow-up — Step 1 index verification

Date: 2026-08-04  
Scope: read-only plan capture, application of `0011_high_scale_query_indexes.sql`, and repeat plan capture.

## Environment and data set

- The workspace exposes one configured Supabase Postgres database through the transaction pooler and direct connection.
- No separate staging database URL or linked Supabase/Vercel project is available locally. Therefore, staging could not be independently verified.
- The configured database backs a frontend URL of `https://epawati.samavet.in`, but the local environment labels itself `development`. It should not be called production solely from local configuration; deployment ownership must confirm that mapping.
- Largest representative tenant: Bajirao Road Natubag Mandal Trust.
- Representative festival: Ganpati Festival 2026.
- Representative volume: 40 slips, 2 expenses, 0 tasks, and 0 active member rows for the selected festival.

## Migration verification

Before the change, none of the five indexes declared by migration `0011` existed. The migration was applied to the configured database through its direct Postgres connection and all five indexes were verified in `pg_indexes`:

- `users_mandal_status_created_at_idx`
- `festivals_mandal_status_start_date_idx`
- `members_mandal_festival_status_name_idx`
- `slip_templates_mandal_festival_updated_at_idx`
- `audit_events_mandal_action_created_at_idx`

`ANALYZE` was run on the five affected tables before the second plan capture.

## Actual EXPLAIN (ANALYZE, BUFFERS) results

All times below are measured server execution times in milliseconds. Differences at this data size are dominated by cache and planning noise; they are not meaningful latency improvements.

| Query shape | Before plan | Before | After plan | After | Result |
| --- | --- | ---: | --- | ---: | --- |
| Active festival | Seq Scan + Sort | 0.038 ms | Seq Scan + Sort | 0.051 ms | Sequential scan remains |
| Members | Seq Scan/Hash Join + Sort | 0.070 ms | Seq Scan/Hash Join + Sort | 0.062 ms | Sequential scans remain |
| Users | Seq Scan + Sort | 0.090 ms | Seq Scan + Sort | 0.040 ms | Sequential scan remains |
| Templates | Existing Index Scan + Sort | 0.038 ms | Seq Scan + Sort | 0.039 ms | Planner chose sequential scan after statistics refresh |
| Audit events | Index Scan | 0.056 ms | Index Scan | 0.047 ms | Uses `audit_events_mandal_id_created_at_idx` |
| Custom fields | Index Scan + Incremental Sort | 0.051 ms | Index Scan + Incremental Sort | 0.040 ms | Uses existing custom-field index |
| Expense list | Seq Scan + Sort | 0.051 ms | Seq Scan + Sort | 0.038 ms | Sequential scan remains |
| Task list | Seq Scan + Sort | 0.075 ms | Seq Scan + Sort | 0.049 ms | Sequential scan remains |
| Slip list | Bitmap Index/Heap Scan + Sort | 0.105 ms | Bitmap Index/Heap Scan + Sort | 0.108 ms | Uses an existing tenant/festival index |

Every measured plan used shared-buffer hits and zero disk reads.

## Why PostgreSQL still selects sequential scans

The representative tables contain zero to only a few matching records. Reading their single heap page is cheaper than traversing an index, so PostgreSQL is correctly choosing a sequential scan. This is not evidence that the new indexes are invalid.

A diagnostic run with `enable_seqscan = off` (not used for the real measurements above) confirmed index eligibility:

- Active festival: `festivals_mandal_status_start_date_idx`
- Members: `members_mandal_festival_status_name_idx` plus `users_pkey`
- Templates: `slip_templates_mandal_festival_updated_at_idx`
- Users: the existing `users_mandal_id_role_idx` is preferred because the query orders by role first

## Sequential scans still in the bootstrap path

The real representative plan still performs sequential scans for active festival, members, users, templates, expenses, and tasks. At the current table sizes this is optimal. These queries must be rechecked once a tenant has thousands of rows; forcing index scans now would make the small workload slower.

The expense index matches the tenant/festival/date filter and the task index matches tenant/festival/status/due date. The task query additionally orders by `created_at`, so a future high-volume plan may still need a covering order index after cursor pagination defines the final keyset order.

## Step 1 conclusion

- Configured database: migration applied and all five indexes verified live.
- Staging: not verifiable because no staging connection or linked deployment is available.
- Production: the configured database may be the live database used by ePawati, but that cannot be independently proven from the local `development` environment.
- No Step 2 pagination or Step 3 bootstrap changes were started, as required by the ordered follow-up.
