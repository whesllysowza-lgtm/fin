type FinanceMascotProps = { leftover: number; expenses: number; activityKey: number };

export default function FinanceMascot({ leftover, expenses, activityKey }: FinanceMascotProps) {
  const mood = expenses === 0 ? "neutral" : leftover > 0 ? "happy" : "worried";
  const label = mood === "happy" ? "Saldo positivo" : mood === "worried" ? "Atenção ao saldo" : "Aguardando lançamentos";
  const face = mood === "happy" ? "😊" : mood === "worried" ? "😟" : "🙂";
  return <aside className={`finance-mascot finance-mascot-${mood}`} key={`${mood}-${activityKey}`} aria-label={`Mascote: ${label}`}>
    <div className="mascot-bubble">{label}</div>
    <div className="mascot-body"><span className="mascot-face" aria-hidden="true">{face}</span><span className="mascot-spark mascot-spark-one" /><span className="mascot-spark mascot-spark-two" /></div>
  </aside>;
}
