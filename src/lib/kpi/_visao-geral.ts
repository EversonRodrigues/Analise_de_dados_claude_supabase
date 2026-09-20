/**
 * KPIs da visao geral executiva. Dono: Lider.
 * Deliberadamente so consome `regras.ts` — nao depende de nenhuma seção, para
 * que a abertura do dashboard nunca quebre quando uma seção muda.
 */
import type { Dataset } from '@/lib/data/types';
import {
  receitaLinha, receitaTotal, dividirPeriodos, variacao, agrupar, janela,
} from '@/lib/data/regras';

/**
 * Receita total do periodo e variacao 15d vs 15d anteriores.
 * Formula: SUM(quantidade * preco_unitario); delta = (recente - anterior) / anterior
 * Fonte: vendas.quantidade, vendas.preco_unitario, vendas.data_venda
 */
export function receitaComDelta(ds: Dataset) {
  const { recente, anterior } = dividirPeriodos(ds.vendas);
  const rRec = receitaTotal(recente);
  const rAnt = receitaTotal(anterior);
  return { total: receitaTotal(ds.vendas), recente: rRec, anterior: rAnt, delta: variacao(rRec, rAnt) };
}

/**
 * Pedidos e ticket medio.
 * Formula: pedidos = COUNT(DISTINCT id_venda); ticket = receita / pedidos
 * Fonte: vendas.id_venda
 */
export function pedidosComDelta(ds: Dataset) {
  const { recente, anterior } = dividirPeriodos(ds.vendas);
  const nRec = new Set(recente.map((v) => v.id_venda)).size;
  const nAnt = new Set(anterior.map((v) => v.id_venda)).size;
  const total = new Set(ds.vendas.map((v) => v.id_venda)).size;
  const ticketRec = nRec ? receitaTotal(recente) / nRec : 0;
  const ticketAnt = nAnt ? receitaTotal(anterior) / nAnt : 0;
  return {
    pedidos: total,
    deltaPedidos: variacao(nRec, nAnt),
    ticket: total ? receitaTotal(ds.vendas) / total : 0,
    deltaTicket: variacao(ticketRec, ticketAnt),
  };
}

/**
 * Receita por dia, por canal — a serie de abertura do dashboard.
 * Formula: SUM(quantidade * preco_unitario) agrupado por DATE(data_venda) e canal_venda
 * Fonte: vendas.data_venda, vendas.canal_venda
 */
export function receitaDiariaPorCanal(ds: Dataset) {
  const porDia = agrupar(ds.vendas, (v) => v.data_venda.slice(0, 10));
  return [...porDia.entries()]
    .map(([dia, linhas]) => ({
      dia,
      ecommerce: linhas.filter((l) => l.canal_venda === 'ecommerce').reduce((s, l) => s + receitaLinha(l), 0),
      loja_fisica: linhas.filter((l) => l.canal_venda === 'loja_fisica').reduce((s, l) => s + receitaLinha(l), 0),
    }))
    .sort((a, b) => a.dia.localeCompare(b.dia));
}

/**
 * Participacao de cada canal na receita.
 * Formula: receita_canal / receita_total
 * Fonte: vendas.canal_venda
 */
export function mixCanal(ds: Dataset) {
  const total = receitaTotal(ds.vendas);
  const grupos = agrupar(ds.vendas, (v) => v.canal_venda);
  return [...grupos.entries()].map(([canal, linhas]) => {
    const r = receitaTotal(linhas);
    return { canal, receita: r, share: total ? r / total : 0, pedidos: new Set(linhas.map((l) => l.id_venda)).size };
  }).sort((a, b) => b.receita - a.receita);
}

/** Rotulo legivel da janela coberta pela base. */
export function periodoLegivel(ds: Dataset) {
  const { inicio, fim, vazio } = janela(ds.vendas);
  // Base vazia nao tem periodo. Rotular qualquer data aqui seria inventar um
  // numero e exibi-lo com a mesma autoridade dos reais.
  if (vazio) return { texto: 'sem vendas no periodo', dias: 0, vazio: true as const };
  const f = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  const dias = Math.round((fim.getTime() - inicio.getTime()) / 86400000) + 1;
  return { texto: `${f.format(inicio)} — ${f.format(fim)}`, dias, vazio: false as const };
}

/**
 * Deslocamento de valor entre canais dentro da janela — a historia mais forte da base.
 * Formula: por canal, receita e ticket nos 15d recentes vs. 15d anteriores;
 *          share = receita_canal_periodo / receita_total_periodo
 * Fonte: vendas.canal_venda, vendas.data_venda, quantidade, preco_unitario, id_venda
 */
export function migracaoDeCanal(ds: Dataset) {
  const { recente, anterior } = dividirPeriodos(ds.vendas);

  const medir = (linhas: typeof ds.vendas, canal: string) => {
    const doCanal = linhas.filter((v) => v.canal_venda === canal);
    const receita = receitaTotal(doCanal);
    const pedidos = new Set(doCanal.map((v) => v.id_venda)).size;
    const unidades = doCanal.reduce((s, v) => s + v.quantidade, 0);
    return {
      receita,
      pedidos,
      ticket: pedidos ? receita / pedidos : 0,
      precoMedio: unidades ? receita / unidades : 0,
      share: receitaTotal(linhas) ? receita / receitaTotal(linhas) : 0,
    };
  };

  const canais = (['ecommerce', 'loja_fisica'] as const).map((canal) => {
    const ant = medir(anterior, canal);
    const rec = medir(recente, canal);
    return {
      canal,
      anterior: ant,
      recente: rec,
      deltaReceita: variacao(rec.receita, ant.receita),
      deltaTicket: variacao(rec.ticket, ant.ticket),
      deltaPrecoMedio: variacao(rec.precoMedio, ant.precoMedio),
      deltaShare: rec.share - ant.share,
    };
  });

  /** Compras por cliente nas duas metades: separa deslocamento de queda de demanda. */
  const porCliente = (linhas: typeof ds.vendas) => {
    const clientes = new Set(linhas.map((v) => v.id_cliente)).size;
    return clientes ? new Set(linhas.map((v) => v.id_venda)).size / clientes : 0;
  };

  return {
    canais,
    comprasPorClienteAnterior: porCliente(anterior),
    comprasPorClienteRecente: porCliente(recente),
    deltaComprasPorCliente: variacao(porCliente(recente), porCliente(anterior)),
  };
}
