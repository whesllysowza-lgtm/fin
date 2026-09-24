# Configuração e operação

## Requisitos

- Node.js compatível com Vite 7 e um gerenciador de pacotes. O repositório declara `pnpm@10.4.1` e inclui `pnpm-lock.yaml` e `package-lock.json`.
- Projeto Supabase com a migration aplicada.
- Variáveis de ambiente disponíveis para Vite no diretório raiz do projeto.

## Ambiente

Crie um `.env` local (não versionado) com:

```dotenv
VITE_SUPABASE_URL=https://<projeto>.supabase.co
VITE_SUPABASE_KEY=<chave-publishable-ou-anon>
```

O código lança erro se qualquer valor estiver ausente. A chave é entregue ao frontend; as políticas RLS abertas da migration definem o acesso compartilhado atual. Não coloque a chave `service_role` no cliente.

## Comandos do package.json

```bash
pnpm install
pnpm dev       # servidor Vite acessível na rede local
pnpm build     # build de produção em dist/
pnpm preview   # servidor local para pré-visualizar o build
pnpm check     # verificação TypeScript sem emitir arquivos
```

Também existe `pnpm format`, que aplica Prettier ao repositório inteiro; verifique o diff antes de usá-lo em mudanças localizadas.

## Supabase e alerta de e-mail

1. Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_KEY` no ambiente de build/execução.
2. Aplique `supabase/migrations/20260923000000_finance_state.sql` no projeto Supabase. O mesmo procedimento é descrito em `SUPABASE_MIGRATION.md`.
3. Para alertas, publique a Edge Function `supabase/functions/send-salary-alert/index.ts` e configure `RESEND_API_KEY`; opcionalmente defina `ALERT_FROM_EMAIL`.
4. A função envia via API do Resend e aceita `to`, `month` e `salary`. O chamador dispara quando o salário salvo é menor ou igual a zero.

## Build e publicação

Vite usa `client` como raiz, `client/public` como diretório público e gera o build em `dist` na raiz do repositório. O servidor de desenvolvimento e o preview escutam em todas as interfaces (`--host`). A publicação precisa servir a aplicação de forma compatível com o roteamento client-side e incluir as variáveis Vite no momento do build.
