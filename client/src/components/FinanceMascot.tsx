import { Droplets, PiggyBank, Sparkles, ThumbsUp } from "lucide-react";

type FinanceMascotProps = { leftover: number; activityKey: number; visible?: boolean };

export default function FinanceMascot({ leftover, activityKey, visible = true }: FinanceMascotProps) {
  if (!visible) return null;
  const positive = leftover > 0;
  const label = positive ? "Sobrou dinheiro!" : "Atenção ao saldo";
  const detail = positive ? "Mandou bem neste mês." : "Não sobrou dinheiro neste mês.";
  return <aside className={`finance-mascot finance-pig-mascot ${positive ? "finance-mascot-positive" : "finance-mascot-crying"}`} key={`${positive ? "positive" : "crying"}-${activityKey}`} aria-label={`Mascote financeiro: ${label}`}>
    <div className="mascot-bubble"><span><Sparkles size={11} /> {label}</span><small>{detail}</small></div>
    <div className="mascot-body">
      <PiggyBank className="mascot-face" size={30} strokeWidth={2.2} aria-hidden="true" />
      {positive ? <ThumbsUp className="mascot-status-icon" size={17} strokeWidth={2.6} aria-label="Joinha" /> : <Droplets className="mascot-status-icon mascot-tears" size={17} strokeWidth={2.6} aria-label="Chorando" />}
      <span className="mascot-spark mascot-spark-one" /><span className="mascot-spark mascot-spark-two" />
    </div>
  </aside>;
}
