'use client';
/**
 * TENSAO — receita diaria por canal.
 * Duas series na mesma unidade (R$) e portanto no MESMO eixo. Recebe a serie ja
 * agregada por props: o Dataset inteiro nunca cruza para o cliente.
 */
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useSeriesColors, axisProps, gridProps, tooltipStyles } from '@/lib/design/chart-theme';
import { MARKS } from '@/lib/design/tokens';
import { fmtBRL, fmtDate } from '@/lib/design/format';
import { Legend } from '@/components/ui/Legend';

export type SerieDia = { dia: string; ecommerce: number; loja_fisica: number };

/**
 * 'yyyy-mm-dd' -> Date no fuso LOCAL. Sem o sufixo de hora o parse e meia-noite
 * UTC, que em UTC-3 recua um dia: o eixo rotularia 12/dez o ponto de 13/dez.
 */
const diaLocal = (iso: string) => new Date(`${iso}T00:00:00`);

export function ReceitaDiariaChart({ dados, corte }: { dados: SerieDia[]; corte: string }) {
  const cores = useSeriesColors();
  // Indice FIXO por entidade: e-commerce sempre slot 0, loja fisica sempre slot 1.
  const series = [
    { chave: 'ecommerce' as const, label: 'E-commerce', cor: cores[0] },
    { chave: 'loja_fisica' as const, label: 'Loja física', cor: cores[1] },
  ];

  return (
    <div>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dados} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="dia" {...axisProps} tickFormatter={(d: string) => fmtDate(diaLocal(d))} minTickGap={28} />
            <YAxis
              {...axisProps}
              width={64}
              tickFormatter={(n: number) => `R$ ${Math.round(n / 1000)}k`}
            />
            <ReferenceLine
              x={corte}
              stroke="var(--baseline)"
              strokeDasharray="4 4"
              label={{ value: 'corte 15d', position: 'insideTopRight', fill: 'var(--text-muted)', fontSize: 11 }}
            />
            <Tooltip
              {...tooltipStyles}
              labelFormatter={(d) => fmtDate(diaLocal(String(d)))}
              formatter={(valor: number, nome: string) => [fmtBRL(valor), nome]}
            />
            {series.map((s) => (
              <Line
                key={s.chave}
                type="monotone"
                dataKey={s.chave}
                name={s.label}
                stroke={s.cor}
                strokeWidth={MARKS.lineStrokeWidth}
                dot={false}
                activeDot={{ r: MARKS.minMarkerSize / 2, strokeWidth: 2, stroke: 'var(--surface-1)' }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Legend items={series.map((s) => ({ label: s.label, color: s.cor }))} />
    </div>
  );
}
