import Link from 'next/link';
import { getDataset } from '@/lib/data/fetch';
import { notaRodapeOrfas, orfas, receitaTotal } from '@/lib/data/regras';
import {
  receitaComDelta, pedidosComDelta, receitaDiariaPorCanal, mixCanal, periodoLegivel, migracaoDeCanal,
} from '@/lib/kpi/_visao-geral';
import { KpiTile } from '@/components/ui/KpiTile';
import { Card } from '@/components/ui/Card';
import { Insight } from '@/components/ui/Insight';
import { DataTable } from '@/components/ui/DataTable';
import { ReceitaDiariaCanal } from '@/components/charts/ReceitaDiariaCanal';
import { fmtBRL, fmtNum, fmtPct, fmtBRLCents, fmtDelta } from '@/lib/design/format';

export const dynamic = 'force-dynamic';

const SECOES = [
  { href: '/vendas', titulo: 'Vendas & Receita', resumo: 'Onde a receita nasce: canal, categoria, concentração e ritmo diário.' },
  { href: '/pricing', titulo: 'Pricing & Margem', resumo: 'Posição vs. os 4 concorrentes e quanto o desconto está custando.' },
  { href: '/clientes', titulo: 'Clientes & Comportamento', resumo: 'Concentração da carteira, RFM em 30 dias e valor do omnichannel.' },
];

export default async function VisaoGeral() {
  const ds = await getDataset();

  const receita = receitaComDelta(ds);
  const pedidos = pedidosComDelta(ds);
  const diaria = receitaDiariaPorCanal(ds);
  const canais = mixCanal(ds);
  const periodo = periodoLegivel(ds);
  const orfs = orfas(ds.vendas, ds.produtos);

  const migracao = migracaoDeCanal(ds);
  const online = migracao.canais.find((c) => c.canal === 'ecommerce')!;
  const fisica = migracao.canais.find((c) => c.canal === 'loja_fisica')!;
  const ecom = canais.find((c) => c.canal === 'ecommerce');
  const loja = canais.find((c) => c.canal === 'loja_fisica');
  const tickeInverteu = fisica.recente.ticket > online.recente.ticket
    && fisica.anterior.ticket <= online.anterior.ticket;
  const demandaEstavel = Math.abs(migracao.deltaComprasPorCliente) < 0.02;

  return (
    <div className="space-y-10">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          {periodo.vazio ? periodo.texto : `${periodo.texto} · ${periodo.dias} dias`}
        </p>
        <h1 className="mt-2 text-[2.5rem] font-semibold leading-[1.1] tracking-tight text-ink">
          Visão geral
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-secondary">
          A base cobre uma única janela de {periodo.dias} dias. Não há histórico para comparação
          anual ou sazonal, então toda variação neste dashboard compara os{' '}
          <strong className="font-medium text-ink">últimos 15 dias com os 15 anteriores</strong>.
        </p>
      </header>

      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Receita no período" value={fmtBRL(receita.total)} delta={receita.delta}
          deltaLabel="15d vs. 15d ant." goodDirection="up" />
        <KpiTile label="Pedidos" value={fmtNum(pedidos.pedidos)} delta={pedidos.deltaPedidos}
          deltaLabel="15d vs. 15d ant." goodDirection="up" />
        <KpiTile label="Ticket médio" value={fmtBRLCents(pedidos.ticket)} delta={pedidos.deltaTicket}
          deltaLabel="15d vs. 15d ant." goodDirection="up" />
        <KpiTile label="Clientes ativos" value={fmtNum(new Set(ds.vendas.map((v) => v.id_cliente)).size)}
          hint={`de ${fmtNum(ds.clientes.length)} cadastrados — a carteira inteira comprou na janela`} />
      </section>

      <Card
        title="Receita diária por canal"
        subtitle="Onde o dinheiro entrou, dia a dia — e por qual canal"
        footnote="Inclui todas as vendas do período, inclusive as que não têm produto correspondente no catálogo."
      >
        <ReceitaDiariaCanal dados={diaria} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Mix de canal" subtitle="Participação na receita e ticket por pedido">
          <DataTable
            columns={['Canal', 'Receita', 'Share', 'Pedidos', 'Ticket']}
            rows={canais.map((c) => [
              c.canal === 'ecommerce' ? 'Ecommerce' : 'Loja física',
              fmtBRL(c.receita),
              fmtPct(c.share),
              fmtNum(c.pedidos),
              fmtBRLCents(c.pedidos ? c.receita / c.pedidos : 0),
            ])}
          />
        </Card>

        <Insight headline={
          tickeInverteu
            ? 'O valor está migrando do online para a loja física — e não é queda de demanda.'
            : 'O peso entre os canais mudou dentro da própria janela de 30 dias.'
        }>
          <p>
            Na segunda metade do período, a receita do ecommerce variou{' '}
            <strong className="font-medium text-ink">{fmtDelta(online.deltaReceita)}</strong> enquanto a
            da loja física variou <strong className="font-medium text-ink">{fmtDelta(fisica.deltaReceita)}</strong>.
            A participação do online na receita saiu de {fmtPct(online.anterior.share)} para{' '}
            {fmtPct(online.recente.share)} — {(Math.abs(online.deltaShare) * 100).toFixed(1)} pontos percentuais.
          </p>
          <p className="mt-3">
            O ticket acompanhou o movimento: {fmtBRLCents(online.anterior.ticket)} →{' '}
            {fmtBRLCents(online.recente.ticket)} no ecommerce, contra{' '}
            {fmtBRLCents(fisica.anterior.ticket)} → {fmtBRLCents(fisica.recente.ticket)} na loja física.
            {tickeInverteu && ' A loja física ultrapassou o online em ticket, coisa que não acontecia na primeira metade.'}
          </p>
          <p className="mt-3">
            {demandaEstavel ? (
              <>
                E o cliente não comprou menos: as compras por cliente ficaram praticamente iguais nas duas
                metades ({migracao.comprasPorClienteAnterior.toFixed(1)} →{' '}
                {migracao.comprasPorClienteRecente.toFixed(1)}). Isso descarta retração de demanda e aponta
                para <strong className="font-medium text-ink">deslocamento de valor entre canais</strong>:
                as mesmas pessoas, comprando a mesma quantidade, gastando mais na loja e menos no site.
              </>
            ) : (
              <>
                As compras por cliente foram de {migracao.comprasPorClienteAnterior.toFixed(1)} para{' '}
                {migracao.comprasPorClienteRecente.toFixed(1)} ({fmtDelta(migracao.deltaComprasPorCliente)}),
                então parte do movimento é variação de demanda, não só troca de canal.
              </>
            )}
          </p>
          <p className="mt-3">
            O preço médio por unidade convergiu vindo de lados opostos —{' '}
            {fmtDelta(online.deltaPrecoMedio)} no online e {fmtDelta(fisica.deltaPrecoMedio)} na loja.
            A causa <strong className="font-medium text-ink">não é desconto</strong>. O percentual
            médio de desconto ficou praticamente parado nos dois canais, em torno de 9%
            (ecommerce 9,35% → 9,31%; loja 8,83% → 9,04%), e a frequência mal se moveu.
          </p>
          <p className="mt-3">
            O que explica é o <strong className="font-medium text-ink">mix de produto</strong>. O preço
            de tabela médio do que saiu pelo site caiu de R$ 256,25 para R$ 231,54, enquanto o da loja
            subiu de R$ 212,80 para R$ 231,67: os dois canais passaram a vender praticamente a mesma
            cesta. A decomposição em{' '}
            <Link href="/pricing" className="underline underline-offset-2">Pricing</Link> fecha sem
            resíduo — no ecommerce, dos −R$ 23,69 de preço médio, −R$ 23,90 vêm de mix e +R$ 0,21 de
            desconto. O motor é a categoria Moda, que perdeu R$ 25.632 no online e ganhou R$ 11.410 na
            loja entre as metades.
          </p>
          <p className="mt-3">
            Há um detalhe que só a <strong className="font-medium text-ink">realização ponderada por
            receita</strong> revela, e que a média por linha esconde: na loja física ela caiu de 97,01%
            para 96,34%, enquanto pela média simples pareceria estável. A diferença não é erro de conta
            — é mudança de <em>alvo</em>. O preço de tabela médio das linhas descontadas na loja subiu
            de R$ 196,02 para R$ 240,10: antes a loja descontava o item barato, agora desconta o caro.
            No ecommerce foi o inverso (R$ 263,71 → R$ 224,78). Mesmo desconto, produto diferente.
          </p>
          <p className="mt-3">
            A consequência prática é uma economia de verba:{' '}
            <strong className="font-medium text-ink">não adianta descontar para defender o share
            online</strong>, porque não foi desconto que o derrubou. Migração de catálogo entre canais é
            decisão de sortimento e logística, não de pricing.{' '}
            <Link href="/clientes" className="underline underline-offset-2">Clientes</Link> mostra que
            são as mesmas pessoas fazendo a troca: 33 dos 50 reduziram o share online.
          </p>
        </Insight>
      </div>

      {orfs.length > 0 && (
        <Card title="Qualidade dos dados" subtitle="Um ponto que afeta todos os painéis">
          <p className="text-sm leading-relaxed text-ink-secondary">
            <span aria-hidden>⚠ </span>
            <strong className="font-medium text-ink">
              {orfs.length} vendas ({fmtBRL(receitaTotal(orfs))}) apontam para produtos que não existem no catálogo.
            </strong>{' '}
            A chave estrangeira <code className="text-xs">vendas_id_produto_fkey</code> está marcada como{' '}
            <code className="text-xs">NOT VALID</code> no banco, então o Postgres aceitou essas linhas sem validar.
            Elas continuam contando na receita total — a venda aconteceu — mas somem de qualquer corte por
            produto, categoria ou marca, porque não há atributo para classificá-las.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
            Enquanto isso não for corrigido na origem, a soma das categorias nunca vai fechar com a receita total.
            A diferença é sempre este valor.
          </p>
        </Card>
      )}

      <section>
        <h2 className="text-xl font-semibold tracking-tight text-ink">Seções</h2>
        <div className="mt-5 grid gap-6 md:grid-cols-3">
          {SECOES.map((s) => (
            <Link key={s.href} href={s.href}
              className="group rounded-card border border-hairline bg-surface p-6 transition-colors hover:border-ink-muted">
              <h3 className="text-sm font-medium text-ink">{s.titulo}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{s.resumo}</p>
              <span className="mt-4 inline-block text-xs font-medium text-ink-muted group-hover:text-ink">
                Abrir →
              </span>
            </Link>
          ))}
        </div>
      </section>

      <footer className="border-t border-hairline pt-6 text-xs leading-relaxed text-ink-muted">
        {notaRodapeOrfas(ds)}
      </footer>
    </div>
  );
}
