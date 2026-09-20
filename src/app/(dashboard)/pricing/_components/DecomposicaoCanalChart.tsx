'use client';
/**
 * Decomposicao da variacao do preco medio de cada canal (15d vs 15d) em duas
 * parcelas que somam o delta observado: mix de produto e politica de desconto.
 *
 * Duas series categoricas (slots 0 e 1, cor por identidade da parcela — nao por
 * ranking). O sinal e o rotulo direto carregam a direcao; a linha de referencia
 * em zero da a base de leitura. Uma so medida (R$ por unidade), um so eixo.
 */
import {
  Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useSeriesColors, axisProps, gridProps, tooltipStyles } from '@/lib/design/chart-theme';
import { MARKS } from '@/lib/design/tokens';
import { fmtBRLCents } from '@/lib/design/format';
import { Legend } from '@/components/ui/Legend';

export type LinhaDecomposicao = {
  canal: string;
  efeitoMix: number;
  efeitoDesconto: number;
};

const ROTULOS = {
  efeitoMix: 'Mix de produto',
  efeitoDesconto: 'Política de desconto',
} as const;

export function DecomposicaoCanalChart({ dados }: { dados: LinhaDecomposicao[] }) {
  const cores = useSeriesColors();
  const itens = [
    { label: ROTULOS.efeitoMix, color: cores[0] },
    { label: ROTULOS.efeitoDesconto, color: cores[1] },
  ];

  return (
    <>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={dados} margin={{ top: 24, right: 8, bottom: 4, left: 8 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="canal" {...axisProps} tickMargin={8} />
          <YAxis {...axisProps} width={80} tickFormatter={(v: number) => fmtBRLCents(v)} />
          <ReferenceLine y={0} stroke="var(--baseline)" />
          <Tooltip
            {...tooltipStyles}
            cursor={{ fill: 'var(--gridline)', fillOpacity: 0.4 }}
            formatter={(v: number, n) => [fmtBRLCents(v), String(n)]}
          />
          <Bar
            dataKey="efeitoMix" name={ROTULOS.efeitoMix} fill={cores[0]}
            radius={MARKS.barRadius} barSize={56} isAnimationActive={false}
          >
            <LabelList
              dataKey="efeitoMix" position="top"
              formatter={(v: number) => fmtBRLCents(v)}
              style={{ fill: 'var(--text-secondary)', fontSize: 11 }}
            />
          </Bar>
          <Bar
            dataKey="efeitoDesconto" name={ROTULOS.efeitoDesconto} fill={cores[1]}
            radius={MARKS.barRadius} barSize={56} isAnimationActive={false}
          >
            <LabelList
              dataKey="efeitoDesconto" position="top"
              formatter={(v: number) => fmtBRLCents(v)}
              style={{ fill: 'var(--text-secondary)', fontSize: 11 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <Legend items={itens} />
    </>
  );
}
