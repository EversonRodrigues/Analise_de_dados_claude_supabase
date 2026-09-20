/**
 * KPIs de PRICING — dono: T3.
 *
 * AVISO ESTRUTURAL DA BASE: nao existe coluna de custo em nenhuma das 4 tabelas.
 * Margem bruta contabil e INCALCULAVEL aqui. Tudo neste arquivo e proxy:
 *  (a) posicionamento vs. concorrencia (preco_atual / mediana dos 4 concorrentes);
 *  (b) erosao de desconto (preco de tabela - preco praticado).
 * Nenhuma funcao devolve "margem" e nenhuma inventa percentual de custo.
 *
 * `preco_competidores` e um SNAPSHOT DE UM UNICO DIA (2026-01-11). Nada aqui
 * devolve serie temporal de preco de concorrente.
 *
 * Funcoes puras sobre `Dataset`: sem React, sem fetch, sem Date.now().
 */
import type { Dataset, Produto, VendaEnriquecida } from '@/lib/data/types';
import { ALL_PAIRS_SERIES_CAP } from '@/lib/design/tokens';
import {
  receitaLinha,
  enriquecer,
  janela,
  variacao,
  agrupar,
} from '@/lib/data/regras';

// ---------------------------------------------------------------------------
// Limiares — explicitos e exportados para o QA testar.
// ---------------------------------------------------------------------------

/** Faixa de paridade: +-5% em torno da mediana do mercado conta como "na faixa". */
export const FAIXA_PARIDADE = 0.05;

/** Tolerancia de arredondamento para dizer que uma linha saiu com desconto. */
export const TOLERANCIA_DESCONTO = 0.001;

/**
 * Acima deste indice E com os 4 concorrentes cotando o MESMO preco, a leitura
 * deixa de ser "somos caros" e passa a ser "o snapshot esta corrompido".
 * Ver `anomaliasCompetitivas()`.
 */
export const LIMIAR_ANOMALIA = 1.5;

export type Posicao = 'acima' | 'faixa' | 'abaixo';

// ---------------------------------------------------------------------------
// Base competitiva
// ---------------------------------------------------------------------------

export type ReferenciaMercado = {
  idProduto: string;
  mediana: number;
  minimo: number;
  maximo: number;
  nConcorrentes: number;
  /** Todos os concorrentes cotando exatamente o mesmo valor. Sinal de dado sintetico. */
  cotacaoUniforme: boolean;
};

/**
 * Referencia de mercado por produto.
 * Formula: mediana dos precos dos concorrentes do produto (interpolacao linear
 * nos pares); minimo e maximo do mesmo conjunto.
 * Fonte: preco_competidores.preco_concorrente agrupado por id_produto
 *        (snapshot unico de 2026-01-11).
 */
export function referenciaMercado(dataset: Dataset): Map<string, ReferenciaMercado> {
  const porProduto = agrupar(dataset.competidores, (c) => c.id_produto);
  const out = new Map<string, ReferenciaMercado>();
  for (const [idProduto, linhas] of porProduto) {
    const precos = linhas.map((l) => l.preco_concorrente).sort((a, b) => a - b);
    if (precos.length === 0) continue;
    const meio = (precos.length - 1) / 2;
    const mediana =
      precos.length % 2 === 1
        ? precos[meio]
        : (precos[Math.floor(meio)] + precos[Math.ceil(meio)]) / 2;
    out.set(idProduto, {
      idProduto,
      mediana,
      minimo: precos[0],
      maximo: precos[precos.length - 1],
      nConcorrentes: precos.length,
      cotacaoUniforme: precos[0] === precos[precos.length - 1],
    });
  }
  return out;
}

/**
 * Classifica a posicao de um indice de preco contra a faixa de paridade.
 * Formula: indice > 1+FAIXA_PARIDADE -> 'acima'; indice < 1-FAIXA_PARIDADE -> 'abaixo';
 *          caso contrario 'faixa'.
 * Fonte: o indice vem de indicePorProduto() — produtos.preco_atual dividido pela
 *        mediana de preco_competidores.preco_concorrente do mesmo produto.
 */
export function classificar(indice: number): Posicao {
  if (indice > 1 + FAIXA_PARIDADE) return 'acima';
  if (indice < 1 - FAIXA_PARIDADE) return 'abaixo';
  return 'faixa';
}

export type LinhaIndiceProduto = {
  idProduto: string;
  nome: string;
  categoria: string;
  marca: string;
  precoTabela: number;
  medianaMercado: number;
  nConcorrentes: number;
  /** preco_atual / mediana dos concorrentes. 1,00 = paridade. */
  indice: number;
  posicao: Posicao;
  /** Unidades vendidas na janela de 30 dias (giro). */
  unidades: number;
  receita: number;
  /** Preco medio efetivamente praticado (receita / unidades), ou null se sem venda. */
  precoPraticadoMedio: number | null;
  anomalo: boolean;
};

/**
 * Indice de preco vs. concorrencia por produto, com o giro do periodo.
 * Formula: indice = produtos.preco_atual / mediana(preco_concorrente do produto);
 *          unidades = soma de vendas.quantidade; receita = soma(quantidade * preco_unitario).
 * Fonte: produtos.preco_atual, preco_competidores.preco_concorrente, vendas.
 *        Vendas orfas nao entram (corte por produto) — ver notaRodapeOrfas().
 */
export function indicePorProduto(dataset: Dataset): LinhaIndiceProduto[] {
  const ref = referenciaMercado(dataset);
  const vendasPorProduto = agrupar(
    enriquecer(dataset.vendas, dataset.produtos),
    (v) => v.id_produto,
  );

  const out: LinhaIndiceProduto[] = [];
  for (const p of dataset.produtos) {
    const r = ref.get(p.id_produto);
    if (!r || r.mediana <= 0 || !p.preco_atual || p.preco_atual <= 0) continue;
    const vs = vendasPorProduto.get(p.id_produto) ?? [];
    const unidades = vs.reduce((s, v) => s + v.quantidade, 0);
    const receita = vs.reduce((s, v) => s + receitaLinha(v), 0);
    const indice = p.preco_atual / r.mediana;
    out.push({
      idProduto: p.id_produto,
      nome: p.nome_produto,
      categoria: p.categoria ?? 'Sem categoria',
      marca: p.marca ?? 'Sem marca',
      precoTabela: p.preco_atual,
      medianaMercado: r.mediana,
      nConcorrentes: r.nConcorrentes,
      indice,
      posicao: classificar(indice),
      unidades,
      receita,
      precoPraticadoMedio: unidades > 0 ? receita / unidades : null,
      anomalo: r.cotacaoUniforme && indice >= LIMIAR_ANOMALIA,
    });
  }
  return out;
}

export type Anomalia = {
  categoria: string;
  nProdutos: number;
  indiceMedio: number;
  unidadesVendidas: number;
};

/**
 * Bloco de produtos cujo snapshot competitivo nao e crivel: os 4 concorrentes
 * cotam EXATAMENTE o mesmo valor e o indice passa de LIMIAR_ANOMALIA.
 * Formula: produtos com cotacaoUniforme = true e indice >= 1,5, agrupados por categoria.
 * Fonte: preco_competidores.preco_concorrente, produtos.preco_atual, vendas.quantidade.
 * Serve para NAO ler esses produtos como "estamos 100% acima do mercado".
 */
export function anomaliasCompetitivas(dataset: Dataset): Anomalia[] {
  const anomalos = indicePorProduto(dataset).filter((l) => l.anomalo);
  return [...agrupar(anomalos, (l) => l.categoria)]
    .map(([categoria, itens]) => ({
      categoria,
      nProdutos: itens.length,
      indiceMedio: itens.reduce((s, i) => s + i.indice, 0) / itens.length,
      unidadesVendidas: itens.reduce((s, i) => s + i.unidades, 0),
    }))
    .sort((a, b) => b.nProdutos - a.nProdutos);
}

/**
 * Data do snapshot competitivo, em YYYY-MM-DD, para rotular a interface.
 * Devolve so a parte de data: a hora do timestamp e irrelevante e, convertida
 * para o fuso local, faria a coleta aparecer no dia anterior.
 * Formula: menor data_coleta presente na tabela (a coleta ocorreu em um unico dia).
 * Fonte: preco_competidores.data_coleta.
 */
export function dataSnapshotCompetidores(dataset: Dataset): string | null {
  if (dataset.competidores.length === 0) return null;
  const menor = dataset.competidores
    .map((c) => c.data_coleta)
    .reduce((a, b) => (a < b ? a : b));
  return menor.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Posicionamento competitivo (polaridade -> paleta divergente)
// ---------------------------------------------------------------------------

export type PosicionamentoCategoria = {
  categoria: string;
  nProdutos: number;
  acima: number;
  faixa: number;
  abaixo: number;
  /** Mediana do indice da categoria. */
  indiceMediano: number;
  /** A categoria e majoritariamente composta por produtos com snapshot suspeito. */
  contemAnomalia: boolean;
};

const medianaDe = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const meio = (s.length - 1) / 2;
  return s.length % 2 === 1 ? s[meio] : (s[Math.floor(meio)] + s[Math.ceil(meio)]) / 2;
};

/**
 * Posicionamento competitivo por categoria: quantos produtos estao acima,
 * dentro e abaixo da faixa de paridade de +-5%.
 * Formula: contagem de produtos por classificar(indice); indiceMediano = mediana dos indices.
 * Fonte: produtos.preco_atual vs. mediana de preco_competidores.preco_concorrente.
 */
export function posicionamentoPorCategoria(dataset: Dataset): PosicionamentoCategoria[] {
  const linhas = indicePorProduto(dataset);
  return [...agrupar(linhas, (l) => l.categoria)]
    .map(([categoria, itens]) => ({
      categoria,
      nProdutos: itens.length,
      acima: itens.filter((i) => i.posicao === 'acima').length,
      faixa: itens.filter((i) => i.posicao === 'faixa').length,
      abaixo: itens.filter((i) => i.posicao === 'abaixo').length,
      indiceMediano: medianaDe(itens.map((i) => i.indice)),
      contemAnomalia: itens.some((i) => i.anomalo),
    }))
    .sort((a, b) => b.indiceMediano - a.indiceMediano);
}

export type PosicionamentoGeral = {
  total: number;
  acima: number;
  faixa: number;
  abaixo: number;
  indiceMediano: number;
  produtosAnomalos: number;
  /** Produtos do catalogo sem nenhuma cotacao de concorrente. */
  semCobertura: number;
};

/**
 * Retrato competitivo do catalogo inteiro.
 * Formula: contagem de produtos por classificar(indice) sobre todo o catalogo coberto.
 * Fonte: produtos (215 linhas) x preco_competidores (snapshot de 2026-01-11).
 */
export function posicionamentoGeral(dataset: Dataset): PosicionamentoGeral {
  const linhas = indicePorProduto(dataset);
  return {
    total: linhas.length,
    acima: linhas.filter((l) => l.posicao === 'acima').length,
    faixa: linhas.filter((l) => l.posicao === 'faixa').length,
    abaixo: linhas.filter((l) => l.posicao === 'abaixo').length,
    indiceMediano: medianaDe(linhas.map((l) => l.indice)),
    produtosAnomalos: linhas.filter((l) => l.anomalo).length,
    semCobertura: dataset.produtos.length - linhas.length,
  };
}

// ---------------------------------------------------------------------------
// Erosao de desconto e realizacao de preco
// ---------------------------------------------------------------------------

export type MetricasErosao = {
  linhas: number;
  unidades: number;
  receitaPraticada: number;
  receitaTabela: number;
  /** receitaTabela - receitaPraticada. Positivo = dinheiro deixado na mesa. */
  erosao: number;
  /** receitaPraticada / receitaTabela. 1,00 = sem desconto liquido. */
  realizacao: number;
  /** Fracao das linhas que sairam abaixo da tabela. */
  pctLinhasComDesconto: number;
  /** Desconto medio NAS linhas descontadas (0 se nao houver). */
  descontoMedioQuandoHa: number;
};

const semPreco = (v: VendaEnriquecida) => !v.produto.preco_atual || v.produto.preco_atual <= 0;

/**
 * Bloco de metricas de erosao de desconto de um conjunto de vendas enriquecidas.
 * Formula: erosao = SOMA(quantidade * (preco_atual - preco_unitario));
 *          realizacao = SOMA(quantidade*preco_unitario) / SOMA(quantidade*preco_atual);
 *          desconto da linha = 1 - preco_unitario / preco_atual.
 * Fonte: vendas.quantidade, vendas.preco_unitario, produtos.preco_atual.
 *        Linhas cujo produto nao tem preco de tabela ficam de fora.
 */
export function metricasErosao(vendas: VendaEnriquecida[]): MetricasErosao {
  const uteis = vendas.filter((v) => !semPreco(v));
  let receitaPraticada = 0;
  let receitaTabela = 0;
  let unidades = 0;
  let comDesconto = 0;
  let somaDesconto = 0;
  for (const v of uteis) {
    const tabela = v.produto.preco_atual as number;
    receitaPraticada += receitaLinha(v);
    receitaTabela += v.quantidade * tabela;
    unidades += v.quantidade;
    const desconto = 1 - v.preco_unitario / tabela;
    if (desconto > TOLERANCIA_DESCONTO) {
      comDesconto += 1;
      somaDesconto += desconto;
    }
  }
  return {
    linhas: uteis.length,
    unidades,
    receitaPraticada,
    receitaTabela,
    erosao: receitaTabela - receitaPraticada,
    realizacao: receitaTabela === 0 ? 0 : receitaPraticada / receitaTabela,
    pctLinhasComDesconto: uteis.length === 0 ? 0 : comDesconto / uteis.length,
    descontoMedioQuandoHa: comDesconto === 0 ? 0 : somaDesconto / comDesconto,
  };
}

export type ErosaoPorChave = MetricasErosao & { nome: string };

function erosaoPorChave(
  vendas: VendaEnriquecida[],
  chave: (v: VendaEnriquecida) => string,
): ErosaoPorChave[] {
  return [...agrupar(vendas.filter((v) => !semPreco(v)), chave)]
    .map(([nome, itens]) => ({ nome, ...metricasErosao(itens) }))
    .sort((a, b) => b.erosao - a.erosao);
}

/**
 * Erosao de desconto por categoria: quem esta dando desconto e quanto custa.
 * Formula: metricasErosao() aplicada por produtos.categoria.
 * Fonte: vendas x produtos. Vendas orfas excluidas (corte por produto).
 */
export function erosaoPorCategoria(dataset: Dataset): ErosaoPorChave[] {
  return erosaoPorChave(
    enriquecer(dataset.vendas, dataset.produtos),
    (v) => v.produto.categoria ?? 'Sem categoria',
  );
}

/**
 * Erosao de desconto por canal de venda.
 * Formula: metricasErosao() aplicada por vendas.canal_venda.
 * Fonte: vendas x produtos. Vendas orfas excluidas (precisam do preco de tabela).
 */
export function erosaoPorCanal(dataset: Dataset): ErosaoPorChave[] {
  return erosaoPorChave(
    enriquecer(dataset.vendas, dataset.produtos),
    (v) => (v.canal_venda === 'ecommerce' ? 'E-commerce' : 'Loja fisica'),
  );
}

/**
 * Realizacao de preco por marca (preco praticado / preco de tabela, ponderado por volume).
 * Formula: metricasErosao() aplicada por produtos.marca.
 * Fonte: vendas.preco_unitario, vendas.quantidade, produtos.preco_atual, produtos.marca.
 */
export function realizacaoPorMarca(dataset: Dataset): ErosaoPorChave[] {
  return erosaoPorChave(
    enriquecer(dataset.vendas, dataset.produtos),
    (v) => v.produto.marca ?? 'Sem marca',
  );
}

/**
 * Divide vendas ja filtradas nas duas metades DA JANELA DO PROJETO.
 *
 * Por que nao chamar dividirPeriodos() direto no subconjunto: janela() tira o
 * corte do min/max do que recebe. Como esta seção descarta as orfas e as linhas
 * sem preco de tabela, o corte sairia da mediana temporal de OUTRO conjunto e os
 * deltas de Pricing deixariam de conversar com os de Vendas e Clientes. O corte
 * vem sempre de dataset.vendas inteiro — mesma decisao de vendas.ts.
 * Formula: corte = min(data_venda) + (max(data_venda) - min(data_venda)) / 2
 *          sobre TODAS as vendas; recente = data_venda >= corte.
 * Fonte: vendas.data_venda (base inteira, orfas incluidas no calculo do corte).
 */
function metadesDoProjeto(dataset: Dataset, vendas: VendaEnriquecida[]) {
  const { corte } = janela(dataset.vendas);
  const recente: VendaEnriquecida[] = [];
  const anterior: VendaEnriquecida[] = [];
  for (const v of vendas) {
    (new Date(v.data_venda) >= corte ? recente : anterior).push(v);
  }
  return { recente, anterior, corte };
}

// ---------------------------------------------------------------------------
// Elasticidade aparente: desconto compra volume?
// ---------------------------------------------------------------------------

export type FaixaDesconto = {
  faixa: string;
  ordem: number;
  linhas: number;
  unidades: number;
  /** Unidades por linha de venda. E este numero que responde a pergunta. */
  unidadesPorPedido: number;
  receita: number;
  erosao: number;
};

/**
 * Faixas de desconto, com limite superior INCLUSIVO.
 *
 * Por que inclusivo, e nao o corte `d < limite` que parece natural: nesta base
 * o desconto nao e continuo, vem em tres degraus exatos (5%, 10% e 15%, que
 * juntos sao 958 das 1.159 linhas descontadas). Com corte exclusivo, TODO o
 * volume cai exatamente em cima da fronteira, e de que lado ele cai passa a
 * depender da representacao binaria: `1 - 90/100` da 0.09999999999999998 em
 * IEEE-754, entao um desconto de 10% escorregaria para a faixa "5-10%" no
 * JavaScript e ficaria em "10-15%" no SQL. O grafico viraria sorteio.
 * Com limite superior inclusivo + TOLERANCIA_DESCONTO de folga, cada degrau
 * cai inteiro na faixa que o nomeia e o resultado para de depender de float.
 */
const FAIXAS: { rotulo: string; limite: number }[] = [
  { rotulo: 'Sem desconto', limite: TOLERANCIA_DESCONTO },
  { rotulo: 'Até 5%', limite: 0.05 },
  { rotulo: '5–10%', limite: 0.1 },
  { rotulo: '10–15%', limite: 0.15 },
  { rotulo: 'Acima de 15%', limite: Infinity },
];

/**
 * Elasticidade APARENTE: unidades por pedido em cada faixa de desconto.
 * Nao e elasticidade-preco econometrica — e a leitura descritiva de se o
 * desconto vem acompanhado de mais volume por pedido dentro da janela de 30 dias.
 * Formula: desconto da linha = 1 - preco_unitario/preco_atual; a linha entra na
 *          primeira faixa cujo limite superior ela nao ultrapassa
 *          (d <= limite + TOLERANCIA_DESCONTO, inclusivo — ver FAIXAS);
 *          unidadesPorPedido = SOMA(quantidade)/nº de linhas da faixa.
 * Fonte: vendas.preco_unitario, vendas.quantidade, produtos.preco_atual.
 */
export function elasticidadePorFaixa(dataset: Dataset): FaixaDesconto[] {
  const vendas = enriquecer(dataset.vendas, dataset.produtos).filter((v) => !semPreco(v));
  const baldes = FAIXAS.map(() => [] as VendaEnriquecida[]);
  for (const v of vendas) {
    const tabela = v.produto.preco_atual as number;
    const d = 1 - v.preco_unitario / tabela;
    const i = FAIXAS.findIndex((f) => d <= f.limite + TOLERANCIA_DESCONTO);
    baldes[i === -1 ? FAIXAS.length - 1 : i].push(v);
  }
  return FAIXAS.map((f, i) => {
    const itens = baldes[i];
    const m = metricasErosao(itens);
    return {
      faixa: f.rotulo,
      ordem: i,
      linhas: m.linhas,
      unidades: m.unidades,
      unidadesPorPedido: m.linhas === 0 ? 0 : m.unidades / m.linhas,
      receita: m.receitaPraticada,
      erosao: m.erosao,
    };
  });
}

export type DegrauDesconto = {
  /** Desconto do degrau, arredondado a 0,1 pp (ex.: 0,10 = 10%). */
  desconto: number;
  linhas: number;
  erosao: number;
};

/**
 * Degraus de desconto: os valores exatos em que o desconto se concentra.
 *
 * Existe porque nesta base o desconto NAO e contínuo — ele se empilha em poucos
 * valores redondos, o que e assinatura de politica comercial (botao de desconto
 * predefinido) e nao de negociacao caso a caso. E o que torna acionavel a
 * recomendacao de teto: nao e "descontar menos", e "desligar um degrau".
 * Formula: desconto da linha = 1 - preco_unitario/preco_atual, arredondado a
 *          0,1 pp para absorver o arredondamento de centavos; agrupado por esse
 *          valor e ordenado por nº de linhas.
 * Fonte: vendas.preco_unitario, vendas.quantidade, produtos.preco_atual.
 */
export function degrausDeDesconto(dataset: Dataset, minLinhas = 50): DegrauDesconto[] {
  const vendas = enriquecer(dataset.vendas, dataset.produtos).filter((v) => !semPreco(v));
  const descontadas = vendas.filter(
    (v) => 1 - v.preco_unitario / (v.produto.preco_atual as number) > TOLERANCIA_DESCONTO,
  );
  const chave = (v: VendaEnriquecida) =>
    (Math.round((1 - v.preco_unitario / (v.produto.preco_atual as number)) * 1000) / 1000).toFixed(3);

  return [...agrupar(descontadas, chave)]
    .map(([k, itens]) => ({
      desconto: Number(k),
      linhas: itens.length,
      erosao: metricasErosao(itens).erosao,
    }))
    .filter((d) => d.linhas >= minLinhas)
    .sort((a, b) => b.linhas - a.linhas);
}

export type PontoDispersao = {
  nome: string;
  /** Desconto medio do produto no periodo, em fracao (0,12 = 12%). */
  desconto: number;
  /** Unidades vendidas no periodo. */
  unidades: number;
  receita: number;
};

export type SerieDispersao = { nome: string; pontos: PontoDispersao[] };

/**
 * Dispersao desconto medio x volume, por produto — a checagem visual da
 * elasticidade aparente. Scatter tem teto de 3 series (ALL_PAIRS_SERIES_CAP):
 * as (n-1) maiores categorias por receita viram serie propria, o resto vira "Outros".
 * Formula: por produto, desconto = 1 - SOMA(qtd*preco_unitario)/SOMA(qtd*preco_atual);
 *          unidades = SOMA(quantidade).
 * Fonte: vendas x produtos. Produtos sem venda no periodo ficam de fora.
 */
export function dispersaoDescontoVolume(
  dataset: Dataset,
  maxSeries = ALL_PAIRS_SERIES_CAP,
): SerieDispersao[] {
  const vendas = enriquecer(dataset.vendas, dataset.produtos).filter((v) => !semPreco(v));
  const porProduto = agrupar(vendas, (v) => v.id_produto);

  const pontos: (PontoDispersao & { categoria: string })[] = [];
  for (const [, itens] of porProduto) {
    const m = metricasErosao(itens);
    if (m.unidades === 0 || m.receitaTabela === 0) continue;
    const p = itens[0].produto as Produto;
    pontos.push({
      nome: p.nome_produto,
      categoria: p.categoria ?? 'Sem categoria',
      desconto: 1 - m.receitaPraticada / m.receitaTabela,
      unidades: m.unidades,
      receita: m.receitaPraticada,
    });
  }

  const ranking = [...agrupar(pontos, (p) => p.categoria)]
    .map(([nome, itens]) => ({ nome, receita: itens.reduce((s, i) => s + i.receita, 0) }))
    .sort((a, b) => b.receita - a.receita);
  const destacadas = new Set(ranking.slice(0, Math.max(0, maxSeries - 1)).map((r) => r.nome));

  const series: SerieDispersao[] = ranking
    .filter((r) => destacadas.has(r.nome))
    .map((r) => ({ nome: r.nome, pontos: pontos.filter((p) => p.categoria === r.nome) }));
  const resto = pontos.filter((p) => !destacadas.has(p.categoria));
  if (resto.length > 0) series.push({ nome: 'Outras categorias', pontos: resto });
  return series;
}

// ---------------------------------------------------------------------------
// Oportunidades: onde ha dinheiro na mesa
// ---------------------------------------------------------------------------

export type Oportunidade = LinhaIndiceProduto & {
  /**
   * Valor anexado a recomendacao, em R$ na janela de 30 dias.
   *  - 'subir': erosao de desconto do produto (o que ja se perde descontando um item caro).
   *  - 'reprecificar': (mediana de mercado - preco de tabela) * unidades vendidas.
   */
  valor: number;
};

export type Oportunidades = {
  /** Caros vs. mercado e com giro abaixo da mediana: o preco esta travando a venda. */
  carosSemGiro: Oportunidade[];
  /** Baratos vs. mercado e com giro alto: subir ate a paridade e receita direta. */
  baratosComGiro: Oportunidade[];
  /** Soma do potencial de reprecificacao dos baratosComGiro, em 30 dias. */
  potencialBaratosComGiro: number;
};

/**
 * Produtos com maior oportunidade de pricing, nas duas pontas.
 * Formula: giroMediano = mediana das unidades vendidas por produto coberto;
 *          carosSemGiro   = indice > 1+FAIXA_PARIDADE e unidades <= giroMediano;
 *          baratosComGiro = indice < 1-FAIXA_PARIDADE e unidades >  giroMediano,
 *                           valor = (mediana_mercado - preco_atual) * unidades.
 * Fonte: produtos.preco_atual, preco_competidores, vendas.quantidade.
 * Produtos com snapshot competitivo anomalo sao EXCLUIDOS (ver anomaliasCompetitivas).
 */
export function oportunidades(dataset: Dataset, limite = 6): Oportunidades {
  const linhas = indicePorProduto(dataset).filter((l) => !l.anomalo);
  const giroMediano = medianaDe(linhas.map((l) => l.unidades));
  const erosaoProduto = new Map(
    erosaoPorChave(
      enriquecer(dataset.vendas, dataset.produtos),
      (v) => v.id_produto,
    ).map((e) => [e.nome, e.erosao]),
  );

  const carosSemGiro = linhas
    .filter((l) => l.posicao === 'acima' && l.unidades <= giroMediano)
    .map((l) => ({ ...l, valor: erosaoProduto.get(l.idProduto) ?? 0 }))
    .sort((a, b) => b.indice - a.indice)
    .slice(0, limite);

  const baratosComGiroTodos = linhas
    .filter((l) => l.posicao === 'abaixo' && l.unidades > giroMediano)
    .map((l) => ({ ...l, valor: (l.medianaMercado - l.precoTabela) * l.unidades }))
    .sort((a, b) => b.valor - a.valor);

  return {
    carosSemGiro,
    baratosComGiro: baratosComGiroTodos.slice(0, limite),
    potencialBaratosComGiro: baratosComGiroTodos.reduce((s, o) => s + o.valor, 0),
  };
}

// ---------------------------------------------------------------------------
// Abertura: os tiles com o delta de 15 dias
// ---------------------------------------------------------------------------

export type ResumoPricing = {
  /** Metricas de erosao da janela inteira (30 dias). */
  total: MetricasErosao;
  deltaRealizacao: number;
  deltaErosao: number;
  deltaPctComDesconto: number;
  /** Indice mediano do catalogo vs. mediana dos concorrentes. */
  indiceMedianoMercado: number;
  /** Linhas vendidas ACIMA do preco de tabela e o valor correspondente. */
  linhasAcimaTabela: number;
  valorAcimaTabela: number;
};

/**
 * Painel de abertura de Pricing, com o delta de 15 dias vs. 15 dias anteriores.
 * Formula: metricasErosao() na janela inteira e em cada metade (metadesDoProjeto);
 *          delta = variacao(recente, anterior).
 * Fonte: vendas x produtos, preco_competidores. Nao existe YoY na base
 *        (2025-12-13 a 2026-01-11) — a unica comparacao valida e 15d vs 15d.
 */
export function resumoPricing(dataset: Dataset): ResumoPricing {
  const vendas = enriquecer(dataset.vendas, dataset.produtos).filter((v) => !semPreco(v));
  const { recente, anterior } = metadesDoProjeto(dataset, vendas);
  const total = metricasErosao(vendas);
  const r = metricasErosao(recente);
  const a = metricasErosao(anterior);

  let linhasAcimaTabela = 0;
  let valorAcimaTabela = 0;
  for (const v of vendas) {
    const tabela = v.produto.preco_atual as number;
    if (v.preco_unitario > tabela * (1 + TOLERANCIA_DESCONTO)) {
      linhasAcimaTabela += 1;
      valorAcimaTabela += v.quantidade * (v.preco_unitario - tabela);
    }
  }

  return {
    total,
    deltaRealizacao: variacao(r.realizacao, a.realizacao),
    deltaErosao: variacao(r.erosao, a.erosao),
    deltaPctComDesconto: variacao(r.pctLinhasComDesconto, a.pctLinhasComDesconto),
    indiceMedianoMercado: posicionamentoGeral(dataset).indiceMediano,
    linhasAcimaTabela,
    valorAcimaTabela,
  };
}

// ---------------------------------------------------------------------------
// Convergencia de preco medio entre canais: mix de produto ou desconto?
// ---------------------------------------------------------------------------

export type DecomposicaoCanal = {
  canal: string;
  linhasAnterior: number;
  linhasRecente: number;
  /** Media simples de vendas.preco_unitario em cada metade. */
  precoMedioAnterior: number;
  precoMedioRecente: number;
  /** Media simples de produtos.preco_atual dos itens vendidos — o "mix" do periodo. */
  tabelaMediaAnterior: number;
  tabelaMediaRecente: number;
  /** Razao das medias: preco praticado medio / preco de tabela medio. */
  razaoAnterior: number;
  razaoRecente: number;
  /** precoMedioRecente - precoMedioAnterior. */
  delta: number;
  /** Parcela do delta atribuivel a MUDANCA DE MIX (outros produtos sendo vendidos). */
  efeitoMix: number;
  /** Parcela do delta atribuivel a MUDANCA DE DESCONTO (mesmo mix, outro preco). */
  efeitoDesconto: number;
  /** Realizacao ponderada por receita em cada metade (a metrica do resto da seção). */
  realizacaoAnterior: number;
  realizacaoRecente: number;
  /**
   * Realizacao como MEDIA SIMPLES por linha de venda (nao ponderada).
   * Existe para reconciliar com paineis que usam a media por linha: quando as
   * duas divergem, o desconto mudou de alvo — passou a cair em itens de valor
   * diferente. A ponderada e a que amarra na erosao em R$.
   */
  realizacaoSimplesAnterior: number;
  realizacaoSimplesRecente: number;
  /** Preco de tabela medio das linhas QUE SAIRAM COM DESCONTO, em cada metade. */
  tabelaMediaDescontadasAnterior: number;
  tabelaMediaDescontadasRecente: number;
};

/**
 * Decompoe a variacao do preco medio praticado de cada canal, 15d vs 15d, em
 * MIX DE PRODUTO vs POLITICA DE DESCONTO. Responde a pergunta "os canais
 * convergiram porque o online passou a descontar mais?".
 *
 * Formula: identidade exata, sem residuo. Com P = media(preco_unitario),
 * T = media(preco_atual) e R = P/T em cada metade:
 *   P1 - P0 = R0*(T1 - T0)  +  T1*(R1 - R0)
 *             \__ mix __/      \_ desconto _/
 * O efeito mix e avaliado a razao antiga; o de desconto, sobre o mix novo.
 * A soma das duas parcelas reproduz o delta observado exatamente.
 *
 * Fonte: vendas.preco_unitario, vendas.canal_venda, produtos.preco_atual.
 *        Metades via metadesDoProjeto(); orfas excluidas (precisam do preco de tabela).
 * Nota: a decomposicao usa MEDIA SIMPLES por linha de venda, nao ponderada —
 * e o preco medio unitario, a mesma base que a seção de Clientes usa.
 * Devolve a realizacao nas DUAS leituras (ponderada por receita e media simples
 * por linha) porque elas divergem quando o desconto muda de alvo, e essa
 * divergencia e informacao, nao erro de conta.
 */
export function decomposicaoPrecoPorCanal(dataset: Dataset): DecomposicaoCanal[] {
  const vendas = enriquecer(dataset.vendas, dataset.produtos).filter((v) => !semPreco(v));
  const { recente, anterior } = metadesDoProjeto(dataset, vendas);

  const medias = (itens: VendaEnriquecida[]) => {
    if (itens.length === 0) {
      return { preco: 0, tabela: 0, razao: 0, realizacaoSimples: 0, tabelaDescontadas: 0 };
    }
    const preco = itens.reduce((s, v) => s + v.preco_unitario, 0) / itens.length;
    const tabela = itens.reduce((s, v) => s + (v.produto.preco_atual as number), 0) / itens.length;
    const realizacaoSimples =
      itens.reduce((s, v) => s + v.preco_unitario / (v.produto.preco_atual as number), 0) / itens.length;
    const descontadas = itens.filter(
      (v) => 1 - v.preco_unitario / (v.produto.preco_atual as number) > TOLERANCIA_DESCONTO,
    );
    const tabelaDescontadas =
      descontadas.length === 0
        ? 0
        : descontadas.reduce((s, v) => s + (v.produto.preco_atual as number), 0) / descontadas.length;
    return { preco, tabela, razao: tabela === 0 ? 0 : preco / tabela, realizacaoSimples, tabelaDescontadas };
  };

  const porCanal = (itens: VendaEnriquecida[], canal: string) =>
    itens.filter((v) => v.canal_venda === canal);

  const canais: { canal: string; chave: 'ecommerce' | 'loja_fisica' }[] = [
    { canal: 'E-commerce', chave: 'ecommerce' },
    { canal: 'Loja fisica', chave: 'loja_fisica' },
  ];

  return canais.map(({ canal, chave }) => {
    const ant = porCanal(anterior, chave);
    const rec = porCanal(recente, chave);
    const a = medias(ant);
    const r = medias(rec);
    return {
      canal,
      linhasAnterior: ant.length,
      linhasRecente: rec.length,
      precoMedioAnterior: a.preco,
      precoMedioRecente: r.preco,
      tabelaMediaAnterior: a.tabela,
      tabelaMediaRecente: r.tabela,
      razaoAnterior: a.razao,
      razaoRecente: r.razao,
      delta: r.preco - a.preco,
      efeitoMix: a.razao * (r.tabela - a.tabela),
      efeitoDesconto: r.tabela * (r.razao - a.razao),
      realizacaoAnterior: metricasErosao(ant).realizacao,
      realizacaoRecente: metricasErosao(rec).realizacao,
      realizacaoSimplesAnterior: a.realizacaoSimples,
      realizacaoSimplesRecente: r.realizacaoSimples,
      tabelaMediaDescontadasAnterior: a.tabelaDescontadas,
      tabelaMediaDescontadasRecente: r.tabelaDescontadas,
    };
  });
}
