import { fmtDelta } from '@/lib/design/format';

/**
 * Stat tile. O delta carrega significado por SINAL + ROTULO, nunca por cor sozinha.
 * `goodDirection` diz qual sentido e positivo para o negocio (margem: 'up'; desconto: 'down').
 */
export function KpiTile({
  label, value, delta, deltaLabel, goodDirection = 'up', hint,
}: {
  label: string;
  value: string;
  delta?: number;
  deltaLabel?: string;
  goodDirection?: 'up' | 'down' | 'neutral';
  hint?: string;
}) {
  const isGood =
    delta === undefined || goodDirection === 'neutral'
      ? null
      : goodDirection === 'up' ? delta >= 0 : delta <= 0;

  return (
    <div className="rounded-card border border-hairline bg-surface p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-2 text-[1.75rem] font-semibold leading-none tracking-tight text-ink">{value}</p>
      {delta !== undefined && (
        <p className="mt-2 flex items-center gap-1.5 text-xs">
          <span aria-hidden className="font-semibold" style={{ color: isGood === null ? 'var(--text-secondary)' : isGood ? 'var(--success-text)' : '#d03b3b' }}>
            {delta >= 0 ? '▲' : '▼'}
          </span>
          <span className="font-medium tabular-nums text-ink-secondary">{fmtDelta(delta)}</span>
          {deltaLabel && <span className="text-ink-muted">{deltaLabel}</span>}
        </p>
      )}
      {hint && <p className="mt-2 text-xs leading-snug text-ink-muted">{hint}</p>}
    </div>
  );
}
