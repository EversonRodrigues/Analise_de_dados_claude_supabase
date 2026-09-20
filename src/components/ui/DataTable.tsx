/** Visao em tabela — canal de acessibilidade obrigatorio ao lado de cada grafico denso. */
export function DataTable({ columns, rows, caption }: {
  columns: string[]; rows: (string | number)[][]; caption?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        {caption && <caption className="mb-3 text-left text-xs text-ink-muted">{caption}</caption>}
        <thead>
          <tr className="border-b border-hairline">
            {columns.map((c, i) => (
              <th key={c} className={`pb-2 text-xs font-medium uppercase tracking-wide text-ink-muted ${i === 0 ? 'text-left' : 'text-right'}`}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-hairline last:border-0">
              {r.map((cell, ci) => (
                <td key={ci} className={`py-2.5 ${ci === 0 ? 'text-left text-ink' : 'text-right tabular-nums text-ink-secondary'}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
