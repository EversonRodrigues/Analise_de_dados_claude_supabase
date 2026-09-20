import type { ReactNode } from 'react';

/** Cartao base. Dono: Lider (compartilhado). Nao duplicar em seções. */
export function Card({
  title, subtitle, children, footnote, className = '',
}: {
  title?: string; subtitle?: string; children: ReactNode; footnote?: string; className?: string;
}) {
  return (
    <section className={`rounded-card border border-hairline bg-surface p-6 ${className}`}>
      {title && (
        <header className="mb-1">
          <h3 className="text-sm font-medium text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
        </header>
      )}
      <div className={title ? 'mt-4' : ''}>{children}</div>
      {footnote && <p className="mt-4 border-t border-hairline pt-3 text-xs text-ink-muted">{footnote}</p>}
    </section>
  );
}
