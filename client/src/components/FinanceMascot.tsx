type FinanceMascotProps = { leftover: number; activityKey: number; visible?: boolean };

const confettiPieces = Array.from({ length: 18 }, (_, index) => ({
  id: index,
  color: ["#facc15", "#fb7185", "#38bdf8", "#a78bfa", "#34d399"][index % 5],
  left: `${12 + (index * 17) % 76}%`,
  delay: `${(index % 6) * 0.08}s`,
  duration: `${1.8 + (index % 4) * 0.22}s`,
  rotation: `${(index * 31) % 180 - 90}deg`,
}));

export default function FinanceMascot({ leftover, activityKey, visible = true }: FinanceMascotProps) {
  if (!visible) return null;
  const positive = leftover > 0;
  const label = positive ? "Sobrou dinheiro!" : "Não sobrou dinheiro";
  return <aside className={`site-piggy-walker ${positive ? "is-positive" : "is-crying"}`} key={`${positive ? "positive" : "crying"}-${activityKey}`} aria-label={`Mascote financeiro: ${label}`}>
    {positive && <span className="piggy-confetti" aria-hidden="true">{confettiPieces.map((piece) => <i key={piece.id} style={{ "--confetti-color": piece.color, "--confetti-left": piece.left, "--confetti-delay": piece.delay, "--confetti-duration": piece.duration, "--confetti-rotation": piece.rotation } as React.CSSProperties} />)}</span>}
    <img src={positive ? "/mascot/piggy-walker-thumb.png" : "/mascot/piggy-walker-crying.png"} alt={positive ? "Porquinho financeiro fazendo joinha" : "Porquinho financeiro chorando"} />
  </aside>;
}
