create table if not exists public.finance_month_snapshot_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,
  payload jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists finance_month_snapshot_history_user_month_idx
  on public.finance_month_snapshot_history (user_id, month, created_at desc);

alter table public.finance_month_snapshot_history enable row level security;

create policy "Users can read their monthly snapshot history"
  on public.finance_month_snapshot_history for select
  using (auth.uid() = user_id);

create policy "Users can append their monthly snapshot history"
  on public.finance_month_snapshot_history for insert
  with check (auth.uid() = user_id);

create or replace function public.prevent_finance_month_snapshot_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'finance_month_snapshot_history is append-only';
end;
$$;

drop trigger if exists finance_month_snapshot_history_no_update on public.finance_month_snapshot_history;
create trigger finance_month_snapshot_history_no_update
before update or delete on public.finance_month_snapshot_history
for each row execute function public.prevent_finance_month_snapshot_history_mutation();
