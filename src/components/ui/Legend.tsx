'use client';
/** Legenda obrigatoria para >= 2 series. Marca colorida + texto em tinta de texto. */
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  if (items.length < 2) return null;
  return (
    <ul className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-2 text-xs text-ink-secondary">
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: it.color }} />
          {it.label}
        </li>
      ))}
    </ul>
  );
}
