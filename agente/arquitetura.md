# Visão geral e arquitetura

## Produto

O projeto implementa uma planilha de controle de despesas domésticas chamada “Controle financeiro”. A interface está em pt-BR, formata valores em reais e organiza lançamentos por pessoa, origem, despesa e mês. O layout adapta navegação e conteúdo a telas pequenas.

## Tecnologias

- React 19 e TypeScript para a interface e o estado local da tela.
- Vite 7 para desenvolvimento e build; Tailwind CSS 4 está integrado junto de estilos próprios.
- Wouter fornece o roteamento básico.
- Supabase JS é usado para ler e gravar o estado e invocar uma função de servidor.
- Recharts renderiza gráficos; Lucide fornece ícones; componentes base Radix/shadcn ficam em `client/src/components/ui`.

## Caminho de inicialização

1. `client/index.html` define o documento em português e o elemento `#root`.
2. `client/src/main.tsx` importa o CSS e monta o React.
3. `client/src/App.tsx` envolve a aplicação em ErrorBoundary, tema e provedores de tooltip/notificações; a rota `/` abre `Home` e as demais rotas mostram 404.
4. `client/src/pages/Home.tsx` contém a tela principal, regras de negócio, formulários, relatórios e sincronização. É o principal ponto de manutenção do produto.
5. `client/src/lib/supabase.ts` cria o cliente e exige `VITE_SUPABASE_URL` e `VITE_SUPABASE_KEY`.

## Estrutura relevante

```text
client/
  index.html
  src/
    App.tsx                 rotas e provedores
    main.tsx                montagem do React
    pages/Home.tsx           aplicação e regras financeiras
    pages/NotFound.tsx       página de rota inexistente
    lib/supabase.ts          cliente Supabase
    contexts/ThemeContext.tsx tema claro/escuro genérico
    hooks/                    hooks auxiliares
    components/ui/            componentes visuais reutilizáveis
    index.css                 estilos e breakpoints
supabase/
  migrations/                esquema e políticas SQL
  functions/                 funções de servidor (Deno)
vite.config.ts               configuração do Vite e alias @
tsconfig.json                configuração TypeScript
```

O alias `@` aponta para `client/src`. O tema de contexto inicia em claro e não é alternável no `App`; a paleta configurável do produto define variáveis CSS globais a partir de `Home` e colore o fundo, superfícies e acentos da interface.

## Organização da tela

`Home` seleciona entre quatro áreas: Painel, Registro, Histórico e Categorias. Componentes auxiliares como `Dashboard`, `HistoryView`, `CategoriesView`, `YearOverview` e modais também estão definidos no mesmo arquivo. A navegação aparece no topo e, em telas de até 720 px, na barra inferior.
