-- Isola cada planilha pelo usuário autenticado.
alter table public.finance_state
  add column if not exists user_id uuid references auth.users(id);

-- Permite upsert por usuário; valores nulos continuam permitidos para legado órfão.
create unique index if not exists finance_state_user_id_key
  on public.finance_state(user_id);

-- Se existir apenas uma conta antiga, associa o registro legado a ela.
-- Com mais de uma conta, o registro legado permanece órfão e não aparece para novos usuários.
do $$
declare
  account_count integer;
  only_account uuid;
begin
  select count(*), min(id) into account_count, only_account from auth.users;
  if account_count = 1 then
    update public.finance_state
       set id = only_account::text,
           user_id = only_account,
           updated_at = now()
     where id = 'main' and user_id is null;
  end if;
end
$$;

alter table public.finance_state enable row level security;
drop policy if exists "finance_state_public_read" on public.finance_state;
drop policy if exists "finance_state_public_insert" on public.finance_state;
drop policy if exists "finance_state_public_update" on public.finance_state;
drop policy if exists "finance_state_read" on public.finance_state;
drop policy if exists "finance_state_write" on public.finance_state;
drop policy if exists "finance_state_user_read" on public.finance_state;
drop policy if exists "finance_state_user_insert" on public.finance_state;
drop policy if exists "finance_state_user_update" on public.finance_state;

create policy "finance_state_user_read"
  on public.finance_state for select
  to authenticated
  using (user_id = auth.uid());

create policy "finance_state_user_insert"
  on public.finance_state for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "finance_state_user_update"
  on public.finance_state for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on table public.finance_state from anon;
grant select, insert, update on table public.finance_state to authenticated;
