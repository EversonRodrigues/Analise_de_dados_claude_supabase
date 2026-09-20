'use client';
/**
 * Variacao do share de ecommerce por cliente: 15d recentes menos 15d anteriores.
 * Medida com POLARIDADE (foi para a loja / foi para o online) => escala divergente
 * azul<->vermelho com o zero no meio. Uma unica serie: o titulo a nomeia, sem legenda.
 */
import {
  Bar, BarChart, Cell, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { axisProps, gridProps, tooltipStyles, useIsDark } from '@/lib/design/chart-theme';
import { DIVERGING, MARKS } from '@/lib/design/tokens';

type Ponto = { id_cliente: string; nome: string; deltaPP: number };

export function MigracaoChart({ clientes }: { clientes: Ponto[] }) {
  const dark = useIsDark();
  const paraLoja = DIVERGING.negativePole;
  const paraOnline = DIVERGING.positivePole;
  const neutro = dark ? DIVERGING.midDark : DIVERGING.midLight;

  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={clientes} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="id_cliente" {...axisProps} tick={false} height={16}
            label={{ value: '50 clientes, ordenados da maior migracao para a loja a maior migracao para o online',
              position: 'insideBottom', offset: -2, fill: 'var(--text-muted)', fontSize: 11 }} />
          <YAxis {...axisProps} width={56} tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)} pp`} />
          <ReferenceLine y={0} stroke={neutro} strokeWidth={1} />
          <Tooltip
            {...tooltipStyles}
            labelFormatter={() => ''}
            formatter={(v: number, _n, item) => [
              `${v > 0 ? '+' : ''}${v.toFixed(1)} pp ${v < 0 ? '(migrou para a loja)' : '(migrou para o online)'}`,
              (item?.payload as Ponto | undefined)?.nome ?? '',
            ]}
          />
          <Bar dataKey="deltaPP" radius={MARKS.barRadius}>
            {clientes.map((c) => (
              <Cell key={c.id_cliente} fill={c.deltaPP < 0 ? paraLoja : paraOnline} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <ul className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <li className="flex items-center gap-2 text-xs text-ink-secondary">
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: paraLoja }} />
          Perdeu share online (migrou para a loja fisica)
        </li>
        <li className="flex items-center gap-2 text-xs text-ink-secondary">
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: paraOnline }} />
          Ganhou share online
        </li>
      </ul>
    </div>
  );
}
