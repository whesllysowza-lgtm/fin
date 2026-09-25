import { ShieldAlert, Sparkles, TrendingUp, WalletCards } from "lucide-react";

type FinanceMascotProps = { leftover: number; expenses: number; activityKey: number };

export default function FinanceMascot({ leftover, expenses, activityKey }: FinanceMascotProps) {
  const mood = expenses === 0 ? "neutral" : leftover > 0 ? "happy" : "worried";
  const label = mood === "happy" ? "Saldo no azul" : mood === "worried" ? "Atenção às contas" : "Pronto para planejar";
  const detail = mood === "happy" ? "Seu dinheiro está respirando." : mood === "worried" ? "Vamos rever os gastos juntos." : "Adicione um lançamento para começar.";
  const Icon = mood === "happy" ? TrendingUp : mood === "worried" ? ShieldAlert : WalletCards;
  return <aside className={`finance-mascot finance-mascot-${mood}`} key={`${mood}-${activityKey}`} aria-label={`Mascote financeiro: ${label}`}>
    <div className="mascot-bubble"><span><Sparkles size={11} /> {label}</span><small>{detail}</small></div>
    <div className="mascot-body"><Icon className="mascot-face" size={28} strokeWidth={2.2} aria-hidden="true" /><span className="mascot-spark mascot-spark-one" /><span className="mascot-spark mascot-spark-two" /></div>
  </aside>;
}
