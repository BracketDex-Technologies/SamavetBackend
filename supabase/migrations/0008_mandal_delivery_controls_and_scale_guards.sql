-- Mandal-level delivery controls used by the API and dashboard.
alter table public.mandals
  add column if not exists slip_limit integer,
  add column if not exists whatsapp_mode text not null default 'AUTO_API';

alter table public.mandals
  drop constraint if exists mandals_slip_limit_check,
  add constraint mandals_slip_limit_check
    check (slip_limit is null or slip_limit > 0);

alter table public.mandals
  drop constraint if exists mandals_whatsapp_mode_check,
  add constraint mandals_whatsapp_mode_check
    check (whatsapp_mode in ('AUTO_API', 'MANUAL_SHARE'));

-- A narrow index keeps mandal-wide quota counts efficient as slip volume grows.
create index if not exists vargani_slips_mandal_quota_idx
  on public.vargani_slips (mandal_id);

-- Enforce one active version per template even during concurrent saves.
create unique index if not exists slip_template_versions_one_active_idx
  on public.slip_template_versions (template_id)
  where is_active = true;
