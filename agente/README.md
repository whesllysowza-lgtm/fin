# Documentação do Controle Financeiro

Este diretório descreve o projeto como está implementado no repositório. A aplicação é um controle financeiro pessoal em português, responsivo para celular e desktop, construído com React e Vite. O estado financeiro é compartilhado e persistido em uma linha do Supabase.

## Documentos

- [Visão geral e arquitetura](arquitetura.md): tecnologias, pastas e inicialização.
- [Funcionalidades e regras](funcionalidades.md): navegação e comportamento do produto.
- [Dados e persistência](dados-e-persistencia.md): formato do estado, sincronização e observações técnicas.
- [Configuração e operação](operacao.md): ambiente, Supabase e comandos disponíveis.

## Limites conhecidos

Esta documentação não presume recursos ausentes no código. Não há autenticação de usuário, separação de dados por pessoa no backend, testes automatizados encontrados, nem uma API própria para as operações financeiras. O alerta de salário depende de uma Edge Function do Supabase e de configuração do Resend.
