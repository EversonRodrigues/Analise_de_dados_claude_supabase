'use client';
/**
 * Receita por UF — barras horizontais ordenadas. Um unico pais na base: mapa nao
 * acrescenta nada e esconde que a maioria das UFs tem 1 ou 2 clientes.
 * Top 8 + "Outros" (topNComOutros). Uma serie: sem legenda.
 */
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { axisProps, gridProps, tooltipStyles, useSeriesColors } from '@/lib/design/chart-theme';
import { fmtBRL } from '@/lib/design/format';

type Barra = { nome: string; valor: number };

export function EstadosChart({
  barras, clientesPorUF,
}: {
  barras: Barra[];
  clientesPorUF: Record<string, number>;
}) {
  const cores = useSeriesColors();

  return (
    <ResponsiveContainer width="100%" height={Math.max(260, barras.length * 34)}>
      <BarChart data={barras} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
        <CartesianGrid {...gridProps} vertical horizontal={false} />
        <XAxis type="number" {...axisProps} tickFormatter={(v: number) => fmtBRL(v)} />
        <YAxis type="category" dataKey="nome" {...axisProps} width={64} />
        <Tooltip
          {...tooltipStyles}
          formatter={(v: number, _n, item) => {
            const nome = (item?.payload as Barra | undefined)?.nome ?? '';
            const n = clientesPorUF[nome];
            return [`${fmtBRL(v)}${n ? ` · ${n} cliente${n > 1 ? 's' : ''}` : ''}`, 'Receita em 30 dias'];
          }}
        />
        <Bar dataKey="valor" radius={[0, 4, 4, 0]} barSize={20}>
          {barras.map((b) => (
            <Cell key={b.nome} fill={cores[0]} fillOpacity={b.nome === 'Outros' ? 0.45 : 1} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
