'use client';
/**
 * Receita por categoria — magnitude de uma unica medida, logo UM unico matiz
 * (sequencial azul, claro -> escuro na ordem do ranking). Nao e codificacao
 * categorica: nao ha identidade concorrente para preservar, so tamanho.
 * O corte por categoria EXCLUI as vendas orfas — o Card traz a nota de rodape.
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { axisProps, gridProps, tooltipStyles } from '@/lib/design/chart-theme';
import { MARKS, SEQUENTIAL_BLUE, ORDINAL_MIN_INDEX_LIGHT } from '@/lib/design/tokens';
import { fmtBRL, fmtPct } from '@/lib/design/format';

export type BarraCategoria = { nome: string; receita: number; participacao: number };

export function CategoriaChart({ dados }: { dados: BarraCategoria[] }) {
  const ordenado = [...dados].sort((a, b) => b.receita - a.receita);
  // Degraus ordinais: o passo mais claro nunca abaixo de ORDINAL_MIN_INDEX_LIGHT.
  const passo = (i: number) => {
    const span = SEQUENTIAL_BLUE.length - 1 - ORDINAL_MIN_INDEX_LIGHT;
    const alvo = SEQUENTIAL_BLUE.length - 1 - Math.round((i / Math.max(1, ordenado.length - 1)) * span);
    return SEQUENTIAL_BLUE[Math.max(ORDINAL_MIN_INDEX_LIGHT, alvo)];
  };

  return (
    <div className="h-[380px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={ordenado} layout="vertical" margin={{ top: 8, right: 24, bottom: 0, left: 8 }}>
          <CartesianGrid {...gridProps} vertical horizontal={false} />
          <XAxis type="number" {...axisProps} tickFormatter={(n: number) => `R$ ${Math.round(n / 1000)}k`} />
          <YAxis type="category" dataKey="nome" {...axisProps} width={96} />
          <Tooltip
            {...tooltipStyles}
            cursor={{ fill: 'var(--gridline)', fillOpacity: 0.4 }}
            formatter={(valor: number, _n: string, entrada: { payload?: BarraCategoria }) => [
              `${fmtBRL(valor)} · ${fmtPct(entrada.payload?.participacao ?? 0)} do classificável`,
              'receita',
            ]}
          />
          <Bar dataKey="receita" radius={MARKS.barRadius} maxBarSize={24}>
            {ordenado.map((d, i) => (
              <Cell key={d.nome} fill={passo(i)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
