'use client';
/**
 * A pergunta central da erosao: "o desconto compra volume?".
 * Duas medidas de escalas diferentes (R$ perdidos e unidades por pedido) =>
 * DOIS graficos lado a lado, nunca eixo duplo. O eixo X e identico nos dois,
 * entao a comparacao e visual e direta.
 */
import {
  Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useSeriesColors, axisProps, gridProps, tooltipStyles } from '@/lib/design/chart-theme';
import { MARKS } from '@/lib/design/tokens';
import { fmtBRL, fmtNum } from '@/lib/design/format';

export type PontoFaixa = {
  faixa: string;
  erosao: number;
  unidadesPorPedido: number;
  linhas: number;
};

function Painel({
  dados, chave, titulo, formatar, cor, referencia,
}: {
  dados: PontoFaixa[];
  chave: 'erosao' | 'unidadesPorPedido';
  titulo: string;
  formatar: (n: number) => string;
  cor: string;
  referencia?: number;
}) {
  return (
    <figure className="m-0">
      <figcaption className="mb-3 text-xs font-medium text-ink-secondary">{titulo}</figcaption>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={dados} margin={{ top: 20, right: 8, bottom: 4, left: 8 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="faixa" {...axisProps} interval={0} tickMargin={8} />
          <YAxis {...axisProps} tickFormatter={formatar} width={64} />
          {referencia !== undefined && (
            <ReferenceLine
              y={referencia}
              stroke="var(--baseline)"
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
            />
          )}
          <Tooltip
            {...tooltipStyles}
            cursor={{ fill: 'var(--gridline)', fillOpacity: 0.4 }}
            formatter={(v: number, _n, p) => [
              formatar(v),
              `${fmtNum((p?.payload as PontoFaixa)?.linhas ?? 0)} linhas de venda`,
            ]}
          />
          <Bar dataKey={chave} fill={cor} radius={MARKS.barRadius} isAnimationActive={false}>
            <LabelList
              dataKey={chave}
              position="top"
              formatter={(v: number) => formatar(v)}
              style={{ fill: 'var(--text-secondary)', fontSize: 11 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}

export function FaixaDescontoCharts({ dados }: { dados: PontoFaixa[] }) {
  const cores = useSeriesColors();
  const base = dados.find((d) => d.faixa === 'Sem desconto')?.unidadesPorPedido;
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Painel
        dados={dados}
        chave="erosao"
        titulo="Receita perdida vs. preço de tabela (R$, 30 dias)"
        formatar={fmtBRL}
        cor={cores[0]}
      />
      <Painel
        dados={dados}
        chave="unidadesPorPedido"
        titulo="Unidades por linha de venda (linha tracejada = patamar sem desconto)"
        formatar={(n) => n.toFixed(2)}
        cor={cores[1]}
        referencia={base}
      />
    </div>
  );
}
