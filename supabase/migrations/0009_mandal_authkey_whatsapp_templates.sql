alter table public.mandals
  add column if not exists whatsapp_template_wid text,
  add column if not exists whatsapp_template_name text,
  add column if not exists whatsapp_template_language text,
  add column if not exists whatsapp_template_variable_count integer;

alter table public.mandals
  drop constraint if exists mandals_whatsapp_template_wid_format,
  add constraint mandals_whatsapp_template_wid_format
    check (whatsapp_template_wid is null or whatsapp_template_wid ~ '^[0-9]+$'),
  drop constraint if exists mandals_whatsapp_template_variable_count_range,
  add constraint mandals_whatsapp_template_variable_count_range
    check (
      whatsapp_template_variable_count is null
      or whatsapp_template_variable_count between 0 and 3
    );

comment on column public.mandals.whatsapp_template_wid is
  'Authkey WhatsApp template WID selected by a super admin for this mandal.';
