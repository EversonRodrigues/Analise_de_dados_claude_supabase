'use client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useSeriesColors, axisProps, gridProps, tooltipStyles } from '@/lib/design/chart-theme';
import { fmtBRL, fmtDate } from '@/lib/design/format';
import { Legend } from '@/components/ui/Legend';
import { MARKS } from '@/lib/design/tokens';

type Ponto = { dia: string; ecommerce: number; loja_fisica: number };

/**
 * Receita diaria empilhada por canal. Barras empilhadas (nao area) porque o
 * dado e diario e discreto, e o vao de 2px entre segmentos so funciona em barra.
 * Cor por IDENTIDADE do canal: ecommerce sempre slot 1, loja sempre slot 2.
 */
export function ReceitaDiariaCanal({ dados }: { dados: Ponto[] }) {
  const c = useSeriesColors();
  const series = [
    { key: 'ecommerce', label: 'Ecommerce', color: c[0] },
    { key: 'loja_fisica', label: 'Loja física', color: c[1] },
  ];

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="dia" tickFormatter={fmtDate} interval={4} {...axisProps} />
          <YAxis tickFormatter={(v) => fmtBRL(v as number)} width={78} {...axisProps} />
          <Tooltip
            {...tooltipStyles}
            labelFormatter={(l) => fmtDate(l as string)}
            formatter={(v, n) => [fmtBRL(v as number), n === 'ecommerce' ? 'Ecommerce' : 'Loja física']}
          />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="receita"
              fill={s.color}
              stroke="var(--surface-1)"
              strokeWidth={MARKS.surfaceGap}
              radius={i === series.length - 1 ? MARKS.barRadius : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
    </div>
  );
}
