/**
 * Testes da seção VENDAS (`src/lib/kpi/vendas.ts`, dono T2).
 * Cada KPI e conferido contra um calculo independente sobre o fixture — nunca
 * contra a propria funcao — e contra as invariantes do contrato (orfas dentro
 * dos totais, fora dos cortes por produto; sem eixo duplo; teto de 8 series).
 */
import { describe, expect, it } from 'vitest';
import * as vendasKpi from '@/lib/kpi/vendas';
import * as visaoGeral from '@/lib/kpi/_visao-geral';
import { enriquecer, orfas, receitaTotal } from '@/lib/data/regras';
import type { Dataset } from '@/lib/data/types';
import {
  RECEITA_CLASSIFICAVEL_FIXTURE,
  RECEITA_ORFAS_FIXTURE,
  RECEITA_TOTAL_FIXTURE,
  dataset,
  datasetVazio,
  somaManual,
} from './fixtures/dataset';

const ds = dataset();
const vazio = datasetVazio();

describe('abertura — os quatro numeros', () => {
  it('receitaComDelta soma TODAS as vendas, orfas incluidas', () => {
    const m = vendasKpi.receitaComDelta(ds);
    expect(m.valor).toBe(RECEITA_TOTAL_FIXTURE);
    expect(m.valor).toBe(somaManual(ds.vendas));
    expect(m.recente + m.anterior).toBeCloseTo(m.valor, 10);
    expect(m.delta).toBeCloseTo((m.recente - m.anterior) / m.anterior, 10);
  });

  it('a receita da abertura NAO e a receita classificavel', () => {
    // Se alguem trocar `dataset.vendas` por `enriquecer(...)` aqui, a aba de
    // vendas passa a divergir da visao geral pelo valor das orfas.
    expect(vendasKpi.receitaComDelta(ds).valor - vendasKpi.receitaClassificavel(ds))
      .toBeCloseTo(RECEITA_ORFAS_FIXTURE, 10);
  });

  it('pedidosComDelta conta id_venda distintos', () => {
    const m = vendasKpi.pedidosComDelta(ds);
    expect(m.valor).toBe(new Set(ds.vendas.map((v) => v.id_venda)).size);
    expect(m.recente + m.anterior).toBe(m.valor);
  });

  it('ticketMedio = receita / pedidos, nos tres recortes', () => {
    const m = vendasKpi.ticketMedioComDelta(ds);
    const pedidos = vendasKpi.pedidosComDelta(ds);
    const receita = vendasKpi.receitaComDelta(ds);
    expect(m.valor).toBeCloseTo(receita.valor / pedidos.valor, 10);
    expect(m.recente).toBeCloseTo(receita.recente / pedidos.recente, 10);
    expect(m.anterior).toBeCloseTo(receita.anterior / pedidos.anterior, 10);
  });

  it('unidadesComDelta soma quantidade', () => {
    const m = vendasKpi.unidadesComDelta(ds);
    expect(m.valor).toBe(ds.vendas.reduce((s, v) => s + v.quantidade, 0));
    expect(m.recente + m.anterior).toBe(m.valor);
  });

  it('a seção VENDAS e a VISAO GERAL concordam na receita e no delta', () => {
    const a = vendasKpi.receitaComDelta(ds);
    const b = visaoGeral.receitaComDelta(ds);
    expect(a.valor).toBeCloseTo(b.total, 10);
    expect(a.delta).toBeCloseTo(b.delta, 10);
  });

  it('a seção VENDAS e a VISAO GERAL concordam em pedidos e ticket', () => {
    expect(vendasKpi.pedidosComDelta(ds).valor).toBe(visaoGeral.pedidosComDelta(ds).pedidos);
    expect(vendasKpi.ticketMedioComDelta(ds).valor).toBeCloseTo(visaoGeral.pedidosComDelta(ds).ticket, 10);
  });

  it('com base vazia os KPIs devolvem zero em vez de NaN/Infinity', () => {
    for (const m of [
      vendasKpi.receitaComDelta(vazio),
      vendasKpi.pedidosComDelta(vazio),
      vendasKpi.ticketMedioComDelta(vazio),
      vendasKpi.unidadesComDelta(vazio),
    ]) {
      expect(Number.isFinite(m.valor)).toBe(true);
      expect(Number.isFinite(m.delta)).toBe(true);
      expect(m.valor).toBe(0);
      expect(m.delta).toBe(0);
    }
  });

  it('periodoObservado e dataCorte saem dos dados, nunca do relogio', () => {
    expect(vendasKpi.periodoObservado(ds)).toEqual({ inicio: '2026-01-01', fim: '2026-01-11' });
    expect(vendasKpi.dataCorte(ds)).toBe('2026-01-06');
    // Puro: duas chamadas seguidas dao o mesmo resultado.
    expect(vendasKpi.dataCorte(ds)).toBe(vendasKpi.dataCorte(dataset()));
  });
});

describe('serie temporal', () => {
  const serie = vendasKpi.receitaPorDia(ds);

  it('a soma dos dias reconstroi a receita total (orfas incluidas)', () => {
    expect(serie.reduce((s, p) => s + p.total, 0)).toBeCloseTo(RECEITA_TOTAL_FIXTURE, 10);
  });

  it('em cada dia os dois canais somam o total do dia — sem eixo duplo, mesma unidade', () => {
    for (const p of serie) expect(p.ecommerce + p.loja_fisica).toBeCloseTo(p.total, 10);
  });

  it('vem ordenada por dia e sem dia repetido', () => {
    const dias = serie.map((p) => p.dia);
    expect(dias).toEqual([...dias].sort());
    expect(new Set(dias).size).toBe(dias.length);
  });

  it('receitaMediaDiaria = receita / dias distintos com venda', () => {
    const dias = new Set(ds.vendas.map((v) => v.data_venda.slice(0, 10))).size;
    expect(vendasKpi.receitaMediaDiaria(ds)).toBeCloseTo(RECEITA_TOTAL_FIXTURE / dias, 10);
    expect(vendasKpi.receitaMediaDiaria(vazio)).toBe(0);
  });
});

describe('corte por canal', () => {
  const canais = vendasKpi.desempenhoPorCanal(ds);

  it('cobre os dois canais e soma a receita total', () => {
    expect(canais.map((c) => c.canal).sort()).toEqual(['ecommerce', 'loja_fisica']);
    expect(canais.reduce((s, c) => s + c.receita, 0)).toBeCloseTo(RECEITA_TOTAL_FIXTURE, 10);
  });

  it('as participacoes somam 1', () => {
    expect(canais.reduce((s, c) => s + c.participacao, 0)).toBeCloseTo(1, 10);
  });

  it('a receita por canal bate com o calculo independente', () => {
    for (const c of canais) {
      expect(c.receita).toBeCloseTo(somaManual(ds.vendas.filter((v) => v.canal_venda === c.canal)), 10);
    }
  });

  it('recente + anterior de cada canal reconstroi a receita do canal', () => {
    for (const c of canais) expect(c.receitaRecente + c.receitaAnterior).toBeCloseTo(c.receita, 10);
  });

  it('a COR segue a entidade: indice fixo por canal, nao por ranking', () => {
    const porCanal = new Map(canais.map((c) => [c.canal, c.indiceCor]));
    expect(porCanal.get('ecommerce')).toBe(0);
    expect(porCanal.get('loja_fisica')).toBe(1);

    // invertendo o ranking (dobrando a loja fisica) as cores NAO trocam
    const invertido = {
      ...ds,
      vendas: ds.vendas.map((v) => (v.canal_venda === 'loja_fisica' ? { ...v, quantidade: v.quantidade * 10 } : v)),
    };
    const depois = new Map(vendasKpi.desempenhoPorCanal(invertido).map((c) => [c.canal, c.indiceCor]));
    expect(depois.get('ecommerce')).toBe(0);
    expect(depois.get('loja_fisica')).toBe(1);
  });

  it('deltaPedidos conta PEDIDOS distintos, nao linhas — carrinho multi-item', () => {
    /**
     * A base de hoje nao distingue as duas implementacoes: `id_venda` e unico
     * nas 3020 linhas, entao contar linhas da o mesmo numero. Este fixture cria
     * o unico caso em que elas divergem — um pedido com DOIS itens de um lado
     * do corte e um pedido de um item do outro:
     *   pedidos:  1 anterior -> 1 recente  => delta  0
     *   linhas:   2 anterior -> 1 recente  => delta -0,5
     */
    const multiItem: Dataset = {
      produtos: [
        { id_produto: 'k1', nome_produto: 'K1', categoria: 'Cat', marca: 'Marca', preco_atual: 100, data_criacao: null },
        { id_produto: 'k2', nome_produto: 'K2', categoria: 'Cat', marca: 'Marca', preco_atual: 100, data_criacao: null },
      ],
      clientes: [],
      competidores: [],
      vendas: [
        { id_venda: 'pedido-A', data_venda: '2026-01-01T00:00:00Z', id_cliente: 'c1', id_produto: 'k1', canal_venda: 'ecommerce', quantidade: 1, preco_unitario: 100 },
        { id_venda: 'pedido-A', data_venda: '2026-01-01T01:00:00Z', id_cliente: 'c1', id_produto: 'k2', canal_venda: 'ecommerce', quantidade: 1, preco_unitario: 100 },
        { id_venda: 'pedido-B', data_venda: '2026-01-10T00:00:00Z', id_cliente: 'c1', id_produto: 'k1', canal_venda: 'ecommerce', quantidade: 1, preco_unitario: 100 },
      ],
    };

    const canal = vendasKpi.desempenhoPorCanal(multiItem)[0];
    expect(canal.pedidos).toBe(2); // pedido-A e pedido-B
    expect(canal.deltaPedidos).toBe(0); // 1 pedido -> 1 pedido
    expect(canal.deltaPedidos).not.toBe(-0.5); // seria o valor contando linhas
  });

  it('ticket por canal = receita do canal / pedidos do canal', () => {
    for (const c of canais) expect(c.ticketMedio).toBeCloseTo(c.receita / c.pedidos, 10);
  });
});

describe('cortes por produto — as orfas SAEM', () => {
  it('receitaClassificavel exclui exatamente as orfas', () => {
    expect(vendasKpi.receitaClassificavel(ds)).toBe(RECEITA_CLASSIFICAVEL_FIXTURE);
    expect(vendasKpi.receitaClassificavel(ds)).toBe(receitaTotal(enriquecer(ds.vendas, ds.produtos)));
  });

  it('pesoOrfas descreve linhas, receita e fracao corretamente', () => {
    const p = vendasKpi.pesoOrfas(ds);
    expect(p.linhas).toBe(orfas(ds.vendas, ds.produtos).length);
    expect(p.receita).toBe(RECEITA_ORFAS_FIXTURE);
    expect(p.fracao).toBeCloseTo(RECEITA_ORFAS_FIXTURE / RECEITA_TOTAL_FIXTURE, 10);
    expect(vendasKpi.pesoOrfas(vazio).fracao).toBe(0);
  });

  describe('receitaPorCategoria', () => {
    it('soma a receita CLASSIFICAVEL, nunca a total', () => {
      const fatias = vendasKpi.receitaPorCategoria(ds);
      expect(fatias.reduce((s, f) => s + f.receita, 0)).toBeCloseTo(RECEITA_CLASSIFICAVEL_FIXTURE, 10);
      expect(fatias.reduce((s, f) => s + f.participacao, 0)).toBeCloseTo(1, 10);
    });

    it('produto sem categoria vira "Sem categoria" e nao some', () => {
      const nomes = vendasKpi.receitaPorCategoria(ds).map((f) => f.nome);
      expect(nomes).toContain('Sem categoria');
    });

    it('respeita o teto de series: nunca mais de limite+1 fatias', () => {
      for (const limite of [1, 2, 3, 8]) {
        const fatias = vendasKpi.receitaPorCategoria(ds, limite);
        expect(fatias.length).toBeLessThanOrEqual(limite + 1);
        expect(fatias.reduce((s, f) => s + f.receita, 0)).toBeCloseTo(RECEITA_CLASSIFICAVEL_FIXTURE, 10);
      }
    });

    it('recente + anterior de cada categoria reconstroi a receita da categoria', () => {
      for (const f of vendasKpi.receitaPorCategoria(ds)) {
        expect(f.recente + f.anterior).toBeCloseTo(f.receita, 10);
        expect(f.deltaAbsoluto).toBeCloseTo(f.recente - f.anterior, 10);
      }
    });

    it('a categoria com maior receita bate com o calculo manual', () => {
      const linhas = enriquecer(ds.vendas, ds.produtos);
      const esperado = new Map<string, number>();
      for (const l of linhas) {
        const k = l.produto.categoria ?? 'Sem categoria';
        esperado.set(k, (esperado.get(k) ?? 0) + l.quantidade * l.preco_unitario);
      }
      for (const f of vendasKpi.receitaPorCategoria(ds)) {
        if (f.nome !== 'Outros') expect(f.receita).toBeCloseTo(esperado.get(f.nome)!, 10);
      }
    });

    it('com base vazia devolve lista vazia', () => {
      expect(vendasKpi.receitaPorCategoria(vazio)).toEqual([]);
    });
  });

  describe('deltaCategoriaPorCanal', () => {
    it('usa o MESMO corte para os dois canais', () => {
      const ecom = vendasKpi.deltaCategoriaPorCanal(ds, 'ecommerce');
      const loja = vendasKpi.deltaCategoriaPorCanal(ds, 'loja_fisica');
      const soma = [...ecom, ...loja].reduce((s, f) => s + f.deltaAbsoluto, 0);
      // O delta classificavel total tem de bater com o delta calculado sem o
      // recorte de canal — so vale se o corte for identico nos dois.
      const global = vendasKpi.receitaPorCategoria(ds, 99).reduce((s, f) => s + f.deltaAbsoluto, 0);
      expect(soma).toBeCloseTo(global, 8);
    });

    it('vem ordenado do pior delta para o melhor (atribuicao da queda)', () => {
      const fatias = vendasKpi.deltaCategoriaPorCanal(ds, 'ecommerce');
      for (let i = 1; i < fatias.length; i += 1) {
        expect(fatias[i - 1].deltaAbsoluto).toBeLessThanOrEqual(fatias[i].deltaAbsoluto);
      }
    });

    it('canal inexistente devolve lista vazia sem estourar', () => {
      expect(vendasKpi.deltaCategoriaPorCanal(ds, 'marketplace')).toEqual([]);
    });
  });

  describe('topProdutos', () => {
    it('agrupa por id_produto e ordena por receita desc', () => {
      const top = vendasKpi.topProdutos(ds, 10);
      expect(new Set(top.map((p) => p.id_produto)).size).toBe(top.length);
      for (let i = 1; i < top.length; i += 1) {
        expect(top[i - 1].receita).toBeGreaterThanOrEqual(top[i].receita);
      }
    });

    it('nenhum produto orfao aparece no top', () => {
      expect(vendasKpi.topProdutos(ds, 99).map((p) => p.id_produto)).not.toContain('p999');
    });

    it('receita e precoMedio batem com o calculo manual', () => {
      for (const p of vendasKpi.topProdutos(ds, 99)) {
        const linhas = ds.vendas.filter((v) => v.id_produto === p.id_produto);
        expect(p.receita).toBeCloseTo(somaManual(linhas), 10);
        expect(p.unidades).toBe(linhas.reduce((s, v) => s + v.quantidade, 0));
        expect(p.precoMedio).toBeCloseTo(p.receita / p.unidades, 10);
      }
    });

    it('respeita o N pedido', () => {
      expect(vendasKpi.topProdutos(ds, 2)).toHaveLength(2);
      expect(vendasKpi.topProdutos(vazio, 5)).toEqual([]);
    });

    it('participacao usa a receita classificavel como base', () => {
      const soma = vendasKpi.topProdutos(ds, 99).reduce((s, p) => s + p.participacao, 0);
      expect(soma).toBeCloseTo(1, 10);
    });
  });

  describe('curva de Pareto', () => {
    const curva = vendasKpi.curvaPareto(ds);

    it('e monotonica e termina em 100% da receita classificavel', () => {
      for (let i = 1; i < curva.length; i += 1) {
        expect(curva[i].participacaoAcumulada).toBeGreaterThanOrEqual(curva[i - 1].participacaoAcumulada);
      }
      expect(curva[curva.length - 1].participacaoAcumulada).toBeCloseTo(1, 10);
      expect(curva[curva.length - 1].fracaoCatalogo).toBeCloseTo(1, 10);
    });

    it('tem um ponto por produto COM VENDA (orfas fora)', () => {
      const comVenda = new Set(enriquecer(ds.vendas, ds.produtos).map((l) => l.id_produto));
      expect(curva).toHaveLength(comVenda.size);
    });

    it('concentracaoTopN bate com a curva e nunca passa de 100%', () => {
      const c = vendasKpi.concentracaoTopN(ds, 2);
      expect(c.n).toBe(2);
      expect(c.participacao).toBeCloseTo(curva[1].participacaoAcumulada, 10);
      expect(vendasKpi.concentracaoTopN(ds, 999).participacao).toBeCloseTo(1, 10);
    });

    it('produtosPara devolve o menor k que atinge o alvo', () => {
      const k = vendasKpi.produtosPara(ds, 0.8);
      expect(curva[k - 1].participacaoAcumulada).toBeGreaterThanOrEqual(0.8);
      if (k > 1) expect(curva[k - 2].participacaoAcumulada).toBeLessThan(0.8);
      expect(vendasKpi.produtosPara(ds, 1)).toBe(curva.length);
    });

    it('com base vazia nada estoura', () => {
      expect(vendasKpi.curvaPareto(vazio)).toEqual([]);
      const c = vendasKpi.concentracaoTopN(vazio, 10);
      expect(c.participacao).toBe(0);
      expect(c.fracaoCatalogo).toBe(0);
      expect(vendasKpi.produtosPara(vazio)).toBe(0);
    });
  });
});

describe('pureza das funcoes de KPI', () => {
  it('nenhuma funcao muta o dataset recebido', () => {
    const antes = JSON.stringify(ds);
    vendasKpi.receitaComDelta(ds);
    vendasKpi.receitaPorDia(ds);
    vendasKpi.desempenhoPorCanal(ds);
    vendasKpi.receitaPorCategoria(ds);
    vendasKpi.topProdutos(ds);
    vendasKpi.curvaPareto(ds);
    vendasKpi.deltaCategoriaPorCanal(ds, 'ecommerce');
    expect(JSON.stringify(ds)).toBe(antes);
  });

  it('duas chamadas identicas devolvem o mesmo resultado (sem Date.now)', () => {
    expect(JSON.stringify(vendasKpi.desempenhoPorCanal(ds)))
      .toBe(JSON.stringify(vendasKpi.desempenhoPorCanal(dataset())));
  });
});
