create extension if not exists pgcrypto;

create table if not exists public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  mandal_id uuid references public.mandals(id) on delete set null,
  type text not null,
  status text not null default 'QUEUED',
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  run_after timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists background_jobs_status_run_after_created_at_idx
  on public.background_jobs(status, run_after, created_at);

create index if not exists background_jobs_mandal_id_status_created_at_idx
  on public.background_jobs(mandal_id, status, created_at);

alter table public.background_jobs enable row level security;

create or replace function public.set_background_jobs_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_background_jobs_updated_at on public.background_jobs;
create trigger set_background_jobs_updated_at
before update on public.background_jobs
for each row execute function public.set_background_jobs_updated_at();
