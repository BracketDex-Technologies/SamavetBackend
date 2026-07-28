-- Production indexes for tenant-scoped authentication, slip reporting, and audit timelines.
-- These are safe to re-run and keep high-volume mandal reads on indexed paths.

create index if not exists "user_sessions_live_lookup_idx"
  on "public"."user_sessions" ("id", "user_id", "revoked_at", "expires_at");

create index if not exists "vargani_slips_status_feed_idx"
  on "public"."vargani_slips" ("mandal_id", "festival_id", "status", "created_at" desc);

create index if not exists "vargani_slips_payment_feed_idx"
  on "public"."vargani_slips" ("mandal_id", "festival_id", "payment_mode", "created_at" desc);

create index if not exists "vargani_slips_area_feed_idx"
  on "public"."vargani_slips" ("mandal_id", "festival_id", "area_name", "created_at" desc);

create index if not exists "expenses_status_date_idx"
  on "public"."expenses" ("mandal_id", "festival_id", "status", "expense_date" desc);

create index if not exists "audit_events_mandal_timeline_idx"
  on "public"."audit_events" ("mandal_id", "created_at" desc);
