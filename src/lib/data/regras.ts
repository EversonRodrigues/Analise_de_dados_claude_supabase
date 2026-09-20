/**
 * REGRAS DE NEGOCIO COMPARTILHADAS — dono exclusivo: Lider.
 * Toda seção importa daqui. Nenhuma seção redefine receita, periodo ou o
 * tratamento das vendas orfas: se cada painel decidir sozinho, os numeros
 * divergem entre as abas e o dashboard perde credibilidade.
 */
import type { Venda, Produto, VendaEnriquecida, Dataset } from './types';

/** Receita de uma linha de venda. Formula unica do projeto. */
export const receitaLinha = (v: Venda) => v.quantidade * v.preco_unitario;

export const receitaTotal = (vendas: Venda[]) => vendas.reduce((s, v) => s + receitaLinha(v), 0);

/**
 * REGRA DAS ORFAS (decisao da Fase 0):
 * A FK vendas_id_produto_fkey esta NOT VALID no banco e existem 20 vendas
 * apontando para produtos inexistentes.
 *  - Nos TOTAIS de receita elas CONTAM (a venda aconteceu e o dinheiro entrou).
 *  - Em qualquer corte POR PRODUTO / CATEGORIA / MARCA elas SAEM, porque nao ha
 *    atributo para classifica-las.
 * Todo painel que aplicar o corte deve exibir `notaRodapeOrfas()`.
 */
export function enriquecer(vendas: Venda[], produtos: Produto[]): VendaEnriquecida[] {
  const idx = new Map(produtos.map((p) => [p.id_produto, p]));
  const out: VendaEnriquecida[] = [];
  for (const v of vendas) {
    const produto = idx.get(v.id_produto);
    if (produto) out.push({ ...v, produto });
  }
  return out;
}

export function orfas(vendas: Venda[], produtos: Produto[]): Venda[] {
  const ids = new Set(produtos.map((p) => p.id_produto));
  return vendas.filter((v) => !ids.has(v.id_produto));
}

export function notaRodapeOrfas(dataset: Dataset): string {
  const o = orfas(dataset.vendas, dataset.produtos);
  if (o.length === 0) return '';
  const valor = receitaTotal(o).toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
  });
  return `Exclui ${o.length} vendas (${valor}) cujo produto nao existe no catalogo — FK vendas_id_produto_fkey esta NOT VALID no banco. Esses valores seguem contando nos totais de receita.`;
}

/**
 * PERIODO: a base cobre 2025-12-13 a 2026-01-11 (30 dias). Nao existe historico
 * para YoY nem sazonalidade — a comparacao do projeto e sempre
 * ultimos 15 dias vs. 15 dias anteriores dentro da propria janela.
 */
export function janela(vendas: Venda[]) {
  // Sem esta guarda, Math.min de array vazio devolve Infinity e a janela vira
  // tres Invalid Date — qualquer toISOString() adiante derruba a rota inteira.
  //
  // Devolvemos EPOCH, nao `new Date()`: o relogio da maquina tornaria esta
  // funcao nao-deterministica (o §5 do contrato exige pureza aqui) e, pior,
  // faria o painel rotular "periodo observado: <hoje>" como se fosse a janela
  // dos dados — um numero inventado exibido com a mesma autoridade dos reais.
  // Epoch e deterministico e obviamente nao e a janela.
  // Consumidores devem ramificar pela flag `vazio` e renderizar estado vazio.
  if (vendas.length === 0) {
    const epoch = new Date(0);
    return { inicio: epoch, fim: epoch, corte: epoch, vazio: true as const };
  }
  const ts = vendas.map((v) => new Date(v.data_venda).getTime());
  const min = Math.min(...ts);
  const max = Math.max(...ts);
  const meio = min + (max - min) / 2;
  return { inicio: new Date(min), fim: new Date(max), corte: new Date(meio), vazio: false as const };
}

/** Divide as vendas em periodo recente vs. anterior, para todos os deltas do projeto. */
export function dividirPeriodos<T extends Venda>(vendas: T[]) {
  const { corte } = janela(vendas);
  const recente: T[] = [];
  const anterior: T[] = [];
  for (const v of vendas) {
    (new Date(v.data_venda) >= corte ? recente : anterior).push(v);
  }
  return { recente, anterior, corte };
}

/** Variacao relativa segura (evita Infinity quando a base e zero). */
export const variacao = (atual: number, base: number) => (base === 0 ? 0 : (atual - base) / base);

/** Agrupador generico usado por todas as seções. */
export function agrupar<T>(itens: T[], chave: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of itens) {
    const k = chave(it);
    const arr = m.get(k);
    if (arr) arr.push(it); else m.set(k, [it]);
  }
  return m;
}

/**
 * TETO DE SERIES: acima de N entidades, o resto vira "Outros".
 * Nunca gere um nono matiz — a paleta tem 8 slots fixos.
 */
export function topNComOutros<T>(
  grupos: Map<string, T[]>,
  valor: (itens: T[]) => number,
  n: number,
): { nome: string; valor: number }[] {
  const ordenado = [...grupos.entries()]
    .map(([nome, itens]) => ({ nome, valor: valor(itens) }))
    .sort((a, b) => b.valor - a.valor);
  const topo = ordenado.slice(0, n);
  const resto = ordenado.slice(n);
  if (resto.length > 0) {
    topo.push({ nome: 'Outros', valor: resto.reduce((s, r) => s + r.valor, 0) });
  }
  return topo;
}
