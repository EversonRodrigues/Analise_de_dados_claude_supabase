'use client';
/**
 * EXPLICACAO — ticket medio por canal, antes vs. depois do corte de 15 dias.
 * Uma unica medida (R$ por pedido) num unico eixo; as duas series sao os dois
 * periodos. Barras agrupadas com vao de 2px na cor da superficie.
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts';
import { useSeriesColors, axisProps, gridProps, tooltipStyles } from '@/lib/design/chart-theme';
import { MARKS } from '@/lib/design/tokens';
import { fmtBRLCents } from '@/lib/design/format';
import { Legend } from '@/components/ui/Legend';

export type BarraTicket = { rotulo: string; anterior: number; recente: number };

export function TicketCanalChart({ dados }: { dados: BarraTicket[] }) {
  const cores = useSeriesColors();
  const series = [
    { chave: 'anterior' as const, label: '15 dias anteriores', cor: cores[2] },
    { chave: 'recente' as const, label: 'últimos 15 dias', cor: cores[3] },
  ];

  return (
    <div>
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} margin={{ top: 24, right: 16, bottom: 0, left: 8 }} barGap={MARKS.surfaceGap}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="rotulo" {...axisProps} />
            <YAxis {...axisProps} width={64} tickFormatter={(n: number) => `R$ ${Math.round(n)}`} />
            <Tooltip
              {...tooltipStyles}
              cursor={{ fill: 'var(--gridline)', fillOpacity: 0.4 }}
              formatter={(valor: number, nome: string) => [fmtBRLCents(valor), nome]}
            />
            {series.map((s) => (
              <Bar key={s.chave} dataKey={s.chave} name={s.label} fill={s.cor} radius={MARKS.barRadius} maxBarSize={72}>
                {/* Rotulo direto: sao apenas 2 series, entao o numero fica na barra. */}
                <LabelList
                  dataKey={s.chave}
                  position="top"
                  offset={8}
                  fill="var(--text-secondary)"
                  fontSize={11}
                  formatter={(v: number) => fmtBRLCents(v)}
                />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Legend items={series.map((s) => ({ label: s.label, color: s.cor }))} />
    </div>
  );
}
