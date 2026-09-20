'use client';
/**
 * Curva de concentracao (Pareto) da receita por produto.
 * UMA unica medida no eixo Y — a fracao acumulada da receita. Nao e o classico
 * "barras + linha acumulada": aquele usa duas escalas no mesmo grafico e o
 * contrato proibe eixo duplo. O ranking de produtos vive na DataTable ao lado.
 */
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot,
} from 'recharts';
import { useSeriesColors, axisProps, gridProps, tooltipStyles } from '@/lib/design/chart-theme';
import { MARKS } from '@/lib/design/tokens';
import { fmtPct, fmtNum } from '@/lib/design/format';

export type PontoCurva = { rank: number; participacaoAcumulada: number };

export function ParetoChart({
  dados, marcoRank, marcoValor,
}: {
  dados: PontoCurva[];
  marcoRank: number;
  marcoValor: number;
}) {
  const cores = useSeriesColors();
  const cor = cores[0];

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={dados} margin={{ top: 8, right: 24, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="grad-pareto" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={cor} stopOpacity={0.24} />
              <stop offset="100%" stopColor={cor} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid {...gridProps} />
          <XAxis
            dataKey="rank"
            {...axisProps}
            label={{ value: 'produtos ordenados por receita', position: 'insideBottom', offset: -2, fill: 'var(--text-muted)', fontSize: 11 }}
          />
          <YAxis
            {...axisProps}
            width={56}
            domain={[0, 1]}
            tickFormatter={(n: number) => `${Math.round(n * 100)}%`}
          />
          <ReferenceLine y={0.8} stroke="var(--baseline)" strokeDasharray="4 4"
            label={{ value: '80% da receita', position: 'insideBottomRight', fill: 'var(--text-muted)', fontSize: 11 }} />
          <ReferenceDot
            x={marcoRank}
            y={marcoValor}
            r={MARKS.minMarkerSize / 2}
            fill={cor}
            stroke="var(--surface-1)"
            strokeWidth={2}
            label={{ value: `top ${marcoRank} = ${fmtPct(marcoValor)}`, position: 'right', fill: 'var(--text-secondary)', fontSize: 11 }}
          />
          <Tooltip
            {...tooltipStyles}
            labelFormatter={(r) => `${fmtNum(Number(r))} produtos`}
            formatter={(v: number) => [fmtPct(v), 'da receita classificável']}
          />
          <Area
            type="monotone"
            dataKey="participacaoAcumulada"
            stroke={cor}
            strokeWidth={MARKS.lineStrokeWidth}
            fill="url(#grad-pareto)"
            dot={false}
            activeDot={{ r: MARKS.minMarkerSize / 2, strokeWidth: 2, stroke: 'var(--surface-1)' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
