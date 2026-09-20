/**
 * Seção VENDAS & RECEITA — Server Component. Dono: T2.
 *
 * A historia em quatro batidas (§6 do contrato):
 *   1. Abertura  — o estado do negocio em quatro KpiTiles com delta 15d.
 *   2. Tensao    — a receita diaria por canal: o total cai sem que o volume caia.
 *   3. Explicacao— ticket medio por canal e a atribuicao em reais por categoria.
 *   4. Fechamento— o que fazer, com o numero na frase.
 *
 * Todo texto narrativo e interpolado a partir das funcoes puras de
 * `@/lib/kpi/vendas` — nenhum numero digitado a mao, nada que possa envelhecer
 * em silencio se a base mudar.
 */
import { getDataset } from '@/lib/data/fetch';
import { notaRodapeOrfas } from '@/lib/data/regras';
import { Card } from '@/components/ui/Card';
import { KpiTile } from '@/components/ui/KpiTile';
import { Insight } from '@/components/ui/Insight';
import { DataTable } from '@/components/ui/DataTable';
import { fmtBRL, fmtBRLCents, fmtNum, fmtPct, fmtDelta, fmtDate } from '@/lib/design/format';
import { TYPE } from '@/lib/design/tokens';
import {
  receitaComDelta,
  pedidosComDelta,
  ticketMedioComDelta,
  unidadesComDelta,
  receitaPorDia,
  receitaMediaDiaria,
  desempenhoPorCanal,
  receitaPorCategoria,
  deltaCategoriaPorCanal,
  topProdutos,
  curvaPareto,
  concentracaoTopN,
  produtosPara,
  dataCorte,
  periodoObservado,
  receitaClassificavel,
  pesoOrfas,
} from '@/lib/kpi/vendas';
import { ReceitaDiariaChart } from './_components/ReceitaDiariaChart';
import { TicketCanalChart } from './_components/TicketCanalChart';
import { DeltaCategoriaChart } from './_components/DeltaCategoriaChart';
import { CategoriaChart } from './_components/CategoriaChart';
import { ParetoChart } from './_components/ParetoChart';

export const dynamic = 'force-dynamic';

/** Escreve um delta como texto de negocio ("caiu 5,0%" / "subiu 21,7%"). */
const leitura = (d: number) => `${d >= 0 ? 'subiu' : 'caiu'} ${fmtPct(Math.abs(d))}`;

/**
 * Converte 'yyyy-mm-dd' em Date no fuso LOCAL, para formatar sem deslocar o dia.
 * `new Date('2025-12-13')` e meia-noite UTC; renderizada em UTC-3 ela volta para
 * 12 de dezembro, e a pagina inteira passa a exibir a janela um dia adiantada.
 * Com o sufixo de hora o parse e local e o rotulo bate com o dia do dado.
 */
const diaLocal = (iso: string) => new Date(`${iso}T00:00:00`);

export default async function VendasPage() {
  const dataset = await getDataset();

  // Estado vazio ANTES de qualquer numero. Se a leitura voltar sem vendas — RLS,
  // filtro ou falha de rede —, a pagina diz isso em vez de renderizar uma
  // narrativa de zeros com datas de epoch, que teria a mesma cara de um painel
  // legitimo. `periodoObservado` devolve null exatamente para esse caso.
  const periodo = periodoObservado(dataset);
  const corte = dataCorte(dataset);
  if (!periodo || !corte) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className={TYPE.hero}>Vendas &amp; Receita</h1>
        </header>
        <Card title="Sem dados no período">
          <p className="max-w-2xl text-sm leading-relaxed text-ink-secondary">
            A consulta não retornou nenhuma venda. Nada é exibido aqui até haver dados: um painel de zeros
            seria indistinguível de um negócio parado. Verifique as políticas de acesso da tabela{' '}
            <code className="text-ink">vendas</code> e a conexão com o Supabase.
          </p>
        </Card>
      </div>
    );
  }

  const receita = receitaComDelta(dataset);
  const pedidos = pedidosComDelta(dataset);
  const ticket = ticketMedioComDelta(dataset);
  const unidades = unidadesComDelta(dataset);

  const serieDiaria = receitaPorDia(dataset);
  const mediaDiaria = receitaMediaDiaria(dataset);

  const canais = desempenhoPorCanal(dataset);
  const online = canais.find((c) => c.canal === 'ecommerce');
  const loja = canais.find((c) => c.canal === 'loja_fisica');

  const categorias = receitaPorCategoria(dataset, 8);
  const deltaOnline = deltaCategoriaPorCanal(dataset, 'ecommerce');
  const piorCategoria = deltaOnline[0];
  const melhorCategoria = deltaOnline[deltaOnline.length - 1];

  const top = topProdutos(dataset, 10);
  const curva = curvaPareto(dataset);
  const conc = concentracaoTopN(dataset, 10);
  const para80 = produtosPara(dataset, 0.8);

  const classificavel = receitaClassificavel(dataset);
  const orfas = pesoOrfas(dataset);
  const nota = notaRodapeOrfas(dataset);

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------------- */}
      {/* 1. ABERTURA                                                       */}
      {/* ---------------------------------------------------------------- */}
      <header>
        <h1 className={TYPE.hero}>Vendas &amp; Receita</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink-secondary">
          {fmtDate(diaLocal(periodo.inicio))} a {fmtDate(diaLocal(periodo.fim))} — 30 dias de operação, {fmtNum(pedidos.valor)}{' '}
          pedidos. Sem histórico anterior, toda comparação desta página é{' '}
          <strong className="font-medium text-ink">últimos 15 dias contra os 15 anteriores</strong>, com o corte
          em {fmtDate(diaLocal(corte))}. Não há base para leitura anual nem sazonal.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Receita total"
          value={fmtBRL(receita.valor)}
          delta={receita.delta}
          deltaLabel="vs. 15d anteriores"
          goodDirection="up"
          hint={`${fmtBRL(mediaDiaria)} por dia, em média`}
        />
        <KpiTile
          label="Pedidos"
          value={fmtNum(pedidos.valor)}
          delta={pedidos.delta}
          deltaLabel="vs. 15d anteriores"
          goodDirection="up"
          hint={`${fmtNum(pedidos.recente)} nos últimos 15 dias`}
        />
        <KpiTile
          label="Ticket médio"
          value={fmtBRLCents(ticket.valor)}
          delta={ticket.delta}
          deltaLabel="vs. 15d anteriores"
          goodDirection="up"
          hint={`${fmtBRLCents(ticket.anterior)} → ${fmtBRLCents(ticket.recente)}`}
        />
        <KpiTile
          label="Unidades vendidas"
          value={fmtNum(unidades.valor)}
          delta={unidades.delta}
          deltaLabel="vs. 15d anteriores"
          goodDirection="up"
          hint={`${(unidades.valor / Math.max(1, pedidos.valor)).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} itens por pedido`}
        />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 2. TENSAO                                                         */}
      {/* ---------------------------------------------------------------- */}
      <Card
        title="A receita caiu sem que o volume caísse"
        subtitle={`Receita diária por canal · linha tracejada = corte dos 15 dias (${fmtDate(diaLocal(corte))})`}
      >
        <p className="mb-4 max-w-3xl text-sm leading-relaxed text-ink-secondary">
          O número de pedidos {leitura(pedidos.delta)} entre os dois períodos — praticamente estável, com{' '}
          {fmtNum(pedidos.anterior)} e depois {fmtNum(pedidos.recente)}. Ainda assim a receita{' '}
          {leitura(receita.delta)}, de {fmtBRL(receita.anterior)} para {fmtBRL(receita.recente)}. A perda de{' '}
          {fmtBRL(receita.anterior - receita.recente)} não veio de menos clientes comprando: veio do valor de
          cada pedido. E as duas linhas abaixo mostram que ela não é uniforme entre os canais.
        </p>
        <ReceitaDiariaChart
          dados={serieDiaria.map((d) => ({ dia: d.dia, ecommerce: d.ecommerce, loja_fisica: d.loja_fisica }))}
          corte={corte}
        />
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* 3. EXPLICACAO — canal                                             */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title="Os dois canais foram em direções opostas"
          subtitle="Ticket médio por canal, antes e depois do corte"
        >
          <TicketCanalChart
            dados={canais.map((c) => ({
              rotulo: c.rotulo,
              anterior: c.ticketAnterior,
              recente: c.ticketRecente,
            }))}
          />
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-secondary">
            {online && loja && (
              <>
                O e-commerce, que responde por {fmtPct(online.participacao)} da receita, viu o ticket{' '}
                {leitura(online.deltaTicket)} ({fmtBRLCents(online.ticketAnterior)} →{' '}
                {fmtBRLCents(online.ticketRecente)}). A loja física fez o contrário:{' '}
                {leitura(loja.deltaTicket)} ({fmtBRLCents(loja.ticketAnterior)} →{' '}
                {fmtBRLCents(loja.ticketRecente)}).{' '}
                {loja.ticketRecente > online.ticketRecente
                  ? 'O canal físico, que começava a janela abaixo do online, terminou acima dele.'
                  : 'O canal online segue à frente, mas a distância encurtou.'}
              </>
            )}
          </p>
        </Card>

        <Card title="Canal em números" subtitle="Receita, mix e os deltas de 15 dias">
          <DataTable
            columns={['Canal', 'Receita', 'Mix', 'Pedidos', 'Ticket', 'Δ receita', 'Δ ticket']}
            rows={canais.map((c) => [
              c.rotulo,
              fmtBRL(c.receita),
              fmtPct(c.participacao),
              fmtNum(c.pedidos),
              fmtBRLCents(c.ticketMedio),
              fmtDelta(c.deltaReceita),
              fmtDelta(c.deltaTicket),
            ])}
            caption="Canal é atributo da própria venda: as 20 vendas órfãs continuam contadas aqui."
          />
          <p className="mt-4 text-sm leading-relaxed text-ink-secondary">
            {online && loja && (
              <>
                Em reais, o e-commerce perdeu {fmtBRL(online.receitaAnterior - online.receitaRecente)} e a loja
                física ganhou {fmtBRL(loja.receitaRecente - loja.receitaAnterior)}. O físico recuperou pouco
                mais da metade do que o online deixou na mesa — o saldo é a queda de{' '}
                {fmtPct(Math.abs(receita.delta))} no consolidado.
              </>
            )}
          </p>
        </Card>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 3b. EXPLICACAO — atribuicao por categoria                         */}
      {/* ---------------------------------------------------------------- */}
      <Card
        title="Onde, dentro do e-commerce, o dinheiro sumiu"
        subtitle="Variação absoluta de receita por categoria, últimos 15 dias vs. 15 anteriores — apenas canal online"
        footnote={nota}
      >
        <p className="mb-4 max-w-3xl text-sm leading-relaxed text-ink-secondary">
          O corte está em reais, não em percentual: triplicar uma categoria de R$ 2 mil não paga a conta.
          {piorCategoria && melhorCategoria && (
            <>
              {' '}
              <strong className="font-medium text-ink">{piorCategoria.nome}</strong> sozinha responde por{' '}
              {fmtBRL(Math.abs(piorCategoria.deltaAbsoluto))} da perda online, enquanto{' '}
              <strong className="font-medium text-ink">{melhorCategoria.nome}</strong> foi na direção oposta e
              somou {fmtBRL(melhorCategoria.deltaAbsoluto)}.
            </>
          )}
        </p>
        <DeltaCategoriaChart
          dados={deltaOnline.map((c) => ({ nome: c.nome, deltaAbsoluto: c.deltaAbsoluto }))}
        />
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title="Receita por categoria"
          subtitle={`${fmtBRL(classificavel)} classificáveis em produto — ${fmtPct(1 - orfas.fracao)} da receita total`}
          footnote={nota}
        >
          <CategoriaChart
            dados={categorias.map((c) => ({
              nome: c.nome,
              receita: c.receita,
              participacao: c.participacao,
            }))}
          />
          <div className="mt-6">
            <DataTable
              columns={['Categoria', 'Receita', '% do classificável', 'Δ 15d']}
              rows={categorias.map((c) => [
                c.nome,
                fmtBRL(c.receita),
                fmtPct(c.participacao),
                fmtDelta(c.delta),
              ])}
              caption="Visão alternativa do gráfico ao lado."
            />
          </div>
        </Card>

        <Card
          title="A receita está concentrada em poucos SKUs"
          subtitle={`${fmtNum(conc.produtosComVenda)} produtos tiveram venda no período`}
          footnote={nota}
        >
          <ParetoChart
            dados={curva.map((p) => ({ rank: p.rank, participacaoAcumulada: p.participacaoAcumulada }))}
            marcoRank={conc.n}
            marcoValor={conc.participacao}
          />
          <p className="mt-4 text-sm leading-relaxed text-ink-secondary">
            {fmtNum(conc.n)} produtos — {fmtPct(conc.fracaoCatalogo)} dos que venderam — concentram{' '}
            {fmtPct(conc.participacao)} da receita classificável. Para chegar a 80% bastam{' '}
            {fmtNum(para80)} SKUs. Uma ruptura de estoque no topo dessa curva não é incidente operacional, é
            evento de receita.
          </p>
          <div className="mt-6">
            <DataTable
              columns={['Produto', 'Categoria', 'Receita', '% ', 'Unid.']}
              rows={top.map((p) => [
                p.nome,
                p.categoria,
                fmtBRL(p.receita),
                fmtPct(p.participacao),
                fmtNum(p.unidades),
              ])}
              caption="Top 10 produtos por receita, agrupados por id_produto."
            />
          </div>
        </Card>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 4. FECHAMENTO                                                     */}
      {/* ---------------------------------------------------------------- */}
      {online && loja && piorCategoria && (
        <Insight headline="O problema é o valor do carrinho online, não a demanda — e ele tem endereço">
          <p>
            Com {fmtNum(pedidos.valor)} pedidos e volume estável (
            {fmtDelta(pedidos.delta)} entre os períodos), a queda de {fmtPct(Math.abs(receita.delta))} na
            receita é inteiramente um problema de ticket: {fmtBRLCents(ticket.anterior)} caíram para{' '}
            {fmtBRLCents(ticket.recente)}. Ela está concentrada no e-commerce, que perdeu{' '}
            {fmtBRL(online.receitaAnterior - online.receitaRecente)} enquanto a loja física ganhou{' '}
            {fmtBRL(loja.receitaRecente - loja.receitaAnterior)} — e dentro do online, {piorCategoria.nome}{' '}
            explica {fmtBRL(Math.abs(piorCategoria.deltaAbsoluto))} do buraco.
          </p>
          <p className="mt-3">
            <strong className="font-medium text-ink">O que fazer:</strong> auditar preço praticado e desconto
            em {piorCategoria.nome} no e-commerce antes de qualquer investimento em tráfego — pagar por mais
            visitas a um carrinho que encolheu {fmtPct(Math.abs(online.deltaTicket))} só multiplica pedidos
            baratos. Em paralelo, proteger o topo da curva: {fmtNum(conc.n)} SKUs carregam{' '}
            {fmtPct(conc.participacao)} da receita, e a loja física — hoje com ticket de{' '}
            {fmtBRLCents(loja.ticketRecente)}, acima do online — mostra que o cliente aceita cesta maior
            quando o sortimento certo está na frente dele.
          </p>
          <p className="mt-3 text-xs text-ink-muted">
            Leitura limitada a {fmtDate(diaLocal(periodo.inicio))}–{fmtDate(diaLocal(periodo.fim))}. Sem histórico anterior, nada
            aqui distingue mudança estrutural de oscilação de 15 dias; {fmtNum(orfas.linhas)} vendas (
            {fmtBRL(orfas.receita)}, {fmtPct(orfas.fracao)} da receita) não têm produto no catálogo e ficam
            fora dos cortes por categoria e SKU.
          </p>
        </Insight>
      )}
    </div>
  );
}
