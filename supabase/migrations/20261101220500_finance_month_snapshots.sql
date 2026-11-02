create table if not exists public.finance_month_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);

create index if not exists finance_month_snapshots_user_updated_idx
  on public.finance_month_snapshots (user_id, updated_at desc);

alter table public.finance_month_snapshots enable row level security;

create policy "Users can read their monthly snapshots"
  on public.finance_month_snapshots for select
  using (auth.uid() = user_id);

create policy "Users can insert their monthly snapshots"
  on public.finance_month_snapshots for insert
  with check (auth.uid() = user_id);

create policy "Users can update their monthly snapshots"
  on public.finance_month_snapshots for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.set_finance_month_snapshots_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists finance_month_snapshots_set_updated_at on public.finance_month_snapshots;
create trigger finance_month_snapshots_set_updated_at
before update on public.finance_month_snapshots
for each row execute function public.set_finance_month_snapshots_updated_at();
