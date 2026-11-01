# Recuperar somente Outubro

O script `import-october-backup.mjs` faz uma simulação por padrão. Ele lê um JSON antigo, localiza a conta pelo e-mail e prepara uma cópia do payload atual alterando somente `Outubro 2026`, `archivedMonths` e o resumo desse mês. Se o mês atual da conta também for Outubro, ele atualiza `entries` com a mesma lista mesclada.

## Pré-requisitos

Use uma máquina segura e defina `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` apenas no terminal. A chave `service_role` ignora RLS e nunca deve ser colocada no navegador, no Vercel, no GitHub ou em um arquivo `.json`.

## Simulação

```bash
SUPABASE_URL="https://SEU_PROJETO.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="SUA_CHAVE_PRIVADA" \
node scripts/import-october-backup.mjs \
  --backup ./financas-backup.json \
  --email seu-email@example.com
```

Revise a prévia: conta encontrada, quantidade do backup, quantidade existente e quantidade final. Nada é gravado no modo padrão.

## Aplicação

Somente depois de conferir a prévia:

```bash
SUPABASE_URL="https://SEU_PROJETO.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="SUA_CHAVE_PRIVADA" \
node scripts/import-october-backup.mjs \
  --backup ./financas-backup.json \
  --email seu-email@example.com \
  --apply \
  --confirm-email seu-email@example.com
```

O script mescla por `id`, preserva o payload atual e grava uma única linha na conta correta. Faça um backup/exportação do estado atual antes de aplicar.

## Como verificar backups do Supabase

No Dashboard, abra **Database → Backups**. Os backups diários e a retenção dependem do plano. Para recuperação por horário, abra **Database → Point in Time** ou as configurações do add-on PITR. É mais seguro restaurar para um novo projeto, consultar a linha antiga de `public.finance_state` e extrair somente `Outubro 2026`. Não restaure diretamente a produção sem uma janela de manutenção e confirmação.

Fontes oficiais:

- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery
- https://supabase.com/docs/guides/platform/migrating-within-supabase/dashboard-restore
