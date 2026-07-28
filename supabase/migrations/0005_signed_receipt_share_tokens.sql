alter table public.vargani_slips
  add column if not exists public_share_token_hash text,
  add column if not exists public_share_token_expires_at timestamptz;

create index if not exists idx_vargani_slips_public_share_token_hash
  on public.vargani_slips(public_share_token_hash);

create index if not exists idx_vargani_slips_public_share_token_expires_at
  on public.vargani_slips(public_share_token_expires_at);
