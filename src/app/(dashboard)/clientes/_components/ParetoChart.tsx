'use client';
/**
 * Curva de concentracao de receita (Pareto/Lorenz): % de clientes no X,
 * % de receita acumulada no Y. A diagonal e a base perfeitamente uniforme.
 * Duas series => legenda obrigatoria. Mesma escala (%), um unico eixo.
 */
import {
  CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { axisProps, gridProps, tooltipStyles, useSeriesColors } from '@/lib/design/chart-theme';
import { MARKS } from '@/lib/design/tokens';
import { Legend } from '@/components/ui/Legend';

type Ponto = { pctClientes: number; pctReceitaAcum: number; igualdade: number };

export function ParetoChart({ curva, top20pct }: { curva: Ponto[]; top20pct: number }) {
  const cores = useSeriesColors();
  const corReal = cores[0];
  const corIgual = cores[4];

  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={curva} margin={{ top: 8, right: 16, left: 8, bottom: 16 }}>
          <CartesianGrid {...gridProps} />
          <XAxis
            dataKey="pctClientes" type="number" domain={[0, 100]} {...axisProps}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            label={{ value: '% dos clientes, do maior para o menor', position: 'insideBottom',
              offset: -10, fill: 'var(--text-muted)', fontSize: 11 }}
          />
          <YAxis
            domain={[0, 100]} {...axisProps} width={56}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
          />
          <ReferenceLine
            x={20} stroke="var(--baseline)" strokeDasharray="4 4"
            label={{ value: `20% dos clientes = ${top20pct.toFixed(0)}% da receita`,
              position: 'insideTopRight', fill: 'var(--text-muted)', fontSize: 11 }}
          />
          <Tooltip
            {...tooltipStyles}
            labelFormatter={(v: number) => `${Number(v).toFixed(0)}% dos clientes`}
            formatter={(v: number, n: string) => [
              `${Number(v).toFixed(1)}% da receita`,
              n === 'pctReceitaAcum' ? 'Base real' : 'Base perfeitamente uniforme',
            ]}
          />
          <Line
            type="monotone" dataKey="igualdade" name="igualdade" stroke={corIgual}
            strokeWidth={MARKS.lineStrokeWidth} strokeDasharray="5 5" dot={false} />
          <Line
            type="monotone" dataKey="pctReceitaAcum" name="pctReceitaAcum" stroke={corReal}
            strokeWidth={MARKS.lineStrokeWidth} dot={false} />
        </LineChart>
      </ResponsiveContainer>
      <Legend
        items={[
          { label: 'Receita acumulada real', color: corReal },
          { label: 'Base perfeitamente uniforme', color: corIgual },
        ]}
      />
    </div>
  );
}
