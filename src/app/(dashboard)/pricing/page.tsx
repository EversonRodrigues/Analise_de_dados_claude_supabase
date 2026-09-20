/**
 * Seção PRICING & MARGEM — dono: T3.
 *
 * Nao existe coluna de custo em nenhuma das 4 tabelas: margem bruta contabil e
 * incalculavel. Esta pagina trabalha com dois proxies rastreaveis a dado real —
 * posicionamento competitivo (snapshot de 2026-01-11) e erosao de desconto
 * (preco de tabela vs. preco praticado). Isso esta dito na interface, em nota.
 */
import { getDataset } from '@/lib/data/fetch';
import { notaRodapeOrfas } from '@/lib/data/regras';
import { Card } from '@/components/ui/Card';
import { KpiTile } from '@/components/ui/KpiTile';
import { Insight } from '@/components/ui/Insight';
import { DataTable } from '@/components/ui/DataTable';
import { fmtBRL, fmtBRLCents, fmtDate, fmtNum, fmtPct } from '@/lib/design/format';
import {
  anomaliasCompetitivas,
  dataSnapshotCompetidores,
  decomposicaoPrecoPorCanal,
  degrausDeDesconto,
  dispersaoDescontoVolume,
  elasticidadePorFaixa,
  erosaoPorCanal,
  erosaoPorCategoria,
  oportunidades,
  posicionamentoGeral,
  posicionamentoPorCategoria,
  realizacaoPorMarca,
  resumoPricing,
  FAIXA_PARIDADE,
} from '@/lib/kpi/pricing';
import { BarrasHorizontais } from './_components/BarrasHorizontais';
import { PosicionamentoChart } from './_components/PosicionamentoChart';
import { FaixaDescontoCharts } from './_components/FaixaDescontoCharts';
import { DispersaoChart } from './_components/DispersaoChart';
import { DecomposicaoCanalChart } from './_components/DecomposicaoCanalChart';

export const dynamic = 'force-dynamic';

const NOTA_CUSTO =
  'Nao existe coluna de custo em nenhuma das 4 tabelas: margem bruta contabil e incalculavel nesta base. ' +
  'Onde se le "margem" nesta seção, entenda proxy competitivo (preco de tabela vs. mediana dos concorrentes) ' +
  'e erosao de desconto (preco de tabela vs. preco praticado). Nenhum numero aqui assume um percentual de custo.';

export default async function PricingPage() {
  const dataset = await getDataset();

  const resumo = resumoPricing(dataset);
  const geral = posicionamentoGeral(dataset);
  const porCategoria = posicionamentoPorCategoria(dataset);
  const anomalias = anomaliasCompetitivas(dataset);
  const faixas = elasticidadePorFaixa(dataset);
  const degraus = degrausDeDesconto(dataset);
  const dispersao = dispersaoDescontoVolume(dataset);
  const erosaoCat = erosaoPorCategoria(dataset);
  const erosaoCanal = erosaoPorCanal(dataset);
  const marcas = realizacaoPorMarca(dataset);
  const opp = oportunidades(dataset);
  const decomposicao = decomposicaoPrecoPorCanal(dataset);
  const snapshot = dataSnapshotCompetidores(dataset);
  const notaOrfas = notaRodapeOrfas(dataset);

  const semDesconto = faixas.find((f) => f.faixa === 'Sem desconto');
  const linhasComDesconto = Math.round(
    resumo.total.linhas * resumo.total.pctLinhasComDesconto,
  );
  const linhasNosDegraus = degraus.reduce((acc, d) => acc + d.linhas, 0);
  const degrauMaisCaro = [...degraus].sort((a, b) => b.erosao - a.erosao)[0];
  const maiorFaixa = [...faixas].sort((a, b) => b.erosao - a.erosao)[0];
  const topFaixa = [...faixas].sort((a, b) => b.unidadesPorPedido - a.unidadesPorPedido)[0];
  const catTopo = erosaoCat[0];
  const canalTopo = erosaoCanal[0];
  const marcaPiorRealizacao = [...marcas]
    .filter((m) => m.linhas >= 50)
    .sort((a, b) => a.realizacao - b.realizacao)[0];
  const anomaliaPrincipal = anomalias[0];
  const ecom = decomposicao.find((d) => d.canal === 'E-commerce');
  const loja = decomposicao.find((d) => d.canal === 'Loja fisica');
  /** Distancia entre as duas leituras de realizacao, em pontos percentuais. */
  const ppGap = (a: number, b: number) =>
    // Pontos percentuais com 2 casas: format.ts nao tem formatador de "pp" e o
    // §3 proibe reimplementar Intl na seção, entao so troco o separador decimal.
    `${(Math.abs(a - b) * 100).toFixed(2).replace('.', ',')} pp`;
  const ppGapLojaAnterior = loja ? ppGap(loja.realizacaoAnterior, loja.realizacaoSimplesAnterior) : '';
  const ppGapLojaRecente = loja ? ppGap(loja.realizacaoRecente, loja.realizacaoSimplesRecente) : '';

  const notaSnapshot = snapshot
    ? `Precos de concorrentes sao um snapshot de UM UNICO DIA (${fmtDate(`${snapshot}T12:00:00`)}), 4 concorrentes, ${fmtNum(geral.total)} produtos cobertos. Nao ha serie temporal de preco de mercado nesta base — nenhum grafico desta seção plota concorrencia ao longo do tempo.`
    : 'Sem cotacoes de concorrentes na base.';

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[2.5rem] font-semibold leading-[1.1] tracking-tight text-ink">
          Pricing &amp; Margem
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-secondary">
          Estamos praticamente colados no mercado (indice mediano {geral.indiceMediano.toFixed(2)}),
          mas entregamos {fmtPct(resumo.total.pctLinhasComDesconto)} das linhas abaixo da tabela.
          A conta desse desconto, em 30 dias, e {fmtBRL(resumo.total.erosao)}.
        </p>
      </header>

      {/* 1. ABERTURA */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Realização ponderada"
          value={fmtPct(resumo.total.realizacao)}
          delta={resumo.deltaRealizacao}
          deltaLabel="vs. 15d anteriores"
          goodDirection="up"
          hint="Receita praticada ÷ receita a preço de tabela — ponderada por receita, não média por linha."
        />
        <KpiTile
          label="Erosão de desconto (30d)"
          value={fmtBRL(resumo.total.erosao)}
          delta={resumo.deltaErosao}
          deltaLabel="vs. 15d anteriores"
          goodDirection="down"
          hint={`Sobre ${fmtBRL(resumo.total.receitaTabela)} de receita a preço cheio.`}
        />
        <KpiTile
          label="Linhas com desconto"
          value={fmtPct(resumo.total.pctLinhasComDesconto)}
          delta={resumo.deltaPctComDesconto}
          deltaLabel="vs. 15d anteriores"
          goodDirection="down"
          hint={`Desconto médio, quando concedido: ${fmtPct(resumo.total.descontoMedioQuandoHa)}.`}
        />
        <KpiTile
          label="Índice vs. mercado"
          value={geral.indiceMediano.toFixed(2)}
          goodDirection="neutral"
          hint={`Mediana de preço_atual ÷ mediana dos 4 concorrentes. Sem delta: o snapshot é de um único dia.`}
        />
      </div>

      {/* 2. TENSAO */}
      <Card
        title="O desconto não está comprando volume"
        subtitle="Receita perdida por faixa de desconto e unidades por linha de venda, mesma janela de 30 dias"
        footnote={`${NOTA_CUSTO} ${notaOrfas}`}
      >
        <FaixaDescontoCharts
          dados={faixas.map((f) => ({
            faixa: f.faixa,
            erosao: f.erosao,
            unidadesPorPedido: f.unidadesPorPedido,
            linhas: f.linhas,
          }))}
        />
        <div className="mt-6">
          <DataTable
            caption="Faixa de desconto: volume, receita e erosão"
            columns={['Faixa', 'Linhas', 'Unid./linha', 'Receita', 'Erosão']}
            rows={faixas.map((f) => [
              f.faixa,
              fmtNum(f.linhas),
              f.unidadesPorPedido.toFixed(2),
              fmtBRL(f.receita),
              fmtBRL(f.erosao),
            ])}
          />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-secondary">
          Sem desconto, cada linha de venda leva {semDesconto?.unidadesPorPedido.toFixed(2)} unidades.
          Na faixa mais agressiva, {topFaixa?.unidadesPorPedido.toFixed(2)}. A diferença é ruído —
          e custa {fmtBRL(maiorFaixa?.erosao ?? 0)} só na faixa {maiorFaixa?.faixa}.
        </p>
        {degraus.length > 0 && degrauMaisCaro && (
          <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
            <span className="font-medium text-ink">E o desconto não é contínuo — é botão.</span>{' '}
            {linhasNosDegraus === linhasComDesconto
              ? `Todas as ${fmtNum(linhasComDesconto)} linhas descontadas`
              : `${fmtNum(linhasNosDegraus)} das ${fmtNum(linhasComDesconto)} linhas descontadas`}{' '}
            saem em exatamente um de {fmtNum(degraus.length)} valores:{' '}
            {[...degraus].sort((a, b) => a.desconto - b.desconto).map((d) => fmtPct(d.desconto)).join(', ')}.
            Isso é política comercial com valores predefinidos, não negociação caso a caso — e muda
            a natureza da recomendação: não é pedir para descontar menos, é desligar um degrau.
            O degrau de {fmtPct(degrauMaisCaro.desconto)} sozinho custa {fmtBRL(degrauMaisCaro.erosao)}.
          </p>
        )}
      </Card>

      {/* 3. EXPLICACAO — o corte por produto confirma a ausencia de relacao */}
      <Card
        title="Nenhuma relação entre desconto e giro, produto a produto"
        subtitle={`Um ponto por produto com venda no período; scatter tem teto de 3 séries, as demais categorias estão dobradas em "Outras categorias"`}
        footnote={notaOrfas}
      >
        <DispersaoChart
          series={dispersao.map((s) => ({
            nome: s.nome,
            pontos: s.pontos.map((p) => ({
              nome: p.nome,
              desconto: p.desconto,
              unidades: p.unidades,
            })),
          }))}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Quem dá mais desconto: categoria"
          subtitle="Receita perdida vs. preço de tabela, 30 dias"
          footnote={notaOrfas}
        >
          <BarrasHorizontais
            dados={erosaoCat.map((c) => ({
              nome: c.nome,
              valor: c.erosao,
              detalhe: `Erosão · realização ${fmtPct(c.realizacao)}`,
            }))}
            altura={360}
          />
          <div className="mt-6">
            <DataTable
              caption="Erosão e realização de preço por categoria"
              columns={['Categoria', 'Linhas', 'Realização', 'Erosão']}
              rows={erosaoCat.map((c) => [
                c.nome, fmtNum(c.linhas), fmtPct(c.realizacao), fmtBRL(c.erosao),
              ])}
            />
          </div>
        </Card>

        <Card
          title="Quem dá mais desconto: canal"
          subtitle="Receita perdida vs. preço de tabela, 30 dias"
          footnote={notaOrfas}
        >
          <BarrasHorizontais
            dados={erosaoCanal.map((c) => ({
              nome: c.nome,
              valor: c.erosao,
              detalhe: `Erosão · realização ${fmtPct(c.realizacao)}`,
            }))}
            altura={160}
          />
          <div className="mt-6">
            <DataTable
              caption="Erosão e disciplina de desconto por canal"
              columns={['Canal', 'Linhas', '% com desconto', 'Realização', 'Erosão']}
              rows={erosaoCanal.map((c) => [
                c.nome,
                fmtNum(c.linhas),
                fmtPct(c.pctLinhasComDesconto),
                fmtPct(c.realizacao),
                fmtBRL(c.erosao),
              ])}
            />
          </div>
          <p className="mt-4 text-sm leading-relaxed text-ink-secondary">
            Os dois canais descontam com a mesma frequência; o que muda é a escala.
            O {canalTopo?.nome} concentra {fmtBRL(canalTopo?.erosao ?? 0)} da erosão.
          </p>
        </Card>
      </div>

      {/* Os canais convergiram de preco medio. Foi desconto ou foi mix? */}
      <Card
        title="Por que os preços médios dos dois canais convergiram"
        subtitle="Decomposição exata da variação do preço médio unitário, 15 dias recentes vs. 15 anteriores"
        footnote={`As duas parcelas somam exatamente o delta observado: ΔP = R₀·(T₁−T₀) + T₁·(R₁−R₀), com P = preço praticado médio, T = preço de tabela médio dos itens vendidos e R = P/T. A metrica de capa do projeto e a realizacao PONDERADA por receita — e a unica que fecha com a erosao em R$ e a unica que enxerga mudanca de alvo do desconto. A tabela traz tambem a MEDIA SIMPLES por linha de venda, para reconciliar com paineis que usam essa leitura: quando as duas divergem, o desconto nao mudou de tamanho, mudou de alvo. ${notaOrfas}`}
      >
        <DecomposicaoCanalChart
          dados={decomposicao.map((d) => ({
            canal: d.canal,
            efeitoMix: d.efeitoMix,
            efeitoDesconto: d.efeitoDesconto,
          }))}
        />
        <div className="mt-6">
          <DataTable
            caption="Preço praticado, preço de tabela e realização por canal, nas duas metades"
            columns={['Canal', 'Preço méd. ant.', 'Preço méd. rec.', 'Tabela méd. ant.', 'Tabela méd. rec.', 'Realiz. pond. ant.', 'Realiz. pond. rec.', 'Realiz. simples ant.', 'Realiz. simples rec.']}
            rows={decomposicao.map((d) => [
              d.canal,
              fmtBRLCents(d.precoMedioAnterior),
              fmtBRLCents(d.precoMedioRecente),
              fmtBRLCents(d.tabelaMediaAnterior),
              fmtBRLCents(d.tabelaMediaRecente),
              fmtPct(d.realizacaoAnterior),
              fmtPct(d.realizacaoRecente),
              fmtPct(d.realizacaoSimplesAnterior),
              fmtPct(d.realizacaoSimplesRecente),
            ])}
          />
        </div>
        {ecom && loja && (
          <p className="mt-4 text-sm leading-relaxed text-ink-secondary">
            Não é desconto. O preço médio do e-commerce caiu {fmtBRLCents(Math.abs(ecom.delta))} e o
            da loja física subiu {fmtBRLCents(Math.abs(loja.delta))}, mas{' '}
            {fmtBRLCents(Math.abs(ecom.efeitoMix))} e {fmtBRLCents(Math.abs(loja.efeitoMix))} desses
            movimentos vêm de <span className="font-medium text-ink">mix de produto</span> — os itens
            vendidos mudaram. O volume de desconto ficou estável nos dois canais: a realização
            ponderada por receita do e-commerce foi de {fmtPct(ecom.realizacaoAnterior)} para{' '}
            {fmtPct(ecom.realizacaoRecente)} e a da loja física, de {fmtPct(loja.realizacaoAnterior)}{' '}
            para {fmtPct(loja.realizacaoRecente)} — e a queda da loja, como o parágrafo abaixo mostra,
            não é desconto maior, é desconto em item mais caro. Os dois canais agora vendem a mesma
            cesta: preço de tabela médio de {fmtBRLCents(ecom.tabelaMediaRecente)} contra{' '}
            {fmtBRLCents(loja.tabelaMediaRecente)}.
          </p>
        )}
        {loja && ecom && (
          <p className="mt-4 text-sm leading-relaxed text-ink-secondary">
            <span className="font-medium text-ink">O que mudou não foi o quanto, foi o quê.</span>{' '}
            Na loja física, o preço de tabela médio das linhas descontadas subiu de{' '}
            {fmtBRLCents(loja.tabelaMediaDescontadasAnterior)} para{' '}
            {fmtBRLCents(loja.tabelaMediaDescontadasRecente)} — o desconto deixou de cair no item
            barato e passou a cair no caro. Por isso a realização ponderada por receita do canal
            recuou ({fmtPct(loja.realizacaoAnterior)} → {fmtPct(loja.realizacaoRecente)}) enquanto a
            média por linha ficou parada. No e-commerce foi o inverso:{' '}
            {fmtBRLCents(ecom.tabelaMediaDescontadasAnterior)} →{' '}
            {fmtBRLCents(ecom.tabelaMediaDescontadasRecente)}, e lá as duas leituras seguem juntas.
            A prova de que isso não é apenas diferença entre métricas: na metade anterior, as duas
            leituras da loja física ficavam a {ppGapLojaAnterior} uma da outra; na recente, a{' '}
            {ppGapLojaRecente}. A distância aparece exatamente onde o alvo do desconto se move.
            Não muda a conclusão sobre a convergência, mas é onde o teto de desconto morde mais.
          </p>
        )}
      </Card>

      <Card
        title="Posicionamento competitivo por categoria"
        subtitle={`Produtos acima, dentro e abaixo da faixa de paridade de ±${fmtPct(FAIXA_PARIDADE)} vs. a mediana dos 4 concorrentes`}
        footnote={notaSnapshot}
      >
        <PosicionamentoChart
          dados={porCategoria.map((c) => ({
            categoria: c.categoria,
            abaixo: c.abaixo,
            faixa: c.faixa,
            acima: c.acima,
          }))}
        />
        <div className="mt-6">
          <DataTable
            caption="Índice mediano e distribuição competitiva por categoria"
            columns={['Categoria', 'Produtos', 'Índice mediano', 'Acima', 'Na faixa', 'Abaixo']}
            rows={porCategoria.map((c) => [
              c.contemAnomalia ? `${c.categoria} (dado suspeito)` : c.categoria,
              fmtNum(c.nProdutos),
              c.indiceMediano.toFixed(3),
              fmtNum(c.acima),
              fmtNum(c.faixa),
              fmtNum(c.abaixo),
            ])}
          />
        </div>
        {anomaliaPrincipal && (
          <p className="mt-4 text-sm leading-relaxed text-ink-secondary">
            <span aria-hidden>⚠ </span>
            <span className="font-medium text-ink">Dado suspeito:</span>{' '}
            {fmtNum(anomaliaPrincipal.nProdutos)} produtos de {anomaliaPrincipal.categoria} aparecem
            com índice {anomaliaPrincipal.indiceMedio.toFixed(2)} porque os 4 concorrentes cotam
            exatamente o mesmo valor, sempre metade do nosso preço de tabela — e a categoria
            registrou {fmtNum(anomaliaPrincipal.unidadesVendidas)} unidades vendidas no período. Isso é
            assinatura de dado sintético, não posição de mercado. Esses produtos ficam fora das
            recomendações de reprecificação abaixo.
          </p>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Oportunidade: caros vs. mercado e sem giro"
          subtitle="Índice acima da paridade e volume igual ou abaixo da mediana do catálogo"
          footnote={`${notaSnapshot} ${notaOrfas}`}
        >
          <DataTable
            columns={['Produto', 'Tabela', 'Mercado', 'Índice', 'Unid.']}
            rows={opp.carosSemGiro.map((o) => [
              o.nome,
              fmtBRL(o.precoTabela),
              fmtBRL(o.medianaMercado),
              o.indice.toFixed(3),
              fmtNum(o.unidades),
            ])}
          />
        </Card>

        <Card
          title="Oportunidade: baratos vs. mercado e com giro"
          subtitle="Dinheiro deixado na mesa — levar o preço de tabela até a mediana do mercado"
          footnote={`${notaSnapshot} ${notaOrfas}`}
        >
          <DataTable
            columns={['Produto', 'Tabela', 'Mercado', 'Unid.', 'Potencial 30d']}
            rows={opp.baratosComGiro.map((o) => [
              o.nome,
              fmtBRL(o.precoTabela),
              fmtBRL(o.medianaMercado),
              fmtNum(o.unidades),
              fmtBRL(o.valor),
            ])}
          />
          <p className="mt-4 text-sm leading-relaxed text-ink-secondary">
            Somados todos os produtos nessa condição, levar o preço até a paridade vale{' '}
            <span className="font-medium text-ink">{fmtBRL(opp.potencialBaratosComGiro)}</span> em 30 dias,
            sem tocar no volume vendido.
          </p>
        </Card>
      </div>

      <Card
        title="Realização de preço por marca"
        subtitle="Receita praticada ÷ receita a preço de tabela, ponderada por volume"
        footnote={notaOrfas}
      >
        <BarrasHorizontais
          dados={marcas.slice(0, 10).map((m) => ({
            nome: m.nome,
            valor: m.erosao,
            detalhe: `Erosão · realização ${fmtPct(m.realizacao)}`,
          }))}
          altura={360}
        />
        <div className="mt-6">
          <DataTable
            caption="Top 10 marcas por erosão de desconto"
            columns={['Marca', 'Linhas', 'Realização', 'Receita', 'Erosão']}
            rows={marcas.slice(0, 10).map((m) => [
              m.nome, fmtNum(m.linhas), fmtPct(m.realizacao), fmtBRL(m.receitaPraticada), fmtBRL(m.erosao),
            ])}
          />
        </div>
      </Card>

      {/* 4. FECHAMENTO */}
      <Insight headline={`Corte a faixa ${maiorFaixa?.faixa}: são ${fmtBRL(maiorFaixa?.erosao ?? 0)} em 30 dias sem contrapartida em volume`}>
        <p>
          A erosão total de {fmtBRL(resumo.total.erosao)} não é um problema de posicionamento —
          estamos em paridade com o mercado ({fmtNum(geral.faixa)} dos {fmtNum(geral.total)} produtos
          dentro de ±{fmtPct(FAIXA_PARIDADE)}). É um problema de disciplina no ponto de venda:{' '}
          {fmtPct(resumo.total.pctLinhasComDesconto)} das linhas saem abaixo da tabela, com desconto
          médio de {fmtPct(resumo.total.descontoMedioQuandoHa)}, e as unidades por linha de venda não
          se mexem ({semDesconto?.unidadesPorPedido.toFixed(2)} sem desconto vs.{' '}
          {topFaixa?.unidadesPorPedido.toFixed(2)} na faixa mais agressiva).
        </p>
        <p className="mt-3">
          <span className="font-medium text-ink">Três decisões, nesta ordem.</span>{' '}
          <span className="font-medium text-ink">(1) Teto de desconto em 10%</span> — a faixa{' '}
          {maiorFaixa?.faixa} sozinha custa {fmtBRL(maiorFaixa?.erosao ?? 0)} em{' '}
          {fmtNum(maiorFaixa?.linhas ?? 0)} linhas; travar o campo no checkout recupera essa verba
          com risco de volume próximo de zero.{' '}
          <span className="font-medium text-ink">(2) Reprecifique a ponta barata</span> —{' '}
          {fmtNum(geral.abaixo)} produtos estão abaixo do mercado; nos que já giram, levar a tabela até
          a mediana dos concorrentes vale {fmtBRL(opp.potencialBaratosComGiro)} em 30 dias.{' '}
          <span className="font-medium text-ink">(3) Comece por {catTopo?.nome} e pelo{' '}
          {canalTopo?.nome}</span> — {fmtBRL(catTopo?.erosao ?? 0)} e {fmtBRL(canalTopo?.erosao ?? 0)}{' '}
          de erosão respectivamente, e por{' '}
          {marcaPiorRealizacao?.nome}, a marca de maior volume com a pior realização
          ({fmtPct(marcaPiorRealizacao?.realizacao ?? 0)}).
        </p>
        {ecom && loja && (
          <p className="mt-3">
            <span className="font-medium text-ink">E uma coisa que o desconto NÃO explica.</span> Os
            preços médios dos dois canais convergiram no período — o e-commerce caiu{' '}
            {fmtBRLCents(Math.abs(ecom.delta))} e a loja física subiu{' '}
            {fmtBRLCents(Math.abs(loja.delta))} por unidade. A causa é mix de produto, não política
            comercial: o desconto médio ficou em torno de 9% nos dois canais e nas duas metades, e
            o preço de tabela médio do que se vendeu é que mudou —{' '}
            {fmtBRLCents(ecom.tabelaMediaAnterior)} → {fmtBRLCents(ecom.tabelaMediaRecente)} no
            e-commerce e {fmtBRLCents(loja.tabelaMediaAnterior)} →{' '}
            {fmtBRLCents(loja.tabelaMediaRecente)} na loja. Migração de catálogo entre canais é
            decisão de sortimento e logística, não de pricing — não gaste a verba de desconto
            tentando defender o share online.
          </p>
        )}
        <p className="mt-3">
          Um contraponto honesto: {fmtNum(resumo.linhasAcimaTabela)} linhas saíram{' '}
          <em>acima</em> da tabela, somando {fmtBRL(resumo.valorAcimaTabela)}. O preço de tabela do
          catálogo não é um teto respeitado nem um piso — é uma sugestão. Antes de qualquer campanha,
          a política de preço precisa virar regra de sistema.
        </p>
        <p className="mt-3 text-xs text-ink-muted">{NOTA_CUSTO}</p>
      </Insight>
    </div>
  );
}
