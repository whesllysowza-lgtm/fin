# Funcionalidades e regras

## Painel

- Permite selecionar uma pessoa e mostra os indicadores do mês corrente: salário, despesas, sobra e gastos no cartão.
- As despesas somam os lançamentos da pessoa selecionada; cartão soma os lançamentos cuja origem é exatamente `CARTÃO`.
- Salário e sobra são específicos de Wesly. Para as outras pessoas o salário é zero e a sobra não é apresentada.
- O salário inicial/fallback mensal é R$ 1.540,00. A sobra é salário menos despesas.
- Há atalhos para registrar despesa, abrir histórico, consultar gráfico e abrir o resumo anual.

## Registro

- O formulário cria lançamento com pessoa, origem, categoria de despesa e valor positivo.
- Os valores aceitam vírgula decimal. Um identificador baseado em `Date.now()` é gerado no navegador.
- Ao registrar, atualiza os totais do resumo mensal, limpa o formulário e abre o Histórico.

## Histórico

- Lista lançamentos da pessoa selecionada no mês ativo; pesquisa por pessoa, origem ou descrição.
- Permite editar ou excluir itens do mês corrente e dos meses arquivados. Essas ações recalculam totais de despesas e cartão.
- A opção de exportação gera CSV separado por ponto e vírgula, com BOM para compatibilidade com planilhas, e inclui total do mês.
- Meses arquivados podem ser expandidos na tela.

## Categorias

- Pessoas, origens e despesas podem ser renomeadas, adicionadas e removidas (mantendo ao menos um item por lista).
- Renomear atualiza os lançamentos atuais e arquivados correspondentes. Remover uma categoria não apaga lançamentos antigos que a usam.
- Pessoas e origens têm valores especiais usados nas regras: `Wesly` controla os indicadores de salário/sobra e `CARTÃO` controla o cálculo do total de cartão.

## Meses e resumos

- “Novo mês” arquiva os lançamentos e avança um mês no calendário nominal.
- Ao abrir com um mês salvo diferente do mês real do sistema, o efeito de inicialização arquiva os lançamentos restantes, prepara o mês atual e abre o Painel.
- O cabeçalho “Conta de …” abre um resumo dos 12 meses do ano corrente. Esse resumo permite editar diretamente salário, despesas e cartão.
- Alterações do resumo anual não são sincronizadas de volta aos lançamentos; os valores editados são totais agregados.

## Configurações, alerta e desfazer

- Configurações permitem editar o e-mail de alerta e as quatro cores da interface; cores podem ser restauradas aos padrões.
- Ao salvar salário igual a zero ou negativo, a aplicação invoca `send-salary-alert`. A função envia e-mail via Resend quando corretamente configurada.
- O botão de desfazer e `Ctrl+Z`/`Cmd+Z` oferecem um único snapshot anterior do estado principal.
- Embora exista estrutura de preferências de indicadores no estado, os controles exibidos no modal estão desativados e a tela calcula a configuração padrão por pessoa. Na implementação atual, os indicadores não são configuráveis pela interface.
