/** Compact stat for dense dashboard cards: big number, tiny label, muted hint. */
export function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-text-secondary uppercase tracking-wide mt-0.5">{label}</div>
      {hint && <div className="text-[10px] text-text-tertiary mt-0.5 truncate">{hint}</div>}
    </div>
  );
}
