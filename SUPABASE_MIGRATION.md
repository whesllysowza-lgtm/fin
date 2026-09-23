# Migração para Supabase

A planilha agora usa o Supabase como fonte de verdade. O estado atual da aplicação é salvo em `public.finance_state` como um `jsonb`, preservando lançamentos atuais, meses arquivados, categorias, resumos e configurações sem alterar o formato funcional da tela.

## Configuração

Defina no ambiente de execução:

```bash
VITE_SUPABASE_URL=https://<seu-projeto>.supabase.co
VITE_SUPABASE_KEY=<sua-chave-publishable-ou-anon>
```

Aplique [`supabase/migrations/20260923000000_finance_state.sql`](supabase/migrations/20260923000000_finance_state.sql) no SQL Editor do projeto Supabase.

## Preservação dos dados

Na primeira abertura, a aplicação consulta a linha `id = 'main'`. Se ela já existir, os dados remotos têm prioridade. Se ainda não existir, os dados legados encontrados nas chaves `wesly-*` do `localStorage` são carregados em memória e enviados ao Supabase por `upsert`. As chaves locais só são removidas depois de uma gravação remota bem-sucedida; portanto, uma falha de rede não apaga a cópia legada.

Depois da migração, o navegador não grava mais alterações no `localStorage`; ele é usado apenas uma vez como fonte de importação retrocompatível.

## Observação de acesso

O aplicativo atual não tem fluxo de login de usuário na tela e usa uma única planilha compartilhada (`id = 'main'`). Por isso, a migration fornece políticas RLS para `anon` e `authenticated`, mantendo o comportamento atual. Se a planilha passar a ser multiusuário, as políticas devem ser restringidas por `auth.uid()` e o payload deve ser separado por usuário.
