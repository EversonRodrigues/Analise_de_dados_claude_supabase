'use client';
/**
 * Gasto medio por safra de cadastro. Uma unica serie: o titulo a nomeia, sem legenda.
 * O `n` de cada safra vai no rotulo do eixo — com 50 clientes no total, nenhum
 * grupo aqui sustenta leitura de tendencia, e o painel tem de dizer isso.
 */
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { axisProps, gridProps, tooltipStyles, useSeriesColors } from '@/lib/design/chart-theme';
import { MARKS } from '@/lib/design/tokens';
import { fmtBRL } from '@/lib/design/format';

type Safra = { rotulo: string; n: number; gastoMedio: number; amostraSuficiente: boolean };

export function SafraChart({ safras }: { safras: Safra[] }) {
  const cores = useSeriesColors();
  const dados = safras.map((s) => ({ ...s, eixo: `${s.rotulo} (n=${s.n})` }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={dados} margin={{ top: 24, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="eixo" {...axisProps} />
          <YAxis {...axisProps} width={80} tickFormatter={(v: number) => fmtBRL(v)} />
          <Tooltip
            {...tooltipStyles}
            formatter={(v: number, _n, item) => {
              const p = item?.payload as (typeof dados)[number] | undefined;
              return [
                `${fmtBRL(v)} por cliente${p && !p.amostraSuficiente ? ' — amostra pequena' : ''}`,
                'Gasto medio em 30 dias',
              ];
            }}
          />
          <Bar dataKey="gastoMedio" radius={MARKS.barRadius}>
            {dados.map((d) => (
              // Amostra insuficiente (n < 10) recebe a mesma cor com opacidade reduzida:
              // o rotulo "n=" e o aviso do cartao carregam o significado, nunca a cor sozinha.
              <Cell key={d.rotulo} fill={cores[0]} fillOpacity={d.amostraSuficiente ? 1 : 0.45} />
            ))}
            <LabelList
              dataKey="gastoMedio" position="top" offset={8}
              formatter={(v: number) => fmtBRL(v)}
              style={{ fill: 'var(--text-secondary)', fontSize: 11 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
