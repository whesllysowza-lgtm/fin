-- Garante que cada usuário tenha exatamente uma linha de estado,
-- permitindo os upserts do frontend por user_id.
create unique index if not exists finance_state_user_id_unique
  on public.finance_state (user_id);

-- A função de compatibilidade não é usada pelo frontend e não deve ficar
-- exposta via RPC para usuários anônimos ou autenticados.
revoke execute on function public.claim_legacy_finance_state() from anon, authenticated;
