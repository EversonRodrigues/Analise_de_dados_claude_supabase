/**
 * SECAO CLIENTES & COMPORTAMENTO — dono: T4.
 * Server Component: le o Dataset uma vez, aplica as funcoes puras de
 * `@/lib/kpi/clientes` e passa SO dados agregados para os graficos client-side.
 *
 * Narrativa (§6 do contrato):
 *  1. Abertura — o estado da base de clientes e o delta 15d.
 *  2. Tensao  — a receita caiu, mas a frequencia nao: o canal e que mudou.
 *  3. Explicacao — quem migrou, quem concentra receita, quem nao discrimina nada.
 *  4. Fechamento — o que fazer em CRM, com o numero na frente.
 */
import { getDataset } from '@/lib/data/fetch';
import { notaRodapeOrfas } from '@/lib/data/regras';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { Insight } from '@/components/ui/Insight';
import { KpiTile } from '@/components/ui/KpiTile';
import { fmtBRL, fmtBRLCents, fmtNum, fmtPct } from '@/lib/design/format';
import {
  canalPorPeriodo,
  comportamentoPorSafra,
  concentracaoDeReceita,
  dispersaoFrequenciaTicket,
  distribuicaoGeografica,
  intensidadeDeCanal,
  metricasPorCliente,
  migracaoDeCanal,
  perfilDeCanal,
  repertorioDeCategorias,
  resumoClientes,
  segmentacaoRFM,
} from '@/lib/kpi/clientes';
import { CanalPeriodoChart } from './_components/CanalPeriodoChart';
import { DispersaoChart } from './_components/DispersaoChart';
import { EstadosChart } from './_components/EstadosChart';
import { MigracaoChart } from './_components/MigracaoChart';
import { ParetoChart } from './_components/ParetoChart';
import { SafraChart } from './_components/SafraChart';

export const dynamic = 'force-dynamic';

const pp = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)} pp`;

export default async function ClientesPage() {
  const dataset = await getDataset();

  const resumo = resumoClientes(dataset);
  const canal = canalPorPeriodo(dataset);
  const migracao = migracaoDeCanal(dataset);
  const concentracao = concentracaoDeReceita(dataset);
  const rfm = segmentacaoRFM(dataset);
  const safras = comportamentoPorSafra(dataset);
  const perfis = perfilDeCanal(dataset);
  const intensidade = intensidadeDeCanal(dataset);
  const geo = distribuicaoGeografica(dataset);
  const dispersao = dispersaoFrequenciaTicket(dataset);
  const repertorio = repertorioDeCategorias(dataset);
  const metricas = metricasPorCliente(dataset);

  const clientesPorUF = Object.fromEntries(geo.estados.map((e) => [e.estado, e.clientes]));
  const semSingleChannel = perfis.every((p) => p.nome === 'Omnichannel' || p.n === 0);

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-[2.5rem] font-semibold leading-[1.1] tracking-tight">
          Clientes &amp; Comportamento
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-secondary">
          A base tem <strong>{resumo.cadastrados} clientes</strong> e a janela cobre{' '}
          <strong>30 dias</strong> (13/dez/2025 a 11/jan/2026). Com esse tamanho e esse
          horizonte, <strong>retencao, churn e LTV nao sao calculaveis</strong> — nao ha
          historico transacional anterior para comparar. Tudo nesta pagina mede{' '}
          <strong>recencia, frequencia e valor dentro da janela</strong>, e todo recorte
          traz o <code className="text-xs">n</code> do grupo.
        </p>
      </header>

      {/* 1. ABERTURA */}
      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Clientes ativos"
          value={`${fmtNum(resumo.ativos)} de ${fmtNum(resumo.cadastrados)}`}
          hint={`${fmtPct(resumo.taxaAtivacao)} da base comprou na janela. Nenhum cliente inativo — nao ha grupo de reativacao a trabalhar.`}
        />
        <KpiTile
          label="Gasto medio por cliente"
          value={fmtBRL(resumo.gastoMedio)}
          delta={resumo.deltaGastoMedio}
          deltaLabel="15d vs 15d"
          goodDirection="up"
          hint="Em 30 dias. Nao e LTV: e o que o cliente gastou dentro da janela."
        />
        <KpiTile
          label="Compras por cliente"
          value={`${resumo.comprasPorCliente.toFixed(1)} em 30d`}
          delta={resumo.deltaComprasPorCliente}
          deltaLabel="15d vs 15d"
          goodDirection="up"
          hint="Frequencia em 30 dias — nao chame de retencao. Cada linha de venda tem id proprio, entao e 1 item por compra."
        />
        <KpiTile
          label="Ticket medio por compra"
          value={fmtBRLCents(resumo.ticketMedio)}
          delta={resumo.deltaTicketMedio}
          deltaLabel="15d vs 15d"
          goodDirection="up"
          hint="Receita dividida pelo nº de compras."
        />
      </section>

      <Insight headline="A frequencia nao se mexeu. O dinheiro, sim.">
        As compras por cliente ficaram praticamente iguais entre as duas metades da janela
        ({pp(resumo.deltaComprasPorCliente * 100)}), mas o gasto medio caiu{' '}
        {fmtPct(Math.abs(resumo.deltaGastoMedio))} e o ticket medio caiu{' '}
        {fmtPct(Math.abs(resumo.deltaTicketMedio))}. Ninguem parou de comprar — cada compra
        passou a valer menos. Isso descarta engajamento como causa e joga a investigacao
        para <em>onde</em> e <em>o que</em> essas pessoas compram.
      </Insight>

      {/* 2. TENSAO */}
      <Card
        title="Onde o ticket caiu: ecommerce perde, loja fisica ganha"
        subtitle="15 dias recentes contra os 15 anteriores. Duas medidas de escalas diferentes, dois graficos — nunca eixo duplo."
      >
        <CanalPeriodoChart receita={canal.receita} ticket={canal.ticket} />
        <div className="mt-6">
          <DataTable
            caption="Receita, ticket e variacao por canal entre as duas metades da janela."
            columns={['Canal', 'Receita 15d anteriores', 'Receita 15d recentes', 'Δ receita', 'Ticket anterior', 'Ticket recente', 'Δ ticket']}
            rows={[
              [
                'Ecommerce',
                fmtBRL(canal.receita[0].ecommerce),
                fmtBRL(canal.receita[1].ecommerce),
                `${canal.deltaReceitaEcommerce > 0 ? '+' : ''}${fmtPct(canal.deltaReceitaEcommerce)}`,
                fmtBRLCents(canal.ticket[0].ecommerce),
                fmtBRLCents(canal.ticket[1].ecommerce),
                `${canal.deltaTicketEcommerce > 0 ? '+' : ''}${fmtPct(canal.deltaTicketEcommerce)}`,
              ],
              [
                'Loja fisica',
                fmtBRL(canal.receita[0].loja_fisica),
                fmtBRL(canal.receita[1].loja_fisica),
                `${canal.deltaReceitaLoja > 0 ? '+' : ''}${fmtPct(canal.deltaReceitaLoja)}`,
                fmtBRLCents(canal.ticket[0].loja_fisica),
                fmtBRLCents(canal.ticket[1].loja_fisica),
                `${canal.deltaTicketLoja > 0 ? '+' : ''}${fmtPct(canal.deltaTicketLoja)}`,
              ],
            ]}
          />
        </div>
      </Card>

      {/* 3. EXPLICACAO */}
      <Card
        title="A migracao e generalizada, nao e efeito de dois ou tres clientes"
        subtitle={`Variacao do share de receita online de cada cliente entre as duas metades. n = ${migracao.totalClientes} clientes com compra nos dois periodos.`}
      >
        <MigracaoChart clientes={migracao.clientes} />
        <p className="mt-5 text-sm leading-relaxed text-ink-secondary">
          <strong>{migracao.migraramParaLoja} dos {migracao.totalClientes}</strong> clientes
          reduziram a fatia online, e <strong>{migracao.quedaAcima10pp}</strong> deles caíram
          mais de 10 pontos percentuais. A media da base andou {pp(migracao.deltaMedioPP)}.
          O share de receita do ecommerce foi de {fmtPct(canal.shareEcommerceAnterior)} para{' '}
          {fmtPct(canal.shareEcommerceRecente)} em quinze dias. Com n=
          {migracao.totalClientes} isso nao e uma projecao estatistica, mas e um movimento
          que atinge a maioria da base — nao um outlier.
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Todo cliente compra nos dois canais"
          subtitle="Segmentacao so-ecommerce / so-loja / omnichannel — e o que a base devolve."
        >
          <DataTable
            columns={['Perfil', 'Clientes', '% da receita', 'Gasto medio', 'Ticket medio']}
            rows={perfis.map((p) => [
              p.nome,
              fmtNum(p.n),
              p.n === 0 ? '—' : fmtPct(p.pctReceita),
              p.n === 0 ? '—' : fmtBRL(p.gastoMedio),
              p.n === 0 ? '—' : fmtBRLCents(p.ticketMedio),
            ])}
          />
          {semSingleChannel && (
            <p className="mt-4 text-sm leading-relaxed text-ink-secondary">
              Os {resumo.omnichannel} clientes ativos compraram em <strong>ambos</strong> os
              canais na janela. Nao existe grupo mono-canal para comparar, entao a
              comparacao classica &ldquo;omnichannel vale mais que so-online&rdquo;{' '}
              <strong>nao pode ser feita nesta base</strong> — qualquer numero apresentado
              como tal seria inventado. O que varia e a <em>intensidade</em>:
            </p>
          )}
          <div className="mt-4">
            <DataTable
              caption="Clientes agrupados pela fatia da propria receita que vai para o online."
              columns={['Faixa', 'Clientes', 'Share online medio', 'Gasto medio', 'Ticket medio']}
              rows={intensidade.map((f) => [
                `${f.nome} (${f.faixa})`,
                fmtNum(f.n),
                f.n === 0 ? '—' : fmtPct(f.shareEcommerceMedio),
                f.n === 0 ? '—' : fmtBRL(f.gastoMedio),
                f.n === 0 ? '—' : fmtBRLCents(f.ticketMedio),
              ])}
            />
          </div>
        </Card>

        <Card
          title="A receita nao esta concentrada — e isso muda a estrategia de CRM"
          subtitle={`Curva de Pareto sobre ${resumo.ativos} clientes. Gini de ${concentracao.gini.toFixed(3)}.`}
        >
          <ParetoChart curva={concentracao.curva} top20pct={concentracao.top20pct} />
          <p className="mt-5 text-sm leading-relaxed text-ink-secondary">
            Os 20% maiores clientes respondem por{' '}
            <strong>{concentracao.top20pct.toFixed(1)}% da receita</strong> — contra os 20%
            que uma base perfeitamente uniforme entregaria, e muito longe do 80/20 do
            manual. O indice de concentracao e de apenas{' '}
            {concentracao.indiceConcentracao.toFixed(2)}x e sao necessarios{' '}
            <strong>{concentracao.clientesParaMetadeDaReceita} clientes</strong> para somar
            metade da receita. Nao ha conta-chave a defender, e tambem nao ha cauda longa a
            podar: o esforco de CRM rende mais aplicado a toda a base do que a um clube VIP.
          </p>
        </Card>
      </div>

      <Card
        title="Frequencia x ticket: qual eixo realmente separa os clientes"
        subtitle={`Um ponto por cliente (n = ${dispersao.pontos.length}). Cor = tercil de receita total; scatter tem teto de 3 series.`}
      >
        <DispersaoChart pontos={dispersao.pontos} grupos={dispersao.grupos} />
        <p className="mt-5 text-sm leading-relaxed text-ink-secondary">
          A frequencia varia {dispersao.amplitudeCompras.toFixed(1)}x entre o cliente que
          menos e o que mais compra; o ticket medio varia{' '}
          {dispersao.amplitudeTicket.toFixed(1)}x. É o <strong>valor por compra</strong>, e
          nao o numero de compras, que distingue um cliente do outro nesta base — logo e ai
          que uma acao de CRM tem alavanca.
        </p>
      </Card>

      <Card
        title="Segmentacao RFM — restrita aos 30 dias da janela"
        subtitle="Tercis de frequencia e valor. Sem historico anterior, nao existe 'cliente perdido' nem 'reativado' aqui."
        footnote={
          rfm.recenciaInformativa
            ? undefined
            : `Eixo R descartado da leitura: toda a base comprou nos ultimos ${Math.max(...metricas.map((m) => m.recenciaDias))} dias e a amplitude de recencia e de apenas ${rfm.amplitudeRecenciaDias} dia(s). Com 30 dias de janela e compra quase diaria, recencia nao separa ninguem — apresenta-la como score seria fingir uma discriminacao que nao existe.`
        }
      >
        <DataTable
          columns={['Segmento', 'Clientes', '% da receita', 'Compras/cliente', 'Ticket medio', 'O que foi medido']}
          rows={rfm.segmentos.map((s) => [
            s.nome,
            fmtNum(s.n),
            fmtPct(s.pctReceita),
            s.comprasMedia.toFixed(1),
            fmtBRLCents(s.ticketMedio),
            s.descricao,
          ])}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Comportamento por safra de cadastro"
          subtitle="Ano de data_cadastro. O n de cada safra vai no eixo — leia-o antes de ler a barra."
          footnote={`Barras com opacidade reduzida tem n < 10. Com ${resumo.cadastrados} clientes no total, a diferenca entre as safras esta dentro do ruido de grupos deste tamanho: nao trate como tendencia de aquisicao.`}
        >
          <SafraChart safras={safras} />
          <div className="mt-6">
            <DataTable
              columns={['Safra', 'n', 'Gasto medio', 'Ticket medio', 'Compras/cliente', 'Share online']}
              rows={safras.map((s) => [
                s.rotulo,
                s.n,
                fmtBRL(s.gastoMedio),
                fmtBRLCents(s.ticketMedio),
                s.comprasMedia.toFixed(1),
                fmtPct(s.shareEcommerce),
              ])}
            />
          </div>
        </Card>

        <Card
          title="Receita por UF"
          subtitle={`${geo.totalEstados} estados, ${geo.paises.length} pais. Top 8 no grafico, o resto agrupado em 'Outros'.`}
          footnote={`${geo.estadosComUmCliente} das ${geo.totalEstados} UFs tem um unico cliente: nesses casos a barra do estado e a receita de uma pessoa, nao um mercado. Mapa foi descartado de proposito — com 1 pais e 2 clientes por UF na mediana, ele sugeriria uma densidade que nao existe.`}
        >
          <EstadosChart barras={geo.barras} clientesPorUF={clientesPorUF} />
          <div className="mt-6">
            <DataTable
              caption="Todas as UFs, ordenadas por receita."
              columns={['UF', 'Clientes', 'Receita', 'Receita por cliente']}
              rows={geo.estados.map((e) => [
                e.estado,
                e.clientes,
                fmtBRL(e.receita),
                fmtBRL(e.receitaPorCliente),
              ])}
            />
          </div>
        </Card>
      </div>

      <Card
        title="Repertorio de compra: nao ha nicho comportamental"
        subtitle="Categorias distintas compradas por cliente na janela."
        footnote={notaRodapeOrfas(dataset)}
      >
        <p className="text-sm leading-relaxed text-ink-secondary">
          O catalogo tem <strong>{repertorio.categoriasNoCatalogo} categorias</strong> e o
          cliente medio comprou em{' '}
          <strong>{repertorio.mediaCategoriasPorCliente.toFixed(1)}</strong> delas em 30
          dias (minimo {repertorio.minCategorias}, maximo {repertorio.maxCategorias});{' '}
          {fmtPct(repertorio.pctCobremCatalogoInteiro)} dos clientes passaram por{' '}
          <em>todas</em> as categorias. Nenhuma segmentacao por afinidade de categoria e
          viavel: todo mundo compra quase tudo. Recomendacao por categoria nesta base seria
          ruido, nao personalizacao.
        </p>
      </Card>

      {/* 4. FECHAMENTO */}
      <Insight headline="Segure o ticket do online antes de trocar a estrategia de aquisicao.">
        <p>
          O ecommerce perdeu {fmtPct(Math.abs(canal.deltaReceitaEcommerce))} de receita em
          quinze dias ({fmtBRL(canal.receita[0].ecommerce)} →{' '}
          {fmtBRL(canal.receita[1].ecommerce)}) enquanto a loja fisica ganhou{' '}
          {fmtPct(canal.deltaReceitaLoja)} ({fmtBRL(canal.receita[0].loja_fisica)} →{' '}
          {fmtBRL(canal.receita[1].loja_fisica)}). O ticket online caiu{' '}
          {fmtPct(Math.abs(canal.deltaTicketEcommerce))} e a loja o ultrapassou:{' '}
          {fmtBRLCents(canal.ticket[1].loja_fisica)} contra{' '}
          {fmtBRLCents(canal.ticket[1].ecommerce)}. E a frequencia por cliente nao mudou (
          {resumo.comprasPorCliente.toFixed(1)} compras em 30 dias,{' '}
          {pp(resumo.deltaComprasPorCliente * 100)}) — logo isto nao e queda de demanda, e
          deslocamento de valor entre canais.
        </p>
        <p className="mt-3">
          <strong>O que fazer:</strong> a acao e sobre valor do carrinho online, nao sobre
          retencao. Os {migracao.quedaAcima10pp} clientes que perderam mais de 10 pp de
          share online sao a lista de trabalho — todos ja compram na loja, entao o caminho e
          incentivo de cesta no ecommerce (frete por faixa de valor, combinacao de itens),
          nao cupom de reativacao. E como os 20% maiores respondem por apenas{' '}
          {concentracao.top20pct.toFixed(1)}% da receita, um programa VIP nao paga: a
          campanha precisa alcancar os {resumo.ativos} clientes, nao uma elite.
        </p>
        <p className="mt-3 text-xs text-ink-muted">
          Limites a declarar junto com qualquer decisao: n={resumo.cadastrados} clientes,
          janela de 30 dias, comparacao 15d vs 15d dentro da propria janela. Nao ha base
          para retencao, churn, LTV, YoY ou sazonalidade.
        </p>
      </Insight>
    </div>
  );
}
