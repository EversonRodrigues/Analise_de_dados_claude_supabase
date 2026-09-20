/**
 * Testes da seção PRICING (`src/lib/kpi/pricing.ts`, dono T3).
 *
 * Duas invariantes do contrato mandam aqui:
 *  1. NAO EXISTE COLUNA DE CUSTO. Nenhuma funcao pode devolver "margem".
 *  2. `preco_competidores` e snapshot de um unico dia — nada de serie temporal.
 */
import { describe, expect, it } from 'vitest';
import * as pricing from '@/lib/kpi/pricing';
import { enriquecer } from '@/lib/data/regras';
import type { Dataset } from '@/lib/data/types';
import { datasetPricing, datasetVazio } from './fixtures/dataset';

const ds = datasetPricing();
const vazio = datasetVazio();

describe('referencia de mercado', () => {
  const ref = pricing.referenciaMercado(ds);

  it('mediana de numero PAR de cotacoes e a media dos dois centrais', () => {
    expect(ref.get('q1')!.mediana).toBe(100); // (95 + 105) / 2
    expect(ref.get('q1')!.minimo).toBe(95);
    expect(ref.get('q1')!.maximo).toBe(105);
    expect(ref.get('q1')!.nConcorrentes).toBe(2);
  });

  it('mediana de numero IMPAR de cotacoes e o valor central', () => {
    expect(ref.get('q6')!.mediana).toBe(100); // [95, 100, 105]
    expect(ref.get('q6')!.nConcorrentes).toBe(3);
    expect(ref.get('q6')!.cotacaoUniforme).toBe(false);
  });

  it('marca cotacao uniforme — sinal de snapshot sintetico', () => {
    expect(ref.get('q1')!.cotacaoUniforme).toBe(false);
    expect(ref.get('q2')!.cotacaoUniforme).toBe(true);
  });

  it('produto sem cotacao nao entra na referencia', () => {
    expect(ref.has('q5')).toBe(false);
  });

  it('dataSnapshotCompetidores devolve so a data, sem deslocar o dia pelo fuso', () => {
    expect(pricing.dataSnapshotCompetidores(ds)).toBe('2026-01-11');
    expect(pricing.dataSnapshotCompetidores(vazio)).toBeNull();
  });
});

describe('indice competitivo', () => {
  const linhas = pricing.indicePorProduto(ds);
  const por = new Map(linhas.map((l) => [l.idProduto, l]));

  it('indice = preco de tabela / mediana do mercado', () => {
    expect(por.get('q1')!.indice).toBeCloseTo(1, 10);
    expect(por.get('q2')!.indice).toBeCloseTo(200 / 150, 10);
    expect(por.get('q3')!.indice).toBeCloseTo(0.5, 10);
  });

  it('classificar respeita a faixa de paridade de +-5%', () => {
    expect(pricing.classificar(1)).toBe('faixa');
    expect(pricing.classificar(1 + pricing.FAIXA_PARIDADE)).toBe('faixa');
    expect(pricing.classificar(1 - pricing.FAIXA_PARIDADE)).toBe('faixa');
    expect(pricing.classificar(1.051)).toBe('acima');
    expect(pricing.classificar(0.949)).toBe('abaixo');
    expect(por.get('q1')!.posicao).toBe('faixa');
    expect(por.get('q2')!.posicao).toBe('acima');
    expect(por.get('q3')!.posicao).toBe('abaixo');
  });

  it('produto sem cotacao fica de fora e conta como semCobertura', () => {
    expect(por.has('q5')).toBe(false);
    const geral = pricing.posicionamentoGeral(ds);
    expect(geral.semCobertura).toBe(ds.produtos.length - linhas.length);
    expect(geral.semCobertura).toBe(1);
  });

  it('as tres posicoes somam o total de produtos cobertos', () => {
    const g = pricing.posicionamentoGeral(ds);
    expect(g.acima + g.faixa + g.abaixo).toBe(g.total);
    expect(g.total).toBe(linhas.length);
  });

  it('produto sem venda tem precoPraticadoMedio null, nunca 0 nem NaN', () => {
    expect(por.get('q4')!.unidades).toBe(0);
    expect(por.get('q4')!.precoPraticadoMedio).toBeNull();
  });

  it('precoPraticadoMedio = receita / unidades quando ha giro', () => {
    const q1 = por.get('q1')!;
    // d01: 1x100 + d02: 2x90 + d06: 1x110 = 390 em 4 unidades
    expect(q1.unidades).toBe(4);
    expect(q1.receita).toBe(390);
    expect(q1.precoPraticadoMedio).toBeCloseTo(390 / 4, 10);
  });

  it('marca como anomalo so quem tem cotacao uniforme E indice >= 1,5', () => {
    expect(por.get('q4')!.anomalo).toBe(true); // 300 / 100 = 3, cotacao uniforme
    expect(por.get('q2')!.anomalo).toBe(false); // uniforme, mas indice 1,33
    expect(por.get('q1')!.anomalo).toBe(false);

    const anomalias = pricing.anomaliasCompetitivas(ds);
    expect(anomalias.map((a) => a.categoria)).toEqual(['Casa']);
    expect(anomalias[0].nProdutos).toBe(1);
    expect(anomalias[0].indiceMedio).toBeCloseTo(3, 10);
  });

  it('posicionamento por categoria fecha com o total de cada categoria', () => {
    for (const c of pricing.posicionamentoPorCategoria(ds)) {
      expect(c.acima + c.faixa + c.abaixo).toBe(c.nProdutos);
    }
    const soma = pricing.posicionamentoPorCategoria(ds).reduce((s, c) => s + c.nProdutos, 0);
    expect(soma).toBe(linhas.length);
  });

  it('com base vazia nada estoura', () => {
    expect(pricing.indicePorProduto(vazio)).toEqual([]);
    const g = pricing.posicionamentoGeral(vazio);
    expect(g.total).toBe(0);
    expect(g.indiceMediano).toBe(0);
    expect(Number.isFinite(g.indiceMediano)).toBe(true);
  });
});

describe('erosao de desconto', () => {
  const linhas = enriquecer(ds.vendas, ds.produtos);
  const m = pricing.metricasErosao(linhas);

  it('receita praticada e receita de tabela batem com o calculo manual', () => {
    expect(m.receitaPraticada).toBe(820);
    expect(m.receitaTabela).toBe(850);
  });

  it('erosao = receita de tabela - receita praticada', () => {
    expect(m.erosao).toBe(30);
    expect(m.erosao).toBeCloseTo(m.receitaTabela - m.receitaPraticada, 10);
  });

  it('realizacao = praticada / tabela, sempre finita', () => {
    expect(m.realizacao).toBeCloseTo(820 / 850, 10);
    expect(Number.isFinite(m.realizacao)).toBe(true);
    expect(pricing.metricasErosao([]).realizacao).toBe(0);
  });

  it('conta so as linhas realmente descontadas, acima da tolerancia', () => {
    expect(m.linhas).toBe(6);
    expect(m.pctLinhasComDesconto).toBeCloseTo(3 / 6, 10);
    expect(m.descontoMedioQuandoHa).toBeCloseTo((0.1 + 0.05 + 0.2) / 3, 10);
  });

  it('venda ACIMA da tabela nao vira desconto negativo', () => {
    // d06 saiu a 110 com tabela 100: nao pode entrar na media de desconto.
    expect(m.descontoMedioQuandoHa).toBeGreaterThan(0);
    const r = pricing.resumoPricing(ds);
    expect(r.linhasAcimaTabela).toBe(1);
    expect(r.valorAcimaTabela).toBeCloseTo(10, 10);
  });

  it('a erosao por categoria/canal/marca soma a erosao total', () => {
    for (const cortes of [
      pricing.erosaoPorCategoria(ds),
      pricing.erosaoPorCanal(ds),
      pricing.realizacaoPorMarca(ds),
    ]) {
      expect(cortes.reduce((s, c) => s + c.erosao, 0)).toBeCloseTo(m.erosao, 8);
      expect(cortes.reduce((s, c) => s + c.receitaPraticada, 0)).toBeCloseTo(m.receitaPraticada, 8);
      expect(cortes.reduce((s, c) => s + c.linhas, 0)).toBe(m.linhas);
    }
  });

  it('os cortes vem ordenados pela maior erosao (onde esta o dinheiro)', () => {
    const cortes = pricing.erosaoPorCategoria(ds);
    for (let i = 1; i < cortes.length; i += 1) {
      expect(cortes[i - 1].erosao).toBeGreaterThanOrEqual(cortes[i].erosao);
    }
  });

  it('linha cujo produto nao tem preco de tabela fica de fora', () => {
    const semPreco = {
      ...ds,
      produtos: ds.produtos.map((p) => (p.id_produto === 'q3' ? { ...p, preco_atual: null } : p)),
    };
    const semQ3 = pricing.metricasErosao(enriquecer(semPreco.vendas, semPreco.produtos));
    expect(semQ3.linhas).toBe(m.linhas - 2); // d04 e d05 saem
  });
});

describe('regra das orfas dentro de pricing', () => {
  it('a venda orfa NAO entra em nenhum corte por produto', () => {
    const orfa = ds.vendas.find((v) => v.id_produto === 'q999')!;
    expect(orfa.quantidade * orfa.preco_unitario).toBe(4995); // valor alto de proposito

    const m = pricing.metricasErosao(enriquecer(ds.vendas, ds.produtos));
    expect(m.receitaPraticada).toBe(820); // sem os 4995 da orfa
    expect(m.linhas).toBe(ds.vendas.length - 1);

    const porProduto = pricing.indicePorProduto(ds).map((l) => l.idProduto);
    expect(porProduto).not.toContain('q999');

    const unidadesNosCortes = pricing.erosaoPorCategoria(ds).reduce((s, c) => s + c.unidades, 0);
    expect(unidadesNosCortes).toBe(m.unidades);
    expect(unidadesNosCortes).not.toBe(m.unidades + orfa.quantidade);
  });

  it('a orfa tambem nao aparece na dispersao nem nas faixas de desconto', () => {
    const nomes = pricing.dispersaoDescontoVolume(ds, 9).flatMap((s) => s.pontos.map((p) => p.nome));
    expect(nomes.some((n) => n.includes('999'))).toBe(false);

    const faixas = pricing.elasticidadePorFaixa(ds);
    expect(faixas.reduce((s, f) => s + f.linhas, 0)).toBe(ds.vendas.length - 1);
  });
});

describe('elasticidade aparente por faixa de desconto', () => {
  const faixas = pricing.elasticidadePorFaixa(ds);

  it('devolve as 5 faixas sempre, na mesma ordem — a cor segue a faixa', () => {
    expect(faixas.map((f) => f.faixa)).toEqual(['Sem desconto', 'Até 5%', '5–10%', '10–15%', 'Acima de 15%']);
    expect(faixas.map((f) => f.ordem)).toEqual([0, 1, 2, 3, 4]);
  });

  it('REGRESSAO: desconto redondo cai na faixa QUE O NOMEIA, nao no vizinho por float', () => {
    /**
     * O bug que a renderizacao pegou e os testes nao: 958 das 1.159 linhas
     * descontadas desta base saem em exatamente 5%, 10% ou 15% — todo o volume
     * fica EM CIMA da fronteira. Com corte exclusivo (`d < limite`), de que lado
     * cada degrau cai passa a depender de IEEE-754, e o resultado diverge do
     * mesmo calculo feito em SQL:
     *   1 - 95/100 = 0.050000000000000044  -> escapava de "Até 5%" para cima
     *   1 - 90/100 = 0.09999999999999998   -> ficava em "5–10%" por baixo
     *   1 - 85/100 = 0.15000000000000002   -> escapava de "10–15%" para "Acima de 15%"
     * Dois dos tres degraus caiam na faixa errada, e o <Insight> de fechamento
     * recomendava cortar a faixa errada com o valor errado.
     */
    const linha = (id: string, pu: number) => ({
      id_venda: id, data_venda: '2026-01-05T00:00:00Z', id_cliente: 'c1',
      id_produto: 'f1', canal_venda: 'ecommerce' as const, quantidade: 1, preco_unitario: pu,
    });
    const degraus: Dataset = {
      produtos: [{ id_produto: 'f1', nome_produto: 'F1', categoria: 'Cat', marca: 'M', preco_atual: 100, data_criacao: null }],
      clientes: [],
      competidores: [],
      vendas: [linha('cinco', 95), linha('dez', 90), linha('quinze', 85)],
    };

    // confirma que o fixture reproduz mesmo a imprecisao de ponto flutuante
    expect(1 - 95 / 100).not.toBe(0.05);
    expect(1 - 90 / 100).not.toBe(0.1);
    expect(1 - 85 / 100).not.toBe(0.15);

    const porFaixa = new Map(
      pricing.elasticidadePorFaixa(degraus).map((f) => [f.faixa, f.linhas]),
    );
    expect(porFaixa.get('Até 5%')).toBe(1);
    expect(porFaixa.get('5–10%')).toBe(1);
    expect(porFaixa.get('10–15%')).toBe(1);
    expect(porFaixa.get('Sem desconto')).toBe(0);
    expect(porFaixa.get('Acima de 15%')).toBe(0);
  });

  it('a tolerancia absorve centavo arredondado, mas nao um degrau inteiro', () => {
    const linha = (id: string, tabela: number, pu: number, prod: string) => ({
      id_venda: id, data_venda: '2026-01-05T00:00:00Z', id_cliente: 'c1',
      id_produto: prod, canal_venda: 'ecommerce' as const, quantidade: 1, preco_unitario: pu,
    });
    const base: Dataset = {
      produtos: [
        { id_produto: 'g1', nome_produto: 'G1', categoria: 'C', marca: 'M', preco_atual: 10000, data_criacao: null },
      ],
      clientes: [],
      competidores: [],
      vendas: [
        linha('centavo', 10000, 8499, 'g1'), // 15,01% — 15% com centavo arredondado
        linha('acima', 10000, 8000, 'g1'), // 20% — degrau proprio, tem de subir
      ],
    };
    const porFaixa = new Map(
      pricing.elasticidadePorFaixa(base).map((f) => [f.faixa, f.linhas]),
    );
    expect(porFaixa.get('10–15%')).toBe(1); // o 15,01%
    expect(porFaixa.get('Acima de 15%')).toBe(1); // o 20%
  });

  it('as faixas particionam as linhas: nenhuma perdida, nenhuma contada duas vezes', () => {
    const total = pricing.metricasErosao(enriquecer(ds.vendas, ds.produtos));
    expect(faixas.reduce((s, f) => s + f.linhas, 0)).toBe(total.linhas);
    expect(faixas.reduce((s, f) => s + f.unidades, 0)).toBe(total.unidades);
    expect(faixas.reduce((s, f) => s + f.receita, 0)).toBeCloseTo(total.receitaPraticada, 8);
    expect(faixas.reduce((s, f) => s + f.erosao, 0)).toBeCloseTo(total.erosao, 8);
  });

  it('venda no preco de tabela e venda ACIMA da tabela caem em "Sem desconto"', () => {
    expect(faixas[0].linhas).toBe(3); // d01 e d04 na tabela, d06 acima dela
  });

  it('unidadesPorPedido nunca e NaN em faixa vazia', () => {
    for (const f of faixas) expect(Number.isFinite(f.unidadesPorPedido)).toBe(true);
  });
});

describe('degraus de desconto', () => {
  /**
   * Politica comercial (botao de desconto predefinido) deixa o desconto EMPILHADO
   * em poucos valores redondos, em vez de espalhado. Conferido na base real com
   * arredondamento a 3 casas: 5% -> 464 linhas, 10% -> 413, 15% -> 282; as tres
   * somam 1.159, que e o total de linhas descontadas. Aqui o fixture reproduz a
   * forma, nao os numeros.
   */
  const linha = (id: string, pu: number, prod: string) => ({
    id_venda: id, data_venda: '2026-01-05T00:00:00Z', id_cliente: 'c1',
    id_produto: prod, canal_venda: 'ecommerce' as const, quantidade: 1, preco_unitario: pu,
  });
  const empilhado: Dataset = {
    produtos: [{ id_produto: 'h1', nome_produto: 'H1', categoria: 'C', marca: 'M', preco_atual: 100, data_criacao: null }],
    clientes: [],
    competidores: [],
    vendas: [
      linha('d10a', 90, 'h1'), linha('d10b', 90, 'h1'), linha('d10c', 90, 'h1'),
      linha('d5a', 95, 'h1'), linha('d5b', 95, 'h1'),
      linha('d7', 93, 'h1'), // degrau solitario: abaixo do minimo de linhas
      linha('cheio', 100, 'h1'), // sem desconto: nao e degrau
    ],
  };

  it('agrupa os descontos identicos e ignora a imprecisao de float', () => {
    const degraus = pricing.degrausDeDesconto(empilhado, 2);
    const por = new Map(degraus.map((d) => [d.desconto, d.linhas]));
    expect(por.get(0.1)).toBe(3);
    expect(por.get(0.05)).toBe(2);
  });

  it('vem ordenado por volume de linhas e respeita o minimo pedido', () => {
    const degraus = pricing.degrausDeDesconto(empilhado, 2);
    expect(degraus.map((d) => d.desconto)).toEqual([0.1, 0.05]);
    expect(degraus.every((d) => d.linhas >= 2)).toBe(true);
    expect(degraus.map((d) => d.desconto)).not.toContain(0.07); // 1 linha so
    expect(pricing.degrausDeDesconto(empilhado, 1).map((d) => d.desconto)).toContain(0.07);
  });

  it('linha sem desconto nunca vira degrau', () => {
    const todos = pricing.degrausDeDesconto(empilhado, 1);
    expect(todos.map((d) => d.desconto)).not.toContain(0);
    expect(todos.reduce((s, d) => s + d.linhas, 0)).toBe(empilhado.vendas.length - 1);
  });

  it('a erosao de cada degrau bate com o calculo manual', () => {
    for (const d of pricing.degrausDeDesconto(empilhado, 1)) {
      const esperado = empilhado.vendas
        .filter((v) => Math.abs(1 - v.preco_unitario / 100 - d.desconto) < 1e-9)
        .reduce((s, v) => s + v.quantidade * (100 - v.preco_unitario), 0);
      expect(d.erosao).toBeCloseTo(esperado, 8);
    }
  });

  it('a soma da erosao dos degraus nao passa da erosao total', () => {
    const total = pricing.metricasErosao(enriquecer(empilhado.vendas, empilhado.produtos)).erosao;
    const soma = pricing.degrausDeDesconto(empilhado, 1).reduce((s, d) => s + d.erosao, 0);
    expect(soma).toBeCloseTo(total, 8);
  });

  it('base sem desconto nenhum devolve lista vazia, nao um degrau zero', () => {
    const semDesconto: Dataset = { ...empilhado, vendas: [linha('cheio', 100, 'h1')] };
    expect(pricing.degrausDeDesconto(semDesconto, 1)).toEqual([]);
    expect(pricing.degrausDeDesconto(vazio)).toEqual([]);
  });

  it('a orfa nao entra nos degraus — corte por produto', () => {
    expect(pricing.degrausDeDesconto(ds, 1).reduce((s, d) => s + d.linhas, 0))
      .toBeLessThanOrEqual(ds.vendas.length - 1);
  });
});

describe('dispersao desconto x volume', () => {
  it('respeita o teto de 3 series do scatter (ALL_PAIRS_SERIES_CAP)', () => {
    const series = pricing.dispersaoDescontoVolume(ds);
    expect(series.length).toBeLessThanOrEqual(3);
  });

  it('nenhum ponto e perdido ao dobrar o resto em "Outras categorias"', () => {
    const series = pricing.dispersaoDescontoVolume(ds, 2);
    const nomes = series.flatMap((s) => s.pontos.map((p) => p.nome));
    expect(new Set(nomes).size).toBe(nomes.length);
    expect(series.length).toBeLessThanOrEqual(2);
  });

  it('o desconto do ponto e ponderado por volume, nao a media simples', () => {
    const series = pricing.dispersaoDescontoVolume(ds, 9);
    const q1 = series.flatMap((s) => s.pontos).find((p) => p.nome === 'Q1 paridade')!;
    // praticada 390 / tabela 400 -> desconto ponderado 2,5%
    expect(q1.desconto).toBeCloseTo(1 - 390 / 400, 10);
    expect(q1.unidades).toBe(4);
  });
});

describe('decomposicao preco medio: mix de produto vs. politica de desconto', () => {
  /**
   * Cenario construido para isolar UM efeito por canal:
   *  - E-commerce: mesmo desconto nas duas metades (R = 1 sempre), mas o mix
   *    muda de um item de R$ 100 para um de R$ 200 -> todo o delta e MIX.
   *  - Loja fisica: mesmo produto nas duas metades, preco praticado cai de 100
   *    para 80 -> todo o delta e DESCONTO.
   * Se a identidade P1-P0 = R0*(T1-T0) + T1*(R1-R0) for implementada errada,
   * um dos dois casos vaza para a outra parcela.
   */
  const isolado: Dataset = {
    produtos: [
      { id_produto: 'm1', nome_produto: 'M1', categoria: 'Cat', marca: 'Marca', preco_atual: 100, data_criacao: null },
      { id_produto: 'm2', nome_produto: 'M2', categoria: 'Cat', marca: 'Marca', preco_atual: 200, data_criacao: null },
    ],
    clientes: [],
    competidores: [],
    vendas: [
      { id_venda: 'e1', data_venda: '2026-01-02T00:00:00Z', id_cliente: 'c1', id_produto: 'm1', canal_venda: 'ecommerce', quantidade: 1, preco_unitario: 100 },
      { id_venda: 'e2', data_venda: '2026-01-10T00:00:00Z', id_cliente: 'c1', id_produto: 'm2', canal_venda: 'ecommerce', quantidade: 1, preco_unitario: 200 },
      { id_venda: 'l1', data_venda: '2026-01-02T00:00:00Z', id_cliente: 'c1', id_produto: 'm1', canal_venda: 'loja_fisica', quantidade: 1, preco_unitario: 100 },
      { id_venda: 'l2', data_venda: '2026-01-10T00:00:00Z', id_cliente: 'c1', id_produto: 'm1', canal_venda: 'loja_fisica', quantidade: 1, preco_unitario: 80 },
    ],
  };

  it('AS PARCELAS SOMAM O DELTA SEM RESIDUO — e isso que separa decomposicao de numero inventado', () => {
    for (const base of [ds, isolado]) {
      for (const c of pricing.decomposicaoPrecoPorCanal(base)) {
        expect(c.efeitoMix + c.efeitoDesconto).toBeCloseTo(c.delta, 10);
        expect(c.delta).toBeCloseTo(c.precoMedioRecente - c.precoMedioAnterior, 10);
      }
    }
  });

  it('mix puro: desconto igual nas duas metades poe TODO o delta em efeitoMix', () => {
    const ecom = pricing.decomposicaoPrecoPorCanal(isolado).find((c) => c.canal === 'E-commerce')!;
    expect(ecom.razaoAnterior).toBeCloseTo(1, 10);
    expect(ecom.razaoRecente).toBeCloseTo(1, 10);
    expect(ecom.delta).toBeCloseTo(100, 10);
    expect(ecom.efeitoMix).toBeCloseTo(100, 10);
    expect(ecom.efeitoDesconto).toBeCloseTo(0, 10);
  });

  it('desconto puro: mesmo produto nas duas metades poe TODO o delta em efeitoDesconto', () => {
    const loja = pricing.decomposicaoPrecoPorCanal(isolado).find((c) => c.canal === 'Loja fisica')!;
    expect(loja.tabelaMediaAnterior).toBeCloseTo(loja.tabelaMediaRecente, 10);
    expect(loja.delta).toBeCloseTo(-20, 10);
    expect(loja.efeitoMix).toBeCloseTo(0, 10);
    expect(loja.efeitoDesconto).toBeCloseTo(-20, 10);
  });

  it('devolve SEMPRE os dois canais, na mesma ordem — a cor segue a entidade', () => {
    expect(pricing.decomposicaoPrecoPorCanal(ds).map((c) => c.canal)).toEqual(['E-commerce', 'Loja fisica']);
    expect(pricing.decomposicaoPrecoPorCanal(vazio).map((c) => c.canal)).toEqual(['E-commerce', 'Loja fisica']);
  });

  it('metade vazia nao gera NaN em nenhum campo numerico', () => {
    const soUmLado: Dataset = { ...isolado, vendas: [isolado.vendas[0], isolado.vendas[2]] };
    for (const base of [vazio, soUmLado]) {
      for (const c of pricing.decomposicaoPrecoPorCanal(base)) {
        for (const [k, v] of Object.entries(c)) {
          if (typeof v === 'number') expect(Number.isFinite(v), `${c.canal}.${k} nao e finito`).toBe(true);
        }
      }
    }
  });

  it('media simples e ponderada DIVERGEM quando o desconto muda de alvo', () => {
    /**
     * O caso que fez o lider e T3 chegarem a numeros diferentes — os dois certos.
     * Duas linhas por metade, uma de tabela R$ 100 e outra de R$ 1.000:
     *   metade anterior: 10% de desconto no item BARATO  -> simples 0,95 | ponderada 1090/1100
     *   metade recente:  10% de desconto no item CARO    -> simples 0,95 | ponderada 1000/1100
     * A media simples por linha nao se mexe; a ponderada por receita cai 8 pp.
     * Nenhuma das duas esta errada: o desconto mudou de ALVO, e `tabelaMedia-
     * Descontadas` e o campo que torna isso visivel em vez de virar contradicao
     * entre a aba de Pricing e a visao geral.
     */
    const alvoMudou: Dataset = {
      produtos: [
        { id_produto: 'barato', nome_produto: 'Barato', categoria: 'Cat', marca: 'M', preco_atual: 100, data_criacao: null },
        { id_produto: 'caro', nome_produto: 'Caro', categoria: 'Cat', marca: 'M', preco_atual: 1000, data_criacao: null },
      ],
      clientes: [],
      competidores: [],
      vendas: [
        { id_venda: 'a1', data_venda: '2026-01-02T00:00:00Z', id_cliente: 'c1', id_produto: 'barato', canal_venda: 'ecommerce', quantidade: 1, preco_unitario: 90 },
        { id_venda: 'a2', data_venda: '2026-01-02T00:00:00Z', id_cliente: 'c1', id_produto: 'caro', canal_venda: 'ecommerce', quantidade: 1, preco_unitario: 1000 },
        { id_venda: 'r1', data_venda: '2026-01-10T00:00:00Z', id_cliente: 'c1', id_produto: 'barato', canal_venda: 'ecommerce', quantidade: 1, preco_unitario: 100 },
        { id_venda: 'r2', data_venda: '2026-01-10T00:00:00Z', id_cliente: 'c1', id_produto: 'caro', canal_venda: 'ecommerce', quantidade: 1, preco_unitario: 900 },
      ],
    };

    const ecom = pricing.decomposicaoPrecoPorCanal(alvoMudou).find((c) => c.canal === 'E-commerce')!;

    // media simples por linha: identica nas duas metades
    expect(ecom.realizacaoSimplesAnterior).toBeCloseTo(0.95, 10);
    expect(ecom.realizacaoSimplesRecente).toBeCloseTo(0.95, 10);
    expect(ecom.realizacaoSimplesRecente).toBeCloseTo(ecom.realizacaoSimplesAnterior, 10);

    // ponderada por receita: despenca
    expect(ecom.realizacaoAnterior).toBeCloseTo(1090 / 1100, 10);
    expect(ecom.realizacaoRecente).toBeCloseTo(1000 / 1100, 10);
    expect(ecom.realizacaoAnterior - ecom.realizacaoRecente).toBeGreaterThan(0.05);

    // e o campo que explica a divergencia: o alvo do desconto mudou de faixa
    expect(ecom.tabelaMediaDescontadasAnterior).toBeCloseTo(100, 10);
    expect(ecom.tabelaMediaDescontadasRecente).toBeCloseTo(1000, 10);
  });

  it('as duas leituras de realizacao convivem e ficam em faixa plausivel', () => {
    for (const c of pricing.decomposicaoPrecoPorCanal(ds)) {
      for (const r of [c.realizacaoAnterior, c.realizacaoRecente, c.realizacaoSimplesAnterior, c.realizacaoSimplesRecente]) {
        expect(Number.isFinite(r)).toBe(true);
        expect(r).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('tabelaMediaDescontadas e 0 quando nenhuma linha saiu com desconto', () => {
    const ecom = pricing.decomposicaoPrecoPorCanal(isolado).find((c) => c.canal === 'E-commerce')!;
    expect(ecom.tabelaMediaDescontadasAnterior).toBe(0);
    expect(ecom.tabelaMediaDescontadasRecente).toBe(0);
  });

  it('o corte usado e o da janela do PROJETO, nao o do subconjunto filtrado', () => {
    // A orfa de q999 esta no meio da janela; se o corte saisse do subconjunto
    // filtrado (que a descarta), as metades mudariam quando ela fosse removida.
    const semOrfa = { ...ds, vendas: ds.vendas.filter((v) => v.id_produto !== 'q999') };
    const com = pricing.decomposicaoPrecoPorCanal(ds);
    const sem = pricing.decomposicaoPrecoPorCanal(semOrfa);
    for (let i = 0; i < com.length; i += 1) {
      expect(sem[i].linhasAnterior).toBe(com[i].linhasAnterior);
      expect(sem[i].linhasRecente).toBe(com[i].linhasRecente);
      expect(sem[i].delta).toBeCloseTo(com[i].delta, 10);
    }
  });
});

describe('oportunidades', () => {
  const o = pricing.oportunidades(ds);

  it('exclui produtos com snapshot competitivo anomalo', () => {
    const ids = [...o.carosSemGiro, ...o.baratosComGiro].map((l) => l.idProduto);
    expect(ids).not.toContain('q4');
  });

  it('carosSemGiro so traz quem esta acima da faixa', () => {
    for (const l of o.carosSemGiro) expect(l.posicao).toBe('acima');
  });

  it('baratosComGiro so traz quem esta abaixo da faixa, com valor positivo', () => {
    for (const l of o.baratosComGiro) {
      expect(l.posicao).toBe('abaixo');
      expect(l.valor).toBeGreaterThan(0);
      expect(l.valor).toBeCloseTo((l.medianaMercado - l.precoTabela) * l.unidades, 10);
    }
  });

  it('o potencial e a soma de TODOS os baratos com giro, nao so dos exibidos', () => {
    expect(o.potencialBaratosComGiro).toBeGreaterThanOrEqual(
      o.baratosComGiro.reduce((s, l) => s + l.valor, 0) - 1e-9,
    );
  });

  it('respeita o limite pedido', () => {
    const curto = pricing.oportunidades(ds, 1);
    expect(curto.carosSemGiro.length).toBeLessThanOrEqual(1);
    expect(curto.baratosComGiro.length).toBeLessThanOrEqual(1);
  });
});

describe('resumo de abertura', () => {
  const r = pricing.resumoPricing(ds);

  it('os deltas 15d sao finitos mesmo com metade vazia', () => {
    for (const d of [r.deltaRealizacao, r.deltaErosao, r.deltaPctComDesconto]) {
      expect(Number.isFinite(d)).toBe(true);
    }
    const so = { ...ds, vendas: [ds.vendas[0]] };
    const rr = pricing.resumoPricing(so);
    expect(Number.isFinite(rr.deltaErosao)).toBe(true);
  });

  it('o total do resumo e o mesmo objeto de metricasErosao da janela inteira', () => {
    const m = pricing.metricasErosao(enriquecer(ds.vendas, ds.produtos));
    expect(r.total.erosao).toBeCloseTo(m.erosao, 10);
    expect(r.total.receitaPraticada).toBeCloseTo(m.receitaPraticada, 10);
  });

  it('com base vazia devolve zeros, sem NaN', () => {
    const z = pricing.resumoPricing(vazio);
    expect(z.total.erosao).toBe(0);
    expect(z.total.realizacao).toBe(0);
    expect(z.linhasAcimaTabela).toBe(0);
  });
});

describe('contrato: nenhuma margem, nenhum custo', () => {
  it('nenhuma funcao exportada devolve campo com nome de margem ou custo', () => {
    const amostras: unknown[] = [
      pricing.resumoPricing(ds),
      pricing.posicionamentoGeral(ds),
      pricing.indicePorProduto(ds),
      pricing.erosaoPorCategoria(ds),
      pricing.elasticidadePorFaixa(ds),
      pricing.oportunidades(ds),
    ];
    const chaves = new Set<string>();
    const coletar = (v: unknown) => {
      if (Array.isArray(v)) return v.forEach(coletar);
      if (v && typeof v === 'object') {
        for (const [k, sub] of Object.entries(v)) {
          chaves.add(k);
          coletar(sub);
        }
      }
    };
    amostras.forEach(coletar);
    for (const k of chaves) {
      expect(/margem|custo|cmv|lucro/i.test(k), `campo "${k}" sugere margem real, que a base nao tem`).toBe(false);
    }
  });
});

describe('pureza', () => {
  it('nenhuma funcao muta o dataset', () => {
    const antes = JSON.stringify(ds);
    pricing.indicePorProduto(ds);
    pricing.erosaoPorCategoria(ds);
    pricing.elasticidadePorFaixa(ds);
    pricing.dispersaoDescontoVolume(ds);
    pricing.oportunidades(ds);
    pricing.resumoPricing(ds);
    expect(JSON.stringify(ds)).toBe(antes);
  });

  it('duas chamadas identicas devolvem o mesmo resultado', () => {
    expect(JSON.stringify(pricing.resumoPricing(ds)))
      .toBe(JSON.stringify(pricing.resumoPricing(datasetPricing())));
  });
});
