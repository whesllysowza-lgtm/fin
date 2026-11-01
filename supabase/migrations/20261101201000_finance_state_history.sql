-- Histórico imutável do estado financeiro por usuário.
-- Mantém snapshots futuros sem alterar o formato usado pelo frontend.
create table if not exists public.finance_state_history (
  id bigint generated always as identity primary key,
  state_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists finance_state_history_user_created_idx
  on public.finance_state_history (user_id, created_at desc);

alter table public.finance_state_history enable row level security;

drop policy if exists "finance_state_history_user_read" on public.finance_state_history;
create policy "finance_state_history_user_read"
  on public.finance_state_history for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.finance_state_history from anon;
grant select on table public.finance_state_history to authenticated;

create or replace function public.capture_finance_state_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.finance_state_history (state_id, user_id, payload)
  values (new.id, new.user_id, new.payload);
  return new;
end;
$$;

revoke all on function public.capture_finance_state_history() from public, anon, authenticated;

drop trigger if exists finance_state_history_after_write on public.finance_state;
create trigger finance_state_history_after_write
after insert or update of payload, user_id on public.finance_state
for each row execute function public.capture_finance_state_history();
