/**
 * KPIs da seção VENDAS & RECEITA. Dono: T2.
 *
 * Todas as funções aqui sao PURAS sobre `Dataset`: sem React, sem fetch, sem
 * `Date.now()`. A janela temporal sai sempre dos proprios dados (`janela` /
 * `dividirPeriodos` de `regras.ts`), nunca do relogio da maquina — assim o
 * numero renderizado hoje e o mesmo que o teste do QA espera amanha.
 *
 * Duas regras do contrato atravessam este arquivo inteiro:
 *  - Receita e SEMPRE `receitaLinha` (quantidade * preco_unitario).
 *  - Vendas orfas contam nos TOTAIS e saem dos cortes por produto/categoria/
 *    marca. Funcoes que usam `enriquecer()` estao cortando — o painel que as
 *    consome exibe `notaRodapeOrfas(dataset)`.
 */
import type { Dataset, Venda, VendaEnriquecida } from '@/lib/data/types';
import {
  receitaLinha,
  receitaTotal,
  enriquecer,
  orfas,
  janela,
  dividirPeriodos,
  variacao,
  agrupar,
  topNComOutros,
} from '@/lib/data/regras';

/** Metrica com o valor do periodo recente, o do anterior e a variacao relativa. */
export type MetricaComDelta = {
  valor: number;
  recente: number;
  anterior: number;
  delta: number;
};

export const CANAIS = ['ecommerce', 'loja_fisica'] as const;
export type Canal = (typeof CANAIS)[number];

/** Rotulo de exibicao do canal. O id (`canal_venda`) e que fixa a cor da serie. */
export const rotuloCanal = (c: string) => (c === 'ecommerce' ? 'E-commerce' : 'Loja física');

/**
 * Indice FIXO de cor por canal — cor segue a ENTIDADE, nunca o ranking (§3 do
 * contrato). Se a loja fisica ultrapassar o ecommerce, as cores nao trocam.
 */
export const INDICE_COR_CANAL: Record<string, number> = { ecommerce: 0, loja_fisica: 1 };

/* -------------------------------------------------------------------------- */
/* 1. Abertura — os quatro numeros do estado do negocio                       */
/* -------------------------------------------------------------------------- */

/**
 * Receita total e variacao 15d.
 * Formula: SOMA(quantidade * preco_unitario); delta = (recente - anterior) / anterior,
 *          com os periodos cortados no meio da janela observada.
 * Fonte: vendas.quantidade, vendas.preco_unitario, vendas.data_venda.
 * Orfas: INCLUIDAS (o dinheiro entrou, independentemente do catalogo).
 */
export function receitaComDelta(dataset: Dataset): MetricaComDelta {
  const { recente, anterior } = dividirPeriodos(dataset.vendas);
  const r = receitaTotal(recente);
  const a = receitaTotal(anterior);
  return { valor: receitaTotal(dataset.vendas), recente: r, anterior: a, delta: variacao(r, a) };
}

/**
 * Numero de pedidos e variacao 15d.
 * Formula: CONTAGEM DISTINTA de vendas.id_venda; delta = (recente - anterior) / anterior.
 * Fonte: vendas.id_venda, vendas.data_venda.
 * Orfas: INCLUIDAS.
 */
export function pedidosComDelta(dataset: Dataset): MetricaComDelta {
  const contar = (vs: Venda[]) => new Set(vs.map((v) => v.id_venda)).size;
  const { recente, anterior } = dividirPeriodos(dataset.vendas);
  const r = contar(recente);
  const a = contar(anterior);
  return { valor: contar(dataset.vendas), recente: r, anterior: a, delta: variacao(r, a) };
}

/**
 * Ticket medio e variacao 15d.
 * Formula: receita_total / nº de pedidos distintos.
 * Fonte: vendas.quantidade * vendas.preco_unitario, vendas.id_venda.
 * Orfas: INCLUIDAS (numerador e denominador).
 */
export function ticketMedioComDelta(dataset: Dataset): MetricaComDelta {
  const ticket = (vs: Venda[]) => {
    const n = new Set(vs.map((v) => v.id_venda)).size;
    return n === 0 ? 0 : receitaTotal(vs) / n;
  };
  const { recente, anterior } = dividirPeriodos(dataset.vendas);
  const r = ticket(recente);
  const a = ticket(anterior);
  return { valor: ticket(dataset.vendas), recente: r, anterior: a, delta: variacao(r, a) };
}

/**
 * Unidades vendidas e variacao 15d.
 * Formula: SOMA(vendas.quantidade).
 * Fonte: vendas.quantidade, vendas.data_venda.
 * Orfas: INCLUIDAS.
 */
export function unidadesComDelta(dataset: Dataset): MetricaComDelta {
  const somar = (vs: Venda[]) => vs.reduce((s, v) => s + v.quantidade, 0);
  const { recente, anterior } = dividirPeriodos(dataset.vendas);
  const r = somar(recente);
  const a = somar(anterior);
  return { valor: somar(dataset.vendas), recente: r, anterior: a, delta: variacao(r, a) };
}

/**
 * Data do corte entre os dois periodos de 15 dias, em ISO (yyyy-mm-dd).
 * Formula: inicio + (fim - inicio) / 2 sobre vendas.data_venda.
 * Fonte: vendas.data_venda (via `janela`).
 * Serve de rotulo honesto: o painel nao pode dizer "ultimos 15 dias" sem dizer
 * a partir de qual data, porque a janela vem dos dados e nao do calendario.
 * Devolve `null` com a base vazia: `janela()` sinaliza `vazio` e entrega epoch,
 * que formatado viraria "01/01/1970" — uma data que o painel exibiria com a
 * mesma autoridade das reais. Sem dados nao ha corte; quem chama renderiza
 * estado vazio em vez de imprimir data.
 */
export function dataCorte(dataset: Dataset): string | null {
  const { corte, vazio } = janela(dataset.vendas);
  if (vazio) return null;
  return corte.toISOString().slice(0, 10);
}

/**
 * Extremos da janela observada, em ISO.
 * Formula: MIN(data_venda), MAX(data_venda).
 * Fonte: vendas.data_venda (via `janela`).
 * `null` com a base vazia, pelo mesmo motivo de `dataCorte`.
 */
export function periodoObservado(dataset: Dataset): { inicio: string; fim: string } | null {
  const { inicio, fim, vazio } = janela(dataset.vendas);
  if (vazio) return null;
  return { inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
}

/* -------------------------------------------------------------------------- */
/* 2. Tensao — a serie temporal                                               */
/* -------------------------------------------------------------------------- */

export type PontoDia = { dia: string; ecommerce: number; loja_fisica: number; total: number };

/**
 * Receita por dia, quebrada por canal.
 * Formula: para cada data_venda::date, SOMA(quantidade * preco_unitario) por canal_venda.
 * Fonte: vendas.data_venda, vendas.canal_venda, vendas.quantidade, vendas.preco_unitario.
 * Orfas: INCLUIDAS no `total` e no canal — o corte aqui e temporal, nao de produto.
 * Duas series na MESMA unidade (R$) — um unico eixo, jamais eixo duplo.
 */
export function receitaPorDia(dataset: Dataset): PontoDia[] {
  const porDia = agrupar(dataset.vendas, (v) => v.data_venda.slice(0, 10));
  return [...porDia.entries()]
    .map(([dia, vs]) => ({
      dia,
      ecommerce: receitaTotal(vs.filter((v) => v.canal_venda === 'ecommerce')),
      loja_fisica: receitaTotal(vs.filter((v) => v.canal_venda === 'loja_fisica')),
      total: receitaTotal(vs),
    }))
    .sort((a, b) => a.dia.localeCompare(b.dia));
}

/**
 * Receita media por dia da janela.
 * Formula: receita_total / nº de dias distintos com venda.
 * Fonte: vendas.data_venda, vendas.quantidade * vendas.preco_unitario.
 */
export function receitaMediaDiaria(dataset: Dataset): number {
  const dias = new Set(dataset.vendas.map((v) => v.data_venda.slice(0, 10))).size;
  return dias === 0 ? 0 : receitaTotal(dataset.vendas) / dias;
}

/* -------------------------------------------------------------------------- */
/* 3. Explicacao — o corte por canal                                          */
/* -------------------------------------------------------------------------- */

export type DesempenhoCanal = {
  canal: Canal | string;
  rotulo: string;
  indiceCor: number;
  receita: number;
  participacao: number;
  pedidos: number;
  unidades: number;
  ticketMedio: number;
  receitaAnterior: number;
  receitaRecente: number;
  deltaReceita: number;
  ticketAnterior: number;
  ticketRecente: number;
  deltaTicket: number;
  deltaPedidos: number;
};

/**
 * Desempenho completo por canal de venda: mix, ticket e os dois deltas 15d.
 * Formula: por canal_venda — receita = SOMA(quantidade * preco_unitario);
 *          participacao = receita_canal / receita_total;
 *          ticket = receita_canal / pedidos_canal;
 *          delta = (recente - anterior) / anterior em cada medida.
 * Fonte: vendas.canal_venda, vendas.quantidade, vendas.preco_unitario,
 *        vendas.id_venda, vendas.data_venda.
 * Orfas: INCLUIDAS — canal e atributo da propria venda, nao do produto.
 */
export function desempenhoPorCanal(dataset: Dataset): DesempenhoCanal[] {
  const total = receitaTotal(dataset.vendas);
  const { corte } = janela(dataset.vendas);
  const grupos = agrupar(dataset.vendas, (v) => v.canal_venda);

  const ticket = (vs: Venda[]) => {
    const n = new Set(vs.map((v) => v.id_venda)).size;
    return n === 0 ? 0 : receitaTotal(vs) / n;
  };

  return [...grupos.entries()]
    .map(([canal, vs]) => {
      const recente = vs.filter((v) => new Date(v.data_venda) >= corte);
      const anterior = vs.filter((v) => new Date(v.data_venda) < corte);
      const receita = receitaTotal(vs);
      const rRec = receitaTotal(recente);
      const rAnt = receitaTotal(anterior);
      const tRec = ticket(recente);
      const tAnt = ticket(anterior);
      return {
        canal,
        rotulo: rotuloCanal(canal),
        indiceCor: INDICE_COR_CANAL[canal] ?? 2,
        receita,
        participacao: total === 0 ? 0 : receita / total,
        pedidos: new Set(vs.map((v) => v.id_venda)).size,
        unidades: vs.reduce((s, v) => s + v.quantidade, 0),
        ticketMedio: ticket(vs),
        receitaAnterior: rAnt,
        receitaRecente: rRec,
        deltaReceita: variacao(rRec, rAnt),
        ticketAnterior: tAnt,
        ticketRecente: tRec,
        deltaTicket: variacao(tRec, tAnt),
        // Pedidos DISTINTOS nos dois lados, igual ao campo `pedidos` acima. Contar
        // linhas daria o mesmo numero na base de hoje (id_venda e unico nas 3020
        // linhas), mas passaria a contar itens em vez de pedidos no dia em que a
        // base tiver carrinho multi-item.
        deltaPedidos: variacao(
          new Set(recente.map((v) => v.id_venda)).size,
          new Set(anterior.map((v) => v.id_venda)).size,
        ),
      };
    })
    .sort((a, b) => b.receita - a.receita);
}

/* -------------------------------------------------------------------------- */
/* 4. Cortes por produto — a partir daqui as ORFAS SAEM                       */
/* -------------------------------------------------------------------------- */

/**
 * Receita classificavel: o que sobra depois de tirar as vendas orfas.
 * Formula: SOMA(quantidade * preco_unitario) apenas das vendas cujo id_produto
 *          existe em produtos.
 * Fonte: vendas x produtos (via `enriquecer`).
 * Base de TODOS os percentuais de categoria/produto desta seção — usar a receita
 * total aqui inflaria o denominador com valor que nao pode ser atribuido.
 */
export function receitaClassificavel(dataset: Dataset): number {
  return receitaTotal(enriquecer(dataset.vendas, dataset.produtos));
}

/**
 * Peso das orfas sobre a receita total.
 * Formula: receita_orfas / receita_total.
 * Fonte: vendas sem correspondencia em produtos (via `orfas`).
 * Serve para o painel afirmar que o corte por produto e representativo.
 */
export function pesoOrfas(dataset: Dataset): { linhas: number; receita: number; fracao: number } {
  const o = orfas(dataset.vendas, dataset.produtos);
  const total = receitaTotal(dataset.vendas);
  const receita = receitaTotal(o);
  return { linhas: o.length, receita, fracao: total === 0 ? 0 : receita / total };
}

export type FatiaCategoria = {
  nome: string;
  receita: number;
  participacao: number;
  pedidos: number;
  anterior: number;
  recente: number;
  deltaAbsoluto: number;
  delta: number;
};

/**
 * Receita por categoria de produto, com o delta 15d de cada uma.
 * Formula: por produtos.categoria — SOMA(quantidade * preco_unitario);
 *          participacao sobre a receita CLASSIFICAVEL;
 *          deltaAbsoluto = receita_recente - receita_anterior (em R$).
 * Fonte: vendas x produtos.categoria (via `enriquecer`), vendas.data_venda.
 * Orfas: EXCLUIDAS — sem produto nao ha categoria. Exiba `notaRodapeOrfas()`.
 * `limite` aplica `topNComOutros` para nunca passar de 8 matizes na paleta.
 */
export function receitaPorCategoria(dataset: Dataset, limite = 8): FatiaCategoria[] {
  const linhas = enriquecer(dataset.vendas, dataset.produtos);
  const base = receitaTotal(linhas);
  const { corte } = janela(dataset.vendas);
  const grupos = agrupar(linhas, (l) => l.produto.categoria ?? 'Sem categoria');

  const topo = topNComOutros(grupos, (itens) => receitaTotal(itens), limite);

  return topo.map(({ nome, valor }) => {
    const itens =
      nome === 'Outros' && !grupos.has('Outros')
        ? linhas.filter((l) => !topo.some((t) => t.nome === (l.produto.categoria ?? 'Sem categoria')))
        : grupos.get(nome) ?? [];
    const recente = receitaTotal(itens.filter((l) => new Date(l.data_venda) >= corte));
    const anterior = receitaTotal(itens.filter((l) => new Date(l.data_venda) < corte));
    return {
      nome,
      receita: valor,
      participacao: base === 0 ? 0 : valor / base,
      pedidos: new Set(itens.map((l) => l.id_venda)).size,
      anterior,
      recente,
      deltaAbsoluto: recente - anterior,
      delta: variacao(recente, anterior),
    };
  });
}

/**
 * Variacao ABSOLUTA de receita por categoria dentro de um canal.
 * Formula: por produtos.categoria, filtrando vendas.canal_venda = `canal` —
 *          receita_recente - receita_anterior, em R$.
 * Fonte: vendas x produtos.categoria, vendas.canal_venda, vendas.data_venda.
 * Orfas: EXCLUIDAS.
 * Responde "de onde saiu o dinheiro que sumiu neste canal": e a atribuicao da
 * queda, nao uma foto do tamanho de cada categoria. Por isso o valor e em reais
 * (divergente em torno de zero) e nao percentual — 300% de uma base minuscula
 * nao move o resultado.
 */
export function deltaCategoriaPorCanal(dataset: Dataset, canal: string): FatiaCategoria[] {
  const doCanal: Dataset = { ...dataset, vendas: dataset.vendas.filter((v) => v.canal_venda === canal) };
  const linhas = enriquecer(doCanal.vendas, dataset.produtos);
  const base = receitaTotal(linhas);
  // O corte vem da janela COMPLETA: os dois canais tem de ser comparados na
  // mesma data de corte, senao o delta de um nao fala com o do outro.
  const { corte } = janela(dataset.vendas);
  const grupos = agrupar(linhas, (l) => l.produto.categoria ?? 'Sem categoria');

  return [...grupos.entries()]
    .map(([nome, itens]) => {
      const recente = receitaTotal(itens.filter((l) => new Date(l.data_venda) >= corte));
      const anterior = receitaTotal(itens.filter((l) => new Date(l.data_venda) < corte));
      const receita = receitaTotal(itens);
      return {
        nome,
        receita,
        participacao: base === 0 ? 0 : receita / base,
        pedidos: new Set(itens.map((l) => l.id_venda)).size,
        anterior,
        recente,
        deltaAbsoluto: recente - anterior,
        delta: variacao(recente, anterior),
      };
    })
    .sort((a, b) => a.deltaAbsoluto - b.deltaAbsoluto);
}

export type LinhaProduto = {
  id_produto: string;
  nome: string;
  categoria: string;
  receita: number;
  participacao: number;
  unidades: number;
  pedidos: number;
  precoMedio: number;
};

/**
 * Top N produtos por receita.
 * Formula: por vendas.id_produto — SOMA(quantidade * preco_unitario), ordenado
 *          desc; participacao sobre a receita CLASSIFICAVEL;
 *          precoMedio = receita_produto / unidades_produto.
 * Fonte: vendas x produtos (via `enriquecer`).
 * Orfas: EXCLUIDAS. Agrupa por id_produto (nao por nome): nomes repetem entre
 * SKUs e somar por nome misturaria produtos distintos.
 */
export function topProdutos(dataset: Dataset, n = 10): LinhaProduto[] {
  const linhas = enriquecer(dataset.vendas, dataset.produtos);
  const base = receitaTotal(linhas);
  const grupos = agrupar(linhas, (l) => l.id_produto);

  return [...grupos.entries()]
    .map(([id, itens]) => {
      const receita = receitaTotal(itens);
      const unidades = itens.reduce((s, l) => s + l.quantidade, 0);
      return {
        id_produto: id,
        nome: itens[0].produto.nome_produto,
        categoria: itens[0].produto.categoria ?? 'Sem categoria',
        receita,
        participacao: base === 0 ? 0 : receita / base,
        unidades,
        pedidos: new Set(itens.map((l) => l.id_venda)).size,
        precoMedio: unidades === 0 ? 0 : receita / unidades,
      };
    })
    .sort((a, b) => b.receita - a.receita)
    .slice(0, n);
}

export type PontoPareto = { rank: number; participacaoAcumulada: number; fracaoCatalogo: number };

/**
 * Curva de Pareto da receita por produto.
 * Formula: produtos ordenados por receita desc; para cada rank k,
 *          participacaoAcumulada = SOMA(receita dos k primeiros) / receita_classificavel
 *          e fracaoCatalogo = k / nº de produtos com venda.
 * Fonte: vendas x produtos (via `enriquecer`).
 * Orfas: EXCLUIDAS.
 * Uma unica medida no eixo Y (% acumulado) — a curva NAO e barra + linha com
 * duas escalas; o contrato proibe eixo duplo.
 */
export function curvaPareto(dataset: Dataset): PontoPareto[] {
  const linhas = enriquecer(dataset.vendas, dataset.produtos);
  const base = receitaTotal(linhas);
  const grupos = agrupar(linhas, (l) => l.id_produto);
  const ordenado = [...grupos.values()].map((itens) => receitaTotal(itens)).sort((a, b) => b - a);

  let acumulado = 0;
  return ordenado.map((r, i) => {
    acumulado += r;
    return {
      rank: i + 1,
      participacaoAcumulada: base === 0 ? 0 : acumulado / base,
      fracaoCatalogo: (i + 1) / ordenado.length,
    };
  });
}

/**
 * Concentracao da receita: quanto os N maiores produtos representam.
 * Formula: SOMA(receita dos N maiores produtos) / receita_classificavel;
 *          fracaoCatalogo = N / nº de produtos com venda.
 * Fonte: vendas x produtos (via `enriquecer`).
 * Orfas: EXCLUIDAS.
 */
export function concentracaoTopN(
  dataset: Dataset,
  n = 10,
): { n: number; participacao: number; produtosComVenda: number; fracaoCatalogo: number } {
  const curva = curvaPareto(dataset);
  const idx = Math.min(n, curva.length) - 1;
  return {
    n: Math.min(n, curva.length),
    participacao: idx < 0 ? 0 : curva[idx].participacaoAcumulada,
    produtosComVenda: curva.length,
    fracaoCatalogo: curva.length === 0 ? 0 : Math.min(n, curva.length) / curva.length,
  };
}

/**
 * Quantos produtos sao necessarios para chegar a `alvo` da receita.
 * Formula: menor k tal que SOMA(receita dos k maiores) / receita_classificavel >= alvo.
 * Fonte: vendas x produtos (via `enriquecer`).
 * Orfas: EXCLUIDAS.
 */
export function produtosPara(dataset: Dataset, alvo = 0.8): number {
  const curva = curvaPareto(dataset);
  const ponto = curva.find((p) => p.participacaoAcumulada >= alvo);
  return ponto ? ponto.rank : curva.length;
}

/* -------------------------------------------------------------------------- */
/* Auxiliar exposto para testes do QA                                          */
/* -------------------------------------------------------------------------- */

/**
 * Receita de um recorte arbitrario de linhas ja enriquecidas.
 * Formula: SOMA(quantidade * preco_unitario).
 * Fonte: vendas.quantidade, vendas.preco_unitario.
 */
export const receitaDe = (linhas: (Venda | VendaEnriquecida)[]) =>
  linhas.reduce((s, l) => s + receitaLinha(l), 0);
