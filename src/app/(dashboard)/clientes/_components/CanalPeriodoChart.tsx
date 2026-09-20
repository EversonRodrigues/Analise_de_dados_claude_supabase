'use client';
/**
 * Receita e ticket por canal, 15d anteriores vs. 15d recentes.
 * Duas medidas de escalas diferentes => DOIS graficos lado a lado, nunca eixo duplo.
 * Cor segue a ENTIDADE: ecommerce = slot 0, loja fisica = slot 1, sempre.
 */
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { axisProps, gridProps, tooltipStyles, useSeriesColors } from '@/lib/design/chart-theme';
import { MARKS } from '@/lib/design/tokens';
import { Legend } from '@/components/ui/Legend';
import { fmtBRL, fmtBRLCents } from '@/lib/design/format';

type Linha = { periodo: string; ecommerce: number; loja_fisica: number };

/** Indice de cor fixo por canal — nunca por ranking. */
const SLOT = { ecommerce: 0, loja_fisica: 1 } as const;

function Painel({
  titulo, dados, cores, formato,
}: {
  titulo: string;
  dados: Linha[];
  cores: readonly string[];
  formato: (n: number) => string;
}) {
  return (
    <div>
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">{titulo}</p>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={dados} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={MARKS.surfaceGap}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="periodo" {...axisProps} />
          <YAxis {...axisProps} width={72} tickFormatter={(v: number) => formato(v)} />
          <Tooltip
            {...tooltipStyles}
            formatter={(v: number, n: string) => [
              formato(v),
              n === 'ecommerce' ? 'Ecommerce' : 'Loja fisica',
            ]}
          />
          <Bar dataKey="ecommerce" name="ecommerce" fill={cores[SLOT.ecommerce]} radius={MARKS.barRadius} />
          <Bar dataKey="loja_fisica" name="loja_fisica" fill={cores[SLOT.loja_fisica]} radius={MARKS.barRadius} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CanalPeriodoChart({ receita, ticket }: { receita: Linha[]; ticket: Linha[] }) {
  const cores = useSeriesColors();
  return (
    <div>
      <div className="grid gap-6 md:grid-cols-2">
        <Painel titulo="Receita do periodo" dados={receita} cores={cores} formato={fmtBRL} />
        <Painel titulo="Ticket medio por compra" dados={ticket} cores={cores} formato={fmtBRLCents} />
      </div>
      <Legend
        items={[
          { label: 'Ecommerce', color: cores[SLOT.ecommerce] },
          { label: 'Loja fisica', color: cores[SLOT.loja_fisica] },
        ]}
      />
    </div>
  );
}
