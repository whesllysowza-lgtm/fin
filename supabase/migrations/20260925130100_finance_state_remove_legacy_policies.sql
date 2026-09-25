-- Mantém apenas as políticas vinculadas ao usuário autenticado.
drop policy if exists "finance_state_read" on public.finance_state;
drop policy if exists "finance_state_write" on public.finance_state;
revoke all on table public.finance_state from anon;
grant select, insert, update on table public.finance_state to authenticated;
