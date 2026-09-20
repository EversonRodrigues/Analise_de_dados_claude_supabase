'use client';
/**
 * Barra horizontal de UMA serie (magnitude por categoria nominal).
 * Serie unica => sem legenda (o titulo do Card nomeia a medida) + rotulo direto.
 * Dados ja agregados chegam por props; o Dataset nunca cruza para o cliente.
 *
 * FRONTEIRA SERVER/CLIENT: este componente e 'use client', entao o Server
 * Component que o usa NAO pode passar o formatador como prop — funcao nao
 * serializa e o React derruba a rota com erro 500 em runtime (nem o tsc nem os
 * testes pegam isso). Por isso a prop e um DISCRIMINADOR de string, resolvido
 * aqui dentro para o formatador de format.ts. O §3 do contrato continua valendo:
 * a formatacao vem de format.ts, nunca reimplementada na seção.
 */
import {
  Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useSeriesColors, axisProps, gridProps, tooltipStyles } from '@/lib/design/chart-theme';
import { MARKS } from '@/lib/design/tokens';
import { fmtBRL, fmtNum, fmtPct } from '@/lib/design/format';

export type BarraItem = { nome: string; valor: number; detalhe?: string };

/** Discriminador serializavel -> formatador. String atravessa a fronteira; funcao nao. */
const FORMATADORES = { brl: fmtBRL, pct: fmtPct, num: fmtNum } as const;

export function BarrasHorizontais({
  dados, formato = 'brl', altura = 320, rotularDireto = true,
}: {
  dados: BarraItem[];
  formato?: keyof typeof FORMATADORES;
  altura?: number;
  rotularDireto?: boolean;
}) {
  const cores = useSeriesColors();
  const formatar = FORMATADORES[formato];
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 8 }}>
        <CartesianGrid {...gridProps} vertical horizontal={false} />
        <XAxis type="number" {...axisProps} tickFormatter={formatar} />
        <YAxis type="category" dataKey="nome" {...axisProps} width={104} />
        <Tooltip
          {...tooltipStyles}
          cursor={{ fill: 'var(--gridline)', fillOpacity: 0.4 }}
          formatter={(v: number, _n, p) => [
            formatar(v),
            (p?.payload as BarraItem)?.detalhe ?? 'Valor',
          ]}
        />
        <Bar
          dataKey="valor"
          fill={cores[0]}
          radius={[0, MARKS.barRadius[0], MARKS.barRadius[0], 0]}
          barSize={18}
          isAnimationActive={false}
        >
          {rotularDireto && (
            <LabelList
              dataKey="valor"
              position="right"
              formatter={(v: number) => formatar(v)}
              style={{ fill: 'var(--text-secondary)', fontSize: 11 }}
            />
          )}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
