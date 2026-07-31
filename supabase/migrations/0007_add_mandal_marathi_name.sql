alter table public.mandals
  add column if not exists name_mr text;

comment on column public.mandals.name_mr is
  'Manual Marathi display name used for receipts and WhatsApp template variables.';
