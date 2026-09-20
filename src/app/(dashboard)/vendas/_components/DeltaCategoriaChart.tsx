'use client';
/**
 * EXPLICACAO (segundo corte) — de onde saiu, em reais, a receita que o canal
 * perdeu ou ganhou entre os dois periodos de 15 dias.
 * Escala DIVERGENTE em torno de zero: polo azul = ganho, polo vermelho = perda,
 * e o sinal aparece escrito no rotulo — a cor nunca carrega sozinha o sentido.
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { axisProps, gridProps, tooltipStyles } from '@/lib/design/chart-theme';
import { DIVERGING, MARKS } from '@/lib/design/tokens';
import { fmtBRL } from '@/lib/design/format';
import { Legend } from '@/components/ui/Legend';

export type BarraDelta = { nome: string; deltaAbsoluto: number };

export function DeltaCategoriaChart({ dados }: { dados: BarraDelta[] }) {
  const ordenado = [...dados].sort((a, b) => a.deltaAbsoluto - b.deltaAbsoluto);

  return (
    <div>
      <div className="h-[360px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={ordenado}
            layout="vertical"
            margin={{ top: 8, right: 24, bottom: 0, left: 8 }}
          >
            <CartesianGrid {...gridProps} vertical horizontal={false} />
            <XAxis
              type="number"
              {...axisProps}
              tickFormatter={(n: number) => `${n > 0 ? '+' : ''}${Math.round(n / 1000)}k`}
            />
            <YAxis type="category" dataKey="nome" {...axisProps} width={96} />
            <ReferenceLine x={0} stroke="var(--baseline)" />
            <Tooltip
              {...tooltipStyles}
              cursor={{ fill: 'var(--gridline)', fillOpacity: 0.4 }}
              formatter={(valor: number) => [
                `${valor >= 0 ? '+' : '−'}${fmtBRL(Math.abs(valor))}`,
                valor >= 0 ? 'ganho' : 'perda',
              ]}
            />
            <Bar dataKey="deltaAbsoluto" radius={MARKS.barRadius} maxBarSize={22}>
              {ordenado.map((d) => (
                <Cell
                  key={d.nome}
                  fill={d.deltaAbsoluto >= 0 ? DIVERGING.positivePole : DIVERGING.negativePole}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Legend
        items={[
          { label: 'ganhou receita (+)', color: DIVERGING.positivePole },
          { label: 'perdeu receita (−)', color: DIVERGING.negativePole },
        ]}
      />
    </div>
  );
}
