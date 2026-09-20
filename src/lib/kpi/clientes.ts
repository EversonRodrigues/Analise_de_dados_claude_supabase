/**
 * KPIs DE CLIENTES & COMPORTAMENTO — dono: T4.
 *
 * Funcoes PURAS sobre `Dataset`. Sem React, sem fetch, sem `Date.now()`.
 *
 * LIMITES DA BASE (lidos no banco, nao supostos) — todo rotulo desta secao
 * respeita estes tres fatos:
 *  1. `clientes` tem apenas 50 linhas. Qualquer recorte (safra, estado) cai para
 *     grupos de 1 a 21 clientes. Toda funcao que agrupa devolve o `n` do grupo
 *     para que a interface o exiba. Variacao entre grupos pequenos NAO e tendencia.
 *  2. A janela e de 30 dias (2025-12-13 -> 2026-01-11). Nao ha historico
 *     transacional anterior, logo RETENCAO, CHURN e LTV nao sao calculaveis.
 *     O que se mede aqui e frequencia, recencia e valor DENTRO da janela.
 *  3. Cada linha de `vendas` tem `id_venda` proprio: 3020 linhas = 3020 compras.
 *     "Pedido" aqui significa uma compra de um item, nao um carrinho multi-item.
 */
import type { Cliente, Dataset, Venda } from '@/lib/data/types';
import {
  agrupar,
  dividirPeriodos,
  enriquecer,
  janela,
  receitaLinha,
  receitaTotal,
  topNComOutros,
  variacao,
} from '@/lib/data/regras';

const DIA_MS = 86_400_000;

/** Perfil completo de um cliente dentro da janela de 30 dias. */
export type MetricasCliente = {
  id_cliente: string;
  nome: string;
  estado: string;
  safra: number | null;
  receita: number;
  compras: number;
  itens: number;
  /** receita / compras */
  ticketMedio: number;
  receitaEcommerce: number;
  receitaLoja: number;
  comprasEcommerce: number;
  comprasLoja: number;
  /** receitaEcommerce / receita. 1 = so ecommerce, 0 = so loja. */
  shareEcommerce: number;
  ultimaCompra: string;
  /** Dias entre a ultima compra do cliente e o fim da janela. */
  recenciaDias: number;
};

/**
 * Perfil por cliente: valor, frequencia, recencia e mix de canal na janela.
 * Formula: por id_cliente — receita = Σ(quantidade × preco_unitario);
 *          compras = nº de linhas de venda; ticketMedio = receita / compras;
 *          shareEcommerce = receita(canal=ecommerce) / receita;
 *          recenciaDias = (fim da janela − max(data_venda)) / 86400s
 * Fonte: vendas (todas as linhas, inclusive orfas — o corte aqui e por CLIENTE,
 *        e a FK de cliente e valida para as 3020 linhas), clientes.
 */
export function metricasPorCliente(dataset: Dataset): MetricasCliente[] {
  const { fim } = janela(dataset.vendas);
  const porCliente = agrupar(dataset.vendas, (v) => v.id_cliente);
  const idxCliente = new Map<string, Cliente>(
    dataset.clientes.map((c) => [c.id_cliente, c]),
  );

  const out: MetricasCliente[] = [];
  for (const [id, vendas] of porCliente) {
    const cliente = idxCliente.get(id);
    const receita = receitaTotal(vendas);
    const ecom = vendas.filter((v) => v.canal_venda === 'ecommerce');
    const loja = vendas.filter((v) => v.canal_venda === 'loja_fisica');
    const ultima = vendas.reduce(
      (max, v) => (v.data_venda > max ? v.data_venda : max),
      vendas[0].data_venda,
    );
    out.push({
      id_cliente: id,
      nome: cliente?.nome_cliente ?? id,
      estado: cliente?.estado ?? 'Sem UF',
      safra: cliente?.data_cadastro ? new Date(cliente.data_cadastro).getUTCFullYear() : null,
      receita,
      compras: vendas.length,
      itens: vendas.reduce((s, v) => s + v.quantidade, 0),
      ticketMedio: vendas.length === 0 ? 0 : receita / vendas.length,
      receitaEcommerce: receitaTotal(ecom),
      receitaLoja: receitaTotal(loja),
      comprasEcommerce: ecom.length,
      comprasLoja: loja.length,
      shareEcommerce: receita === 0 ? 0 : receitaTotal(ecom) / receita,
      ultimaCompra: ultima,
      recenciaDias: Math.round((fim.getTime() - new Date(ultima).getTime()) / DIA_MS),
    });
  }
  return out.sort((a, b) => b.receita - a.receita);
}

export type ResumoClientes = {
  /** Clientes cadastrados na tabela `clientes`. */
  cadastrados: number;
  /** Clientes com ao menos uma compra na janela. */
  ativos: number;
  /** ativos / cadastrados */
  taxaAtivacao: number;
  gastoMedio: number;
  deltaGastoMedio: number;
  comprasPorCliente: number;
  deltaComprasPorCliente: number;
  ticketMedio: number;
  deltaTicketMedio: number;
  /** Nº de clientes que compraram em AMBOS os canais na janela. */
  omnichannel: number;
};

/**
 * Abertura do painel: estado da base de clientes e delta 15d vs 15d anteriores.
 * Formula: gastoMedio = receita_total / nº clientes ativos;
 *          comprasPorCliente = nº de compras / nº clientes ativos;
 *          ticketMedio = receita_total / nº de compras;
 *          delta = (metade recente − metade anterior) / metade anterior, via dividirPeriodos()
 * Fonte: vendas.quantidade × vendas.preco_unitario, vendas.id_cliente, clientes.id_cliente.
 * Nota: NAO e retencao nem churn — a janela de 30 dias nao permite esses conceitos.
 */
export function resumoClientes(dataset: Dataset): ResumoClientes {
  const metricas = metricasPorCliente(dataset);
  const ativos = metricas.length;
  const receita = receitaTotal(dataset.vendas);
  const compras = dataset.vendas.length;

  const { recente, anterior } = dividirPeriodos(dataset.vendas);
  const agg = (vs: Venda[]) => {
    const rec = receitaTotal(vs);
    const cli = new Set(vs.map((v) => v.id_cliente)).size;
    return {
      gastoMedio: cli === 0 ? 0 : rec / cli,
      comprasPorCliente: cli === 0 ? 0 : vs.length / cli,
      ticketMedio: vs.length === 0 ? 0 : rec / vs.length,
    };
  };
  const r = agg(recente);
  const a = agg(anterior);

  return {
    cadastrados: dataset.clientes.length,
    ativos,
    taxaAtivacao: dataset.clientes.length === 0 ? 0 : ativos / dataset.clientes.length,
    gastoMedio: ativos === 0 ? 0 : receita / ativos,
    deltaGastoMedio: variacao(r.gastoMedio, a.gastoMedio),
    comprasPorCliente: ativos === 0 ? 0 : compras / ativos,
    deltaComprasPorCliente: variacao(r.comprasPorCliente, a.comprasPorCliente),
    ticketMedio: compras === 0 ? 0 : receita / compras,
    deltaTicketMedio: variacao(r.ticketMedio, a.ticketMedio),
    omnichannel: metricas.filter((m) => m.comprasEcommerce > 0 && m.comprasLoja > 0).length,
  };
}

export type PontoPareto = {
  /** Posicao do cliente no ranking de receita (1 = maior). */
  rank: number;
  /** rank / nº de clientes, em % — eixo X da curva. */
  pctClientes: number;
  /** Receita acumulada ate este rank, em % do total. */
  pctReceitaAcum: number;
  /** Linha de referencia: distribuicao perfeitamente igual (y = x). */
  igualdade: number;
};

export type Concentracao = {
  curva: PontoPareto[];
  /** % da receita concentrada nos 10% maiores clientes. */
  top10pct: number;
  /** % da receita concentrada nos 20% maiores clientes. */
  top20pct: number;
  /** Quantos clientes somam metade da receita. */
  clientesParaMetadeDaReceita: number;
  /** Gini da receita por cliente: 0 = todos iguais, 1 = um cliente leva tudo. */
  gini: number;
  /** Quantas vezes o top 20% pesa acima do que pesaria numa base uniforme. */
  indiceConcentracao: number;
};

/**
 * Concentracao de receita (curva de Pareto / Lorenz invertida).
 * Formula: clientes ordenados por receita desc; pctReceitaAcum(k) = Σ receita(1..k) / receita_total.
 *          gini = (2·Σ i·rᵢ) / (n·Σ rᵢ) − (n+1)/n, com rᵢ em ordem CRESCENTE.
 *          indiceConcentracao = top20pct / 0,20 (1,0 = base perfeitamente uniforme).
 * Fonte: vendas.quantidade × vendas.preco_unitario agrupado por vendas.id_cliente.
 */
export function concentracaoDeReceita(dataset: Dataset): Concentracao {
  const metricas = metricasPorCliente(dataset); // ja vem ordenado desc por receita
  const n = metricas.length;
  const total = metricas.reduce((s, m) => s + m.receita, 0);
  if (n === 0 || total === 0) {
    return {
      curva: [], top10pct: 0, top20pct: 0, clientesParaMetadeDaReceita: 0,
      gini: 0, indiceConcentracao: 0,
    };
  }

  const curva: PontoPareto[] = [];
  let acum = 0;
  let metade = 0;
  for (let i = 0; i < n; i++) {
    acum += metricas[i].receita;
    const pctClientes = ((i + 1) / n) * 100;
    if (metade === 0 && acum / total >= 0.5) metade = i + 1;
    curva.push({
      rank: i + 1,
      pctClientes,
      pctReceitaAcum: (acum / total) * 100,
      igualdade: pctClientes,
    });
  }

  const emK = (frac: number) => {
    const k = Math.max(1, Math.round(n * frac));
    return (metricas.slice(0, k).reduce((s, m) => s + m.receita, 0) / total) * 100;
  };

  const cresc = [...metricas].map((m) => m.receita).sort((a, b) => a - b);
  const somaPonderada = cresc.reduce((s, r, i) => s + (i + 1) * r, 0);
  const gini = (2 * somaPonderada) / (n * total) - (n + 1) / n;

  const top20pct = emK(0.2);
  return {
    curva,
    top10pct: emK(0.1),
    top20pct,
    clientesParaMetadeDaReceita: metade,
    gini,
    indiceConcentracao: top20pct / 100 / 0.2,
  };
}

export type SegmentoRFM = {
  /** Rotulo honesto: descreve o que foi medido na janela, nao um ciclo de vida. */
  nome: string;
  descricao: string;
  n: number;
  receita: number;
  pctReceita: number;
  ticketMedio: number;
  comprasMedia: number;
};

export type ClienteRFM = MetricasCliente & {
  /** 1 (pior) a 3 (melhor) — tercis dentro da janela de 30 dias. */
  scoreRecencia: number;
  scoreFrequencia: number;
  scoreValor: number;
  segmento: string;
};

export type AnaliseRFM = {
  clientes: ClienteRFM[];
  segmentos: SegmentoRFM[];
  /** Amplitude da recencia na base, em dias. Se ~0, R nao discrimina ninguem. */
  amplitudeRecenciaDias: number;
  /** true quando a recencia nao separa clientes e o R do RFM deve ser ignorado. */
  recenciaInformativa: boolean;
};

function tercil(valor: number, ordenadoAsc: number[]): number {
  const n = ordenadoAsc.length;
  if (n === 0) return 2;
  const pos = ordenadoAsc.filter((v) => v < valor).length / n;
  return pos < 1 / 3 ? 1 : pos < 2 / 3 ? 2 : 3;
}

/**
 * Segmentacao RFM restrita a janela de 30 dias.
 * Formula: cada eixo vira tercil (1..3) sobre os 50 clientes —
 *          R = recencia invertida (compra mais recente = 3),
 *          F = nº de compras, M = receita. Segmento = regra sobre (F, M).
 * Fonte: vendas.data_venda, vendas.id_venda, vendas.quantidade × vendas.preco_unitario.
 * ATENCAO: isto NAO e RFM de ciclo de vida. Sem historico anterior a 2025-12-13 nao
 * existe "cliente perdido" nem "reativado"; os rotulos falam apenas da janela.
 * Se `recenciaInformativa` for false, o eixo R deve ser omitido da leitura.
 */
export function segmentacaoRFM(dataset: Dataset): AnaliseRFM {
  const metricas = metricasPorCliente(dataset);
  const recAsc = [...metricas].map((m) => -m.recenciaDias).sort((a, b) => a - b);
  const freqAsc = [...metricas].map((m) => m.compras).sort((a, b) => a - b);
  const valAsc = [...metricas].map((m) => m.receita).sort((a, b) => a - b);

  const clientes: ClienteRFM[] = metricas.map((m) => {
    const f = tercil(m.compras, freqAsc);
    const v = tercil(m.receita, valAsc);
    const segmento =
      f === 3 && v === 3 ? 'Alto volume e alto valor'
      : v === 3 ? 'Alto valor, volume medio/baixo'
      : f === 3 ? 'Alto volume, valor medio/baixo'
      : f === 1 && v === 1 ? 'Baixo volume e baixo valor'
      : 'Intermediarios';
    return {
      ...m,
      scoreRecencia: tercil(-m.recenciaDias, recAsc),
      scoreFrequencia: f,
      scoreValor: v,
      segmento,
    };
  });

  const total = clientes.reduce((s, c) => s + c.receita, 0);
  const descricoes: Record<string, string> = {
    'Alto volume e alto valor': 'Tercil superior em nº de compras E em receita na janela.',
    'Alto valor, volume medio/baixo': 'Gastam muito com menos compras — ticket alto.',
    'Alto volume, valor medio/baixo': 'Compram muito, gastam pouco por compra.',
    'Baixo volume e baixo valor': 'Tercil inferior nos dois eixos na janela.',
    Intermediarios: 'Tercil do meio em pelo menos um eixo.',
  };

  const segmentos: SegmentoRFM[] = [...agrupar(clientes, (c) => c.segmento)]
    .map(([nome, itens]) => {
      const receita = itens.reduce((s, c) => s + c.receita, 0);
      return {
        nome,
        descricao: descricoes[nome] ?? '',
        n: itens.length,
        receita,
        pctReceita: total === 0 ? 0 : receita / total,
        ticketMedio: receita / itens.reduce((s, c) => s + c.compras, 0),
        comprasMedia: itens.reduce((s, c) => s + c.compras, 0) / itens.length,
      };
    })
    .sort((a, b) => b.receita - a.receita);

  const recencias = metricas.map((m) => m.recenciaDias);
  const amplitude = recencias.length === 0 ? 0 : Math.max(...recencias) - Math.min(...recencias);

  return {
    clientes,
    segmentos,
    amplitudeRecenciaDias: amplitude,
    recenciaInformativa: amplitude >= 7,
  };
}

export type Safra = {
  ano: number | null;
  rotulo: string;
  /** OBRIGATORIO exibir na interface: com 50 clientes, cada safra tem poucos casos. */
  n: number;
  receita: number;
  gastoMedio: number;
  ticketMedio: number;
  comprasMedia: number;
  shareEcommerce: number;
  /** false quando n < 10 — a variacao do grupo nao sustenta leitura de tendencia. */
  amostraSuficiente: boolean;
};

/**
 * Comportamento por safra de cadastro (ano de `clientes.data_cadastro`).
 * Formula: por ano de cadastro — n = nº de clientes; gastoMedio = Σ receita / n;
 *          ticketMedio = Σ receita / Σ compras; shareEcommerce = Σ receita_ecommerce / Σ receita.
 * Fonte: clientes.data_cadastro, vendas.quantidade × vendas.preco_unitario.
 * ATENCAO: n por safra vai de 3 a 21. `amostraSuficiente` marca os grupos com n < 10;
 * a interface deve rotular o n e nao tratar a diferenca entre safras como tendencia.
 */
export function comportamentoPorSafra(dataset: Dataset): Safra[] {
  const metricas = metricasPorCliente(dataset);
  const grupos = agrupar(metricas, (m) => (m.safra === null ? 'sem-data' : String(m.safra)));

  return [...grupos]
    .map(([chave, itens]) => {
      const receita = itens.reduce((s, m) => s + m.receita, 0);
      const compras = itens.reduce((s, m) => s + m.compras, 0);
      const recEcom = itens.reduce((s, m) => s + m.receitaEcommerce, 0);
      const ano = chave === 'sem-data' ? null : Number(chave);
      return {
        ano,
        rotulo: ano === null ? 'Sem data de cadastro' : String(ano),
        n: itens.length,
        receita,
        gastoMedio: receita / itens.length,
        ticketMedio: compras === 0 ? 0 : receita / compras,
        comprasMedia: compras / itens.length,
        shareEcommerce: receita === 0 ? 0 : recEcom / receita,
        amostraSuficiente: itens.length >= 10,
      };
    })
    .sort((a, b) => (a.ano ?? 0) - (b.ano ?? 0));
}

export type PerfilCanal = {
  nome: 'Somente ecommerce' | 'Somente loja fisica' | 'Omnichannel';
  n: number;
  receita: number;
  pctReceita: number;
  gastoMedio: number;
  ticketMedio: number;
  comprasMedia: number;
};

/**
 * Preferencia de canal por cliente: so-ecommerce, so-loja ou omnichannel.
 * Formula: cliente e omnichannel se tem >=1 compra em cada canal na janela;
 *          ticketMedio do grupo = Σ receita do grupo / Σ compras do grupo.
 * Fonte: vendas.canal_venda, vendas.id_cliente, vendas.quantidade × vendas.preco_unitario.
 * RESULTADO REAL DESTA BASE: os 50 clientes compram nos dois canais — os grupos
 * "somente ecommerce" e "somente loja" vem vazios. A comparacao de ticket entre
 * grupos, portanto, NAO existe aqui; use `intensidadeDeCanal()` no lugar.
 */
export function perfilDeCanal(dataset: Dataset): PerfilCanal[] {
  const metricas = metricasPorCliente(dataset);
  const total = metricas.reduce((s, m) => s + m.receita, 0);
  const baldes: Record<PerfilCanal['nome'], MetricasCliente[]> = {
    'Somente ecommerce': [],
    'Somente loja fisica': [],
    Omnichannel: [],
  };
  for (const m of metricas) {
    if (m.comprasEcommerce > 0 && m.comprasLoja > 0) baldes.Omnichannel.push(m);
    else if (m.comprasEcommerce > 0) baldes['Somente ecommerce'].push(m);
    else baldes['Somente loja fisica'].push(m);
  }

  return (Object.keys(baldes) as PerfilCanal['nome'][]).map((nome) => {
    const itens = baldes[nome];
    const receita = itens.reduce((s, m) => s + m.receita, 0);
    const compras = itens.reduce((s, m) => s + m.compras, 0);
    return {
      nome,
      n: itens.length,
      receita,
      pctReceita: total === 0 ? 0 : receita / total,
      gastoMedio: itens.length === 0 ? 0 : receita / itens.length,
      ticketMedio: compras === 0 ? 0 : receita / compras,
      comprasMedia: itens.length === 0 ? 0 : compras / itens.length,
    };
  });
}

export type FaixaIntensidade = {
  nome: string;
  faixa: string;
  n: number;
  receita: number;
  gastoMedio: number;
  ticketMedio: number;
  shareEcommerceMedio: number;
};

/**
 * Intensidade de canal: como todos sao omnichannel, o que varia e o QUANTO de
 * cada cliente vai para o ecommerce. Faixas fixas sobre o share de receita online.
 * Formula: shareEcommerce(cliente) = receita_ecommerce / receita_total do cliente;
 *          faixas fixas <60%, 60-75%, >=75%; ticketMedio = Σ receita / Σ compras da faixa.
 * Fonte: vendas.canal_venda, vendas.quantidade × vendas.preco_unitario.
 */
export function intensidadeDeCanal(dataset: Dataset): FaixaIntensidade[] {
  const metricas = metricasPorCliente(dataset);
  const defs = [
    { nome: 'Loja pesa mais', faixa: 'ate 60% online', teste: (s: number) => s < 0.6 },
    { nome: 'Equilibrados', faixa: '60% a 75% online', teste: (s: number) => s >= 0.6 && s < 0.75 },
    { nome: 'Digitais', faixa: '75% ou mais online', teste: (s: number) => s >= 0.75 },
  ];
  return defs.map((d) => {
    const itens = metricas.filter((m) => d.teste(m.shareEcommerce));
    const receita = itens.reduce((s, m) => s + m.receita, 0);
    const compras = itens.reduce((s, m) => s + m.compras, 0);
    return {
      nome: d.nome,
      faixa: d.faixa,
      n: itens.length,
      receita,
      gastoMedio: itens.length === 0 ? 0 : receita / itens.length,
      ticketMedio: compras === 0 ? 0 : receita / compras,
      shareEcommerceMedio:
        itens.length === 0 ? 0 : itens.reduce((s, m) => s + m.shareEcommerce, 0) / itens.length,
    };
  });
}

export type MigracaoCliente = {
  id_cliente: string;
  nome: string;
  /** Share de ecommerce nos 15 dias anteriores, em pontos percentuais. */
  shareAnterior: number;
  /** Share de ecommerce nos 15 dias recentes, em pontos percentuais. */
  shareRecente: number;
  /** shareRecente − shareAnterior, em pontos percentuais. Negativo = foi para a loja. */
  deltaPP: number;
};

export type Migracao = {
  clientes: MigracaoCliente[];
  /** Quantos clientes reduziram o share de ecommerce entre as duas metades. */
  migraramParaLoja: number;
  /** Quantos caíram mais de 10 pontos percentuais. */
  quedaAcima10pp: number;
  /** Media do delta em pontos percentuais. */
  deltaMedioPP: number;
  totalClientes: number;
};

/**
 * Migracao de canal dentro da janela: 15 dias recentes vs. 15 anteriores.
 * Formula: por cliente, share_ecommerce(periodo) = receita_ecommerce / receita do periodo;
 *          deltaPP = (share_recente − share_anterior) × 100.
 * Fonte: vendas.data_venda (corte via dividirPeriodos), vendas.canal_venda,
 *        vendas.quantidade × vendas.preco_unitario.
 * Clientes sem receita em algum dos dois periodos sao omitidos (delta indefinido).
 */
export function migracaoDeCanal(dataset: Dataset): Migracao {
  const { recente, anterior } = dividirPeriodos(dataset.vendas);
  const nomes = new Map(dataset.clientes.map((c) => [c.id_cliente, c.nome_cliente]));

  const share = (vs: Venda[]) => {
    const tot = receitaTotal(vs);
    if (tot === 0) return null;
    return receitaTotal(vs.filter((v) => v.canal_venda === 'ecommerce')) / tot;
  };
  const gRec = agrupar(recente, (v) => v.id_cliente);
  const gAnt = agrupar(anterior, (v) => v.id_cliente);

  const clientes: MigracaoCliente[] = [];
  for (const [id, vs] of gAnt) {
    const sa = share(vs);
    const vr = gRec.get(id);
    const sr = vr ? share(vr) : null;
    if (sa === null || sr === null) continue;
    clientes.push({
      id_cliente: id,
      nome: nomes.get(id) ?? id,
      shareAnterior: sa * 100,
      shareRecente: sr * 100,
      deltaPP: (sr - sa) * 100,
    });
  }
  clientes.sort((a, b) => a.deltaPP - b.deltaPP);

  return {
    clientes,
    migraramParaLoja: clientes.filter((c) => c.deltaPP < 0).length,
    quedaAcima10pp: clientes.filter((c) => c.deltaPP < -10).length,
    deltaMedioPP:
      clientes.length === 0 ? 0 : clientes.reduce((s, c) => s + c.deltaPP, 0) / clientes.length,
    totalClientes: clientes.length,
  };
}

export type CanalPeriodo = {
  periodo: '15 dias anteriores' | '15 dias recentes';
  ecommerce: number;
  loja_fisica: number;
};

export type CanalComparativo = {
  receita: CanalPeriodo[];
  ticket: CanalPeriodo[];
  /** Variacao relativa da receita por canal entre as metades. */
  deltaReceitaEcommerce: number;
  deltaReceitaLoja: number;
  deltaTicketEcommerce: number;
  deltaTicketLoja: number;
  /** Share de receita do ecommerce em cada metade (0..1). */
  shareEcommerceAnterior: number;
  shareEcommerceRecente: number;
};

/**
 * Receita e ticket por canal nas duas metades da janela.
 * Formula: receita(canal, periodo) = Σ(quantidade × preco_unitario);
 *          ticket(canal, periodo) = receita / nº de compras do canal no periodo;
 *          delta = (recente − anterior) / anterior.
 * Fonte: vendas.canal_venda, vendas.data_venda (corte via dividirPeriodos).
 * Duas medidas de escalas diferentes -> DOIS graficos. Nunca eixo duplo.
 */
export function canalPorPeriodo(dataset: Dataset): CanalComparativo {
  const { recente, anterior } = dividirPeriodos(dataset.vendas);
  const corte = (vs: Venda[], canal: Venda['canal_venda']) => {
    const sub = vs.filter((v) => v.canal_venda === canal);
    const rec = receitaTotal(sub);
    return { receita: rec, ticket: sub.length === 0 ? 0 : rec / sub.length };
  };
  const aE = corte(anterior, 'ecommerce');
  const aL = corte(anterior, 'loja_fisica');
  const rE = corte(recente, 'ecommerce');
  const rL = corte(recente, 'loja_fisica');

  return {
    receita: [
      { periodo: '15 dias anteriores', ecommerce: aE.receita, loja_fisica: aL.receita },
      { periodo: '15 dias recentes', ecommerce: rE.receita, loja_fisica: rL.receita },
    ],
    ticket: [
      { periodo: '15 dias anteriores', ecommerce: aE.ticket, loja_fisica: aL.ticket },
      { periodo: '15 dias recentes', ecommerce: rE.ticket, loja_fisica: rL.ticket },
    ],
    deltaReceitaEcommerce: variacao(rE.receita, aE.receita),
    deltaReceitaLoja: variacao(rL.receita, aL.receita),
    deltaTicketEcommerce: variacao(rE.ticket, aE.ticket),
    deltaTicketLoja: variacao(rL.ticket, aL.ticket),
    shareEcommerceAnterior:
      aE.receita + aL.receita === 0 ? 0 : aE.receita / (aE.receita + aL.receita),
    shareEcommerceRecente:
      rE.receita + rL.receita === 0 ? 0 : rE.receita / (rE.receita + rL.receita),
  };
}

export type EstadoLinha = {
  estado: string;
  clientes: number;
  receita: number;
  receitaPorCliente: number;
};

export type Geografia = {
  /** Todos os estados, ordenados por receita desc — para a tabela. */
  estados: EstadoLinha[];
  /** Top 8 + "Outros" — para o grafico de barras (teto de 8 series/categorias). */
  barras: { nome: string; valor: number }[];
  totalEstados: number;
  paises: string[];
  /** Estados com 1 unico cliente: a receita do estado E a de uma pessoa. */
  estadosComUmCliente: number;
};

/**
 * Distribuicao geografica por estado (UF).
 * Formula: por clientes.estado — clientes distintos, Σ(quantidade × preco_unitario),
 *          receitaPorCliente = receita / clientes. Barras via topNComOutros(..., 8).
 * Fonte: clientes.estado, clientes.pais, vendas.id_cliente.
 * ATENCAO: 22 UFs para 50 clientes — a mediana de clientes por UF e 2 e varios
 * estados tem 1. Nao existe "mercado forte no estado X": existe um cliente grande.
 * Um unico pais na base, entao nao ha corte por pais.
 */
export function distribuicaoGeografica(dataset: Dataset): Geografia {
  const metricas = metricasPorCliente(dataset);
  const grupos = agrupar(metricas, (m) => m.estado);

  const estados: EstadoLinha[] = [...grupos]
    .map(([estado, itens]) => {
      const receita = itens.reduce((s, m) => s + m.receita, 0);
      return {
        estado,
        clientes: itens.length,
        receita,
        receitaPorCliente: receita / itens.length,
      };
    })
    .sort((a, b) => b.receita - a.receita);

  return {
    estados,
    barras: topNComOutros(grupos, (itens) => itens.reduce((s, m) => s + m.receita, 0), 8),
    totalEstados: estados.length,
    paises: [...new Set(dataset.clientes.map((c) => c.pais).filter((p): p is string => !!p))],
    estadosComUmCliente: estados.filter((e) => e.clientes === 1).length,
  };
}

export type PontoDispersao = {
  id_cliente: string;
  nome: string;
  /** Eixo X: nº de compras em 30 dias. */
  compras: number;
  /** Eixo Y: receita / compras. */
  ticketMedio: number;
  receita: number;
  grupo: string;
};

/**
 * Dispersao frequencia × ticket — qual eixo realmente separa os clientes.
 * Formula: X = nº de compras na janela; Y = receita / compras;
 *          grupo = tercil de receita total (teto de 3 series em scatter).
 * Fonte: vendas.id_cliente, vendas.id_venda, vendas.quantidade × vendas.preco_unitario.
 */
export function dispersaoFrequenciaTicket(dataset: Dataset): {
  pontos: PontoDispersao[];
  grupos: string[];
  /** max/min de cada eixo — mostra qual dimensao tem mais amplitude. */
  amplitudeCompras: number;
  amplitudeTicket: number;
} {
  const rfm = segmentacaoRFM(dataset);
  const rotulos = ['Receita no tercil baixo', 'Receita no tercil medio', 'Receita no tercil alto'];
  const pontos: PontoDispersao[] = rfm.clientes.map((c) => ({
    id_cliente: c.id_cliente,
    nome: c.nome,
    compras: c.compras,
    ticketMedio: c.ticketMedio,
    receita: c.receita,
    grupo: rotulos[c.scoreValor - 1],
  }));
  const compras = pontos.map((p) => p.compras);
  const tickets = pontos.map((p) => p.ticketMedio);
  return {
    pontos,
    grupos: rotulos,
    amplitudeCompras: compras.length === 0 ? 0 : Math.max(...compras) / Math.min(...compras),
    amplitudeTicket: tickets.length === 0 ? 0 : Math.max(...tickets) / Math.min(...tickets),
  };
}

export type Repertorio = {
  categoriasNoCatalogo: number;
  /** Media de categorias distintas compradas por cliente na janela. */
  mediaCategoriasPorCliente: number;
  minCategorias: number;
  maxCategorias: number;
  /** % de clientes que compraram em TODAS as categorias do catalogo. */
  pctCobremCatalogoInteiro: number;
};

/**
 * Repertorio de compra: em quantas categorias distintas cada cliente comprou.
 * Formula: por cliente, nº de `produtos.categoria` distintas entre suas compras;
 *          media/min/max sobre os clientes ativos.
 * Fonte: vendas enriquecidas com produtos (enriquecer) — categoria vem de produtos.categoria.
 * O CORTE E POR PRODUTO, logo as 20 vendas orfas ficam de fora: exiba
 * `notaRodapeOrfas(dataset)` no rodape de qualquer cartao que use esta funcao.
 */
export function repertorioDeCategorias(dataset: Dataset): Repertorio {
  const enriquecidas = enriquecer(dataset.vendas, dataset.produtos);
  const categorias = new Set(
    dataset.produtos.map((p) => p.categoria).filter((c): c is string => !!c),
  );
  const porCliente = agrupar(
    enriquecidas.filter((v) => v.produto.categoria),
    (v) => v.id_cliente,
  );
  const contagens = [...porCliente.values()].map(
    (vs) => new Set(vs.map((v) => v.produto.categoria)).size,
  );
  if (contagens.length === 0) {
    return {
      categoriasNoCatalogo: categorias.size, mediaCategoriasPorCliente: 0,
      minCategorias: 0, maxCategorias: 0, pctCobremCatalogoInteiro: 0,
    };
  }
  return {
    categoriasNoCatalogo: categorias.size,
    mediaCategoriasPorCliente: contagens.reduce((s, c) => s + c, 0) / contagens.length,
    minCategorias: Math.min(...contagens),
    maxCategorias: Math.max(...contagens),
    pctCobremCatalogoInteiro:
      contagens.filter((c) => c === categorias.size).length / contagens.length,
  };
}

/**
 * Receita agregada por cliente, util para checagens cruzadas com outras secoes.
 * Formula: Σ(quantidade × preco_unitario) por id_cliente.
 * Fonte: vendas. Nao aplica corte por produto, logo bate com receitaTotal(dataset.vendas).
 */
export function receitaPorCliente(dataset: Dataset): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of dataset.vendas) {
    m.set(v.id_cliente, (m.get(v.id_cliente) ?? 0) + receitaLinha(v));
  }
  return m;
}
