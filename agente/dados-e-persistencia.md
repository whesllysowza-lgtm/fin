# Dados e persistência

## Modelo funcional

O tipo `AppSnapshot` de `client/src/pages/Home.tsx` representa o payload persistido:

| Campo | Conteúdo |
| --- | --- |
| `people`, `origins`, `expenses` | Listas para os seletores e edição de categorias |
| `entries` | Lançamentos do mês ativo (`id`, `person`, `origin`, `expense`, `value`) |
| `archivedMonths`, `archivedData` | Meses arquivados e seus lançamentos |
| `summaries` | Por mês, `salary`, `expenses` e `card` |
| `indicatorSettings` | Preferências estruturadas por pessoa (não efetivamente editáveis hoje) |
| `palette` | Cores `primary`, `background`, `card`, `text` |
| `currentMonth` | Rótulo do mês, por exemplo `Setembro 2026` |
| `alertEmail` | Destinatário do alerta de salário |

`selectedPerson`, aba aberta, pesquisa e estado dos modais são estados transitórios do navegador, não fazem parte do snapshot.

## Persistência Supabase

A migration cria `public.finance_state` com chave textual `id`, `payload jsonb` e `updated_at`. O cliente usa uma única linha com `id = 'main'`. RLS está habilitado, mas as políticas permitem leitura, inserção e atualização para os papéis `anon` e `authenticated`; portanto, qualquer cliente com a chave pública pode acessar o estado conforme essas políticas. A aplicação não implementa login nem isolamento por usuário.

Na inicialização, `Home` tenta carregar o payload remoto. Se houver estado remoto não vazio, ele é aplicado; se não, tenta ler as antigas chaves `wesly-*` do `localStorage`. Após o carregamento, alterações do estado persistido fazem upsert da linha. As chaves antigas só são removidas depois que um upsert conclui sem erro.

## Observações importantes da implementação

- `alertEmail` está incluído no payload, mas não aparece na lista de dependências do efeito que grava no Supabase. Alterar somente o e-mail pode não persistir até que outro campo observado seja alterado.
- Se a leitura remota falhar, o carregamento ainda é marcado como concluído e a rotina de gravação pode enviar o estado inicial/local ao Supabase. Em caso de erro de rede, considere conferir o estado remoto antes de recarregar, pois não há conflito nem fila de sincronização.
- A persistência é um documento JSON único, compartilhado. Não há sincronização em tempo real, versionamento, resolução de conflitos ou backup implementado no frontend.
- O cliente falha durante a inicialização se as variáveis Supabase não estiverem definidas; não existe modo offline independente.
- Há codificação de texto inconsistente visível em algumas strings portuguesas no código fonte. Ao editar esses arquivos, preservar UTF-8 e validar acentos na interface.

## Migração legada

As chaves reconhecidas são `wesly-people`, `wesly-origins`, `wesly-expenses`, `wesly-current-month`, `wesly-archived-months`, `wesly-archived-data`, `wesly-current-entries`, `wesly-monthly-summaries` e `wesly-indicator-settings`. A lógica está em `readLegacyState` e `applyCloudState`, em `client/src/pages/Home.tsx`.
