type FinanceMascotProps = { leftover: number; activityKey: number; visible?: boolean };

export default function FinanceMascot({ leftover, activityKey, visible = true }: FinanceMascotProps) {
  if (!visible) return null;
  const positive = leftover > 0;
  const label = positive ? "Sobrou dinheiro!" : "Não sobrou dinheiro";
  return <aside className={`site-piggy-walker ${positive ? "is-positive" : "is-crying"}`} key={`${positive ? "positive" : "crying"}-${activityKey}`} aria-label={`Mascote financeiro: ${label}`}>
    <img src={positive ? "/mascot/piggy-walker-thumb.png" : "/mascot/piggy-walker.png"} alt={positive ? "Porquinho financeiro fazendo joinha" : "Porquinho financeiro chorando"} />
    {!positive && <span className="piggy-status" aria-hidden="true">😢</span>}
  </aside>;
}
