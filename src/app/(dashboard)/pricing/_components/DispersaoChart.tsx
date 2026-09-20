'use client';
/**
 * Dispersao desconto medio x unidades vendidas, um ponto por produto.
 * Scatter e forma de par-completo: TETO DE 3 SERIES (ALL_PAIRS_SERIES_CAP).
 * As series ja chegam dobradas em "Outras categorias" pela funcao de KPI.
 * Cor por IDENTIDADE da serie (indice da entrada), nunca por ranking do filtro.
 */
import {
  CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts';
import { useSeriesColors, axisProps, gridProps, tooltipStyles } from '@/lib/design/chart-theme';
import { MARKS } from '@/lib/design/tokens';
import { fmtNum, fmtPct } from '@/lib/design/format';
import { Legend } from '@/components/ui/Legend';

export type PontoProduto = { nome: string; desconto: number; unidades: number };
export type SerieProdutos = { nome: string; pontos: PontoProduto[] };

export function DispersaoChart({ series }: { series: SerieProdutos[] }) {
  const cores = useSeriesColors();
  return (
    <>
      <ResponsiveContainer width="100%" height={340}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
          <CartesianGrid {...gridProps} vertical />
          <XAxis
            type="number" dataKey="desconto" name="Desconto médio" {...axisProps}
            tickFormatter={(v: number) => fmtPct(v)}
            label={{
              value: 'Desconto médio do produto', position: 'insideBottom', offset: -16,
              style: { fill: 'var(--text-muted)', fontSize: 11 },
            }}
          />
          <YAxis
            type="number" dataKey="unidades" name="Unidades" {...axisProps} width={56}
            tickFormatter={(v: number) => fmtNum(v)}
            label={{
              value: 'Unidades', angle: -90, position: 'insideLeft',
              style: { fill: 'var(--text-muted)', fontSize: 11 },
            }}
          />
          <ZAxis range={[MARKS.minMarkerSize * 6, MARKS.minMarkerSize * 6]} />
          <Tooltip
            {...tooltipStyles}
            cursor={{ strokeDasharray: '3 3', stroke: 'var(--baseline)' }}
            formatter={(v: number, n) =>
              n === 'Desconto médio' ? [fmtPct(v), String(n)] : [fmtNum(v), String(n)]
            }
            labelFormatter={() => ''}
          />
          {series.map((s, i) => (
            <Scatter
              key={s.nome}
              name={s.nome}
              data={s.pontos}
              fill={cores[i]}
              stroke="var(--surface-1)"
              strokeWidth={MARKS.surfaceGap}
              isAnimationActive={false}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
      <Legend items={series.map((s, i) => ({ label: s.nome, color: cores[i] }))} />
    </>
  );
}
