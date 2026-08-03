-- Query shapes used by workspace bootstrap and high-volume tenant dashboards.
-- CONCURRENTLY is intentionally omitted so this migration remains compatible
-- with Supabase's transactional migration runner.

create index if not exists users_mandal_status_created_at_idx
  on public.users (mandal_id, status, created_at);

create index if not exists festivals_mandal_status_start_date_idx
  on public.festivals (mandal_id, status, start_date desc);

create index if not exists members_mandal_festival_status_name_idx
  on public.members (mandal_id, festival_id, status, display_name);

create index if not exists slip_templates_mandal_festival_updated_at_idx
  on public.slip_templates (mandal_id, festival_id, updated_at desc);

create index if not exists audit_events_mandal_action_created_at_idx
  on public.audit_events (mandal_id, action, created_at desc);
