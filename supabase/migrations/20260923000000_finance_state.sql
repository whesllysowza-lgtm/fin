-- Estado persistente da planilha. O payload mantém compatibilidade com os dados
-- legados enquanto o produto ainda usa um modelo de estado único no frontend.
create table if not exists public.finance_state (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.finance_state enable row level security;

drop policy if exists "finance_state_public_read" on public.finance_state;
create policy "finance_state_public_read"
  on public.finance_state for select
  to anon, authenticated
  using (true);

drop policy if exists "finance_state_public_insert" on public.finance_state;
create policy "finance_state_public_insert"
  on public.finance_state for insert
  to anon, authenticated
  with check (true);

drop policy if exists "finance_state_public_update" on public.finance_state;
create policy "finance_state_public_update"
  on public.finance_state for update
  to anon, authenticated
  using (true)
  with check (true);

revoke all on table public.finance_state from public;
grant select, insert, update on table public.finance_state to anon, authenticated;
