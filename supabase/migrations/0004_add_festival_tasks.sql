create type "TaskStatus" as enum ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');
create type "TaskPriority" as enum ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

create table if not exists public.festival_tasks (
  id uuid primary key default gen_random_uuid(),
  mandal_id uuid not null references public.mandals(id) on delete restrict,
  festival_id uuid not null references public.festivals(id) on delete cascade,
  title text not null,
  notes text,
  assignee_user_id uuid references public.users(id) on delete set null,
  due_date date,
  status "TaskStatus" not null default 'OPEN',
  priority "TaskPriority" not null default 'MEDIUM',
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists festival_tasks_mandal_id_festival_id_status_due_date_idx
  on public.festival_tasks(mandal_id, festival_id, status, due_date);

create index if not exists festival_tasks_assignee_user_id_status_idx
  on public.festival_tasks(assignee_user_id, status);

alter table public.festival_tasks enable row level security;
