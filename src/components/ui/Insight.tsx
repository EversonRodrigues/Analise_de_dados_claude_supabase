/**
 * Bloco narrativo. Toda seção conta uma historia: cada painel vem acompanhado
 * da leitura do numero, nao so do numero.
 */
export function Insight({ headline, children }: { headline: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border-l-2 bg-surface p-5" style={{ borderLeftColor: 'var(--baseline)' }}>
      <p className="text-sm font-semibold text-ink">{headline}</p>
      <div className="mt-2 text-sm leading-relaxed text-ink-secondary">{children}</div>
    </div>
  );
}
