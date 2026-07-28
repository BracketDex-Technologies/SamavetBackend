# Feature Completion Audit

Status as of the current implementation.

## Verified Working

- Monorepo setup with NestJS API, Next.js web app, and Prisma database package.
- Supabase-ready PostgreSQL schema in Prisma.
- Supabase browser/server helpers for Next.js.
- Auth API foundation: login, refresh token rotation, logout, JWT guard, roles guard.
- Super admin mandal onboarding APIs.
- Festival setup APIs.
- Member and group setup APIs.
- Digital Vargani slip APIs:
  - active form lookup
  - create slip
  - duplicate-safe slip number sequence
  - list slips
  - get slip
  - cancel slip with audit event
- Expense category and expense APIs.
- Collection report API with totals by member, group, and payment mode.
- Collection report CSV export for accountant/shareable workflows.
- Custom vargani field APIs for per-festival configurable collection forms.
- Slip template and template version APIs, including active version selection per festival.
- Mandal audit-event query API for traceability.
- Printable server-rendered receipt HTML endpoint for each vargani slip.
- Live API-backed web flows for:
  - login/logout with persisted session
  - super-admin mandal onboarding
  - mandal/festival selection
  - festival creation and activation
  - custom vargani field creation
  - template version creation and activation
  - visual template builder with image preview, field selection, click placement, coordinate editing, font controls, alignment controls, and generated render JSON
  - member vargani slip generation
  - collection report refresh and CSV download
- Supabase public schema pushed and verified with all expected tables:
  `audit_events`, `custom_fields`, `expense_categories`, `expenses`, `festivals`, `mandals`,
  `member_groups`, `members`, `slip_sequences`, `slip_template_versions`, `slip_templates`,
  `user_sessions`, `users`, and `vargani_slips`.
- Focused API unit tests for CSV export, tenant isolation, and slug/key generation.
- Demo fallback data remains available when no API login is active.
- Akhilnayak Mitra Mandal demo data is seeded in Supabase with:
  - original attached vargani slip image asset
  - active Ganpati Festival 2026
  - 8 admin/khajindar/group leader/member logins
  - custom fields for donor type, building/lane, and receipt note
  - active template coordinates for slip number, date, name, address, building/lane, and amount
  - sample receipt `DM-GAN-2026-000003`

## Verified Build Checks

The following commands pass:

```bash
pnpm typecheck
pnpm build
pnpm lint
pnpm format:check
pnpm test
```

## Partial / Not Yet Production Complete

- Template builder now supports visual field placement; true file upload to object storage is still pending, so background images currently use URLs or committed demo assets.
- PDF/image receipt rendering worker is not implemented yet; printable server-rendered receipt HTML is implemented.
- Queue/Redis worker integration for receipt rendering and exports is not implemented yet.
- File storage upload to S3/Supabase Storage is not implemented yet.
- Row Level Security policies are not yet authored for Supabase because the backend currently enforces tenant isolation in NestJS.
- Broader automated integration tests and slip-sequence concurrency tests are not written yet.
- Production deployment pipeline is not configured yet.

## Next Required Production Milestones

1. Seed the first super admin and demo mandal credentials.
2. Build file upload/object storage for template images and bills.
3. Build PDF/image receipt rendering worker.
4. Add integration/concurrency tests for slip creation.
5. Add storage queues, observability, and deployment config.
