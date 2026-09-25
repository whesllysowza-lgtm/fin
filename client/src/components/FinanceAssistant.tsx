import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Calculator, CheckCircle2, Send, Sparkles, X } from "lucide-react";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type AssistantEntry = { person: string; origin: string; expense: string; value: number };
type AssistantMessage = { id: number; role: "assistant" | "user"; text: string };

type FinanceAssistantProps = {
  person: string;
  month: string;
  salary: number;
  expenses: number;
  card: number;
  leftover: number;
  entries: AssistantEntry[];
  onClose: () => void;
};

function calculateExpression(input: string): number | null {
  const normalized = input
    .replaceAll(",", ".")
    .replace(/R\$\s?/gi, "")
    .replace(/x/gi, "*")
    .trim();
  if (!normalized || !/[+\-*/]/.test(normalized) || !/^[0-9+\-*/().\s]+$/.test(normalized)) return null;
  const tokens = normalized.match(/(?:\d+(?:\.\d+)?|[()+\-*/])/g);
  if (!tokens || tokens.join("") !== normalized.replaceAll(" ", "")) return null;
  let position = 0;
  const peek = () => tokens[position];
  const consume = () => tokens[position++];
  const parseFactor = (): number => {
    if (peek() === "-") {
      consume();
      return -parseFactor();
    }
    if (peek() === "(") {
      consume();
      const value = parseExpression();
      if (consume() !== ")") throw new Error("Parênteses inválidos");
      return value;
    }
    const value = Number(consume());
    if (!Number.isFinite(value)) throw new Error("Número inválido");
    return value;
  };
  const parseTerm = (): number => {
    let value = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const operator = consume();
      const right = parseFactor();
      if (operator === "/" && right === 0) throw new Error("Divisão por zero");
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  };
  const parseExpression = (): number => {
    let value = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const operator = consume();
      const right = parseTerm();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  };
  try {
    const result = parseExpression();
    return position === tokens.length && Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

function answerQuestion(question: string, context: Omit<FinanceAssistantProps, "onClose">): string {
  const normalized = question.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const currentTotal = context.entries.reduce((sum, entry) => sum + entry.value, 0);
  const expressionResult = calculateExpression(question);
  if (expressionResult !== null) return `O resultado é **${brl.format(expressionResult)}**.`;
  if (/porcent|percentual|%/.test(normalized)) {
    if (!context.salary) return "Ainda não há salário informado para calcular a porcentagem.";
    return `As despesas representam **${((context.expenses / context.salary) * 100).toFixed(1).replace(".", ",")}%** do salário de ${context.person}.`;
  }
  if (/saldo|sobra|restante|quanto sobra|sobrou/.test(normalized)) {
    return context.person === "Wesly"
      ? `No mês de **${context.month}**, o saldo de ${context.person} é **${brl.format(context.leftover)}**: salário de ${brl.format(context.salary)} menos ${brl.format(context.expenses)} em despesas.`
      : `Para ${context.person}, foram lançados **${brl.format(context.expenses)}** em despesas neste mês.`;
  }
  if (/cartao|fatura/.test(normalized)) return `Os gastos com cartão de ${context.person} em ${context.month} somam **${brl.format(context.card)}**.`;
  if (/salario|renda|receita/.test(normalized)) return `O salário registrado para ${context.month} é **${brl.format(context.salary)}**. Você pode alterá-lo tocando no valor do salário no painel.`;
  if (/quanto|total|gastei|despesa|gasto/.test(normalized)) return `No mês atual, ${context.person} tem **${context.entries.length} lançamento(s)**, totalizando **${brl.format(currentTotal)}**.`;
  if (/esqueci|senha|recuper/.test(normalized)) return "Na tela de acesso, toque em **Esqueci minha senha**, informe seu e-mail e abra o link recebido para criar uma nova senha.";
  if (/privad|outra conta|usuario|usuaria|separad|mistur/.test(normalized)) return "Cada conta usa uma linha própria no Supabase, protegida por RLS. A IA recebe somente os números da conta atualmente conectada.";
  if (/paleta|cor|tema/.test(normalized)) return "Abra o ícone de configurações no topo. Em **Paleta de cores**, você pode mudar fundo, cartões, texto e cor principal; a escolha fica salva na sua conta.";
  if (/gestao|anual|mes|historico|registro/.test(normalized)) return "Use **Novo mês** para arquivar o mês atual. Em Gestão anual, toque em **Editar** apenas no mês que precisa corrigir. O histórico mostra somente meses salvos.";
  if (/regra|como usar|funciona|ajuda/.test(normalized)) return "Posso explicar saldo, salário, despesas, cartão, porcentagens, somas e as regras do sistema. Também posso orientar sobre registro, histórico, paleta, gestão anual e segurança das contas.";
  return "Posso ajudar com cálculos (ex.: **1200 - 350 + 89,90**), saldo, salário, despesas, cartão, porcentagens e dúvidas sobre as regras do sistema. O que você quer descobrir?";
}

export default function FinanceAssistant({ person, month, salary, expenses, card, leftover, entries, onClose }: FinanceAssistantProps) {
  const context = useMemo(() => ({ person, month, salary, expenses, card, leftover, entries }), [person, month, salary, expenses, card, leftover, entries]);
  const [messages, setMessages] = useState<AssistantMessage[]>([{ id: 1, role: "assistant", text: `Olá! Sou o **Manus Finanças**. Posso tirar dúvidas e calcular os dados de **${person} · ${month}**. Esta conversa usa somente a sua conta.` }]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);
  const send = (event?: FormEvent, suggested?: string) => {
    event?.preventDefault();
    const question = (suggested ?? draft).trim();
    if (!question || busy) return;
    setDraft("");
    setBusy(true);
    const userMessage: AssistantMessage = { id: Date.now(), role: "user", text: question };
    setMessages((current) => [...current, userMessage]);
    window.setTimeout(() => {
      setMessages((current) => [...current, { id: Date.now() + 1, role: "assistant", text: answerQuestion(question, context) }]);
      setBusy(false);
    }, 180);
  };

  return <div className="assistant-backdrop" role="presentation" onClick={onClose}><section className="assistant-modal" role="dialog" aria-modal="true" aria-labelledby="assistant-title" onClick={(event) => event.stopPropagation()}>
    <header className="assistant-heading"><div className="assistant-title-wrap"><div className="assistant-icon"><Bot size={20} /></div><div><span className="modal-kicker">MANUS FINANÇAS</span><h2 id="assistant-title">Assistente financeiro</h2><p><CheckCircle2 size={12} /> Dados privados desta conta</p></div></div><button type="button" className="settings-close" onClick={onClose} aria-label="Fechar assistente"><X size={18} /></button></header>
    <div className="assistant-context"><Sparkles size={14} /><span>{person} · {month}</span><strong>{brl.format(leftover)} de saldo</strong></div>
    <div className="assistant-messages" ref={listRef}>{messages.map((message) => <div className={`assistant-message ${message.role}`} key={message.id}><span>{message.role === "assistant" ? <Bot size={14} /> : "Você"}</span><p>{message.text.split("**").map((part, index) => index % 2 === 1 ? <strong key={index}>{part}</strong> : part)}</p></div>)}{busy && <div className="assistant-typing"><Bot size={14} /> Calculando...</div>}</div>
    <div className="assistant-quick-actions"><button type="button" onClick={() => send(undefined, "Qual é meu saldo?")}><Calculator size={13} /> Meu saldo</button><button type="button" onClick={() => send(undefined, "Quanto gastei no cartão?")}>Cartão</button><button type="button" onClick={() => send(undefined, "Como funciona a segurança?")}>Regras e segurança</button></div>
    <form className="assistant-form" onSubmit={send}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ex.: quanto sobra este mês?" aria-label="Pergunte ao assistente" /><button type="submit" aria-label="Enviar pergunta" disabled={!draft.trim() || busy}><Send size={17} /></button></form>
  </section></div>;
}

export { calculateExpression };
