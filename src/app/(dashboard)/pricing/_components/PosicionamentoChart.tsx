'use client';
/**
 * Posicionamento competitivo por categoria — barras empilhadas com a paleta
 * DIVERGENTE (azul <-> vermelho com CINZA no meio), porque a medida tem
 * polaridade: abaixo do mercado <- paridade -> acima do mercado.
 * Nao e categorico: usar slots de serie aqui perderia a leitura do polo.
 */
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { axisProps, gridProps, tooltipStyles, useIsDark } from '@/lib/design/chart-theme';
import { DIVERGING, MARKS } from '@/lib/design/tokens';
import { Legend } from '@/components/ui/Legend';

export type LinhaPosicionamento = {
  categoria: string;
  abaixo: number;
  faixa: number;
  acima: number;
};

export function PosicionamentoChart({ dados }: { dados: LinhaPosicionamento[] }) {
  const escuro = useIsDark();
  const neutro = escuro ? DIVERGING.midDark : DIVERGING.midLight;
  const itens = [
    { label: 'Abaixo do mercado (< -5%)', color: DIVERGING.positivePole },
    { label: 'Na faixa de paridade (+-5%)', color: neutro },
    { label: 'Acima do mercado (> +5%)', color: DIVERGING.negativePole },
  ];

  return (
    <>
      <ResponsiveContainer width="100%" height={360}>
        <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid {...gridProps} vertical horizontal={false} />
          <XAxis type="number" {...axisProps} allowDecimals={false} />
          <YAxis type="category" dataKey="categoria" {...axisProps} width={104} />
          <Tooltip
            {...tooltipStyles}
            cursor={{ fill: 'var(--gridline)', fillOpacity: 0.4 }}
            formatter={(v: number, n) => [`${v} produtos`, String(n)]}
          />
          <Bar
            dataKey="abaixo" stackId="p" name="Abaixo do mercado"
            fill={DIVERGING.positivePole} barSize={18} isAnimationActive={false}
            stroke="var(--surface-1)" strokeWidth={MARKS.surfaceGap}
          />
          <Bar
            dataKey="faixa" stackId="p" name="Na faixa de paridade"
            fill={neutro} barSize={18} isAnimationActive={false}
            stroke="var(--surface-1)" strokeWidth={MARKS.surfaceGap}
          />
          <Bar
            dataKey="acima" stackId="p" name="Acima do mercado"
            fill={DIVERGING.negativePole} barSize={18} isAnimationActive={false}
            stroke="var(--surface-1)" strokeWidth={MARKS.surfaceGap}
            radius={[0, MARKS.barRadius[0], MARKS.barRadius[0], 0]}
          />
        </BarChart>
      </ResponsiveContainer>
      <Legend items={itens} />
    </>
  );
}
