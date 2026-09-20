'use client';
/**
 * Frequencia (nº de compras em 30 dias) x ticket medio, um ponto por cliente.
 * Scatter => teto de 3 series (ALL_PAIRS_SERIES_CAP). As 3 sao os tercis de receita.
 */
import {
  CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts';
import { axisProps, gridProps, tooltipStyles, useSeriesColors } from '@/lib/design/chart-theme';
import { ALL_PAIRS_SERIES_CAP, MARKS } from '@/lib/design/tokens';
import { Legend } from '@/components/ui/Legend';
import { fmtBRL, fmtBRLCents } from '@/lib/design/format';

type Ponto = {
  id_cliente: string; nome: string; compras: number; ticketMedio: number;
  receita: number; grupo: string;
};

export function DispersaoChart({ pontos, grupos }: { pontos: Ponto[]; grupos: string[] }) {
  const cores = useSeriesColors();
  const series = grupos.slice(0, ALL_PAIRS_SERIES_CAP);

  return (
    <div>
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 8, right: 16, left: 8, bottom: 16 }}>
          <CartesianGrid {...gridProps} vertical />
          <XAxis
            type="number" dataKey="compras" name="Compras" {...axisProps}
            domain={['dataMin - 4', 'dataMax + 4']}
            label={{ value: 'Compras em 30 dias', position: 'insideBottom', offset: -10,
              fill: 'var(--text-muted)', fontSize: 11 }}
          />
          <YAxis
            type="number" dataKey="ticketMedio" name="Ticket medio" {...axisProps} width={72}
            domain={['dataMin - 30', 'dataMax + 30']}
            tickFormatter={(v: number) => fmtBRL(v)}
          />
          <ZAxis range={[MARKS.minMarkerSize * 8, MARKS.minMarkerSize * 8]} />
          <Tooltip
            {...tooltipStyles}
            cursor={{ strokeDasharray: '3 3', stroke: 'var(--baseline)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as Ponto;
              return (
                <div style={tooltipStyles.contentStyle} className="px-3 py-2">
                  <p className="font-medium">{p.nome}</p>
                  <p className="text-ink-secondary">{p.compras} compras em 30 dias</p>
                  <p className="text-ink-secondary">Ticket medio {fmtBRLCents(p.ticketMedio)}</p>
                  <p className="text-ink-secondary">Receita {fmtBRL(p.receita)}</p>
                </div>
              );
            }}
          />
          {series.map((g, i) => (
            <Scatter
              key={g} name={g} data={pontos.filter((p) => p.grupo === g)} fill={cores[i]}
              stroke="var(--surface-1)" strokeWidth={MARKS.surfaceGap}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
      <Legend items={series.map((g, i) => ({ label: g, color: cores[i] }))} />
    </div>
  );
}
