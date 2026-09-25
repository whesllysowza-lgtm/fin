-- Isolamento definitivo: nenhum registro sem dono pode continuar acessível.
alter table public.finance_state
  add column if not exists user_id uuid references auth.users(id);

-- Preserva o estado legado somente quando houver uma única conta autenticada.
do $$
declare
  account_count integer;
  only_account uuid;
begin
  select count(*), min(id::text)::uuid into account_count, only_account from auth.users;
  if account_count = 1 then
    update public.finance_state
       set id = only_account::text,
           user_id = only_account,
           updated_at = now()
     where id = 'main' and user_id is null;
  end if;
end
$$;

-- Registros órfãos não podem ser atribuídos a um usuário incorreto.
delete from public.finance_state where user_id is null;
alter table public.finance_state alter column user_id set not null;

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
  using (auth.uid() = user_id);

create policy "finance_state_user_insert"
  on public.finance_state for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "finance_state_user_update"
  on public.finance_state for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on table public.finance_state from anon;
grant select, insert, update on table public.finance_state to authenticated;
