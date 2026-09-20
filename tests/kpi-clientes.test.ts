/**
 * Testes da seção CLIENTES (`src/lib/kpi/clientes.ts`, dono T4).
 *
 * Invariantes do contrato que valem aqui:
 *  - o corte por CLIENTE inclui as orfas (a FK de cliente e valida), ao
 *    contrario do corte por produto;
 *  - a janela e de 30 dias: nao existe retencao, churn nem LTV;
 *  - todo agrupamento devolve o `n` do grupo, porque sao 50 clientes.
 */
import { describe, expect, it } from 'vitest';
import * as clientes from '@/lib/kpi/clientes';
import { receitaTotal } from '@/lib/data/regras';
import type { Dataset } from '@/lib/data/types';
import {
  RECEITA_TOTAL_FIXTURE,
  dataset,
  datasetVazio,
  somaManual,
} from './fixtures/dataset';

const ds = dataset();
const vazio = datasetVazio();

describe('metricas por cliente', () => {
  const metricas = clientes.metricasPorCliente(ds);

  it('a receita por cliente soma a receita TOTAL — orfas incluidas', () => {
    expect(metricas.reduce((s, m) => s + m.receita, 0)).toBeCloseTo(RECEITA_TOTAL_FIXTURE, 10);
  });

  it('a receita de cada cliente bate com o calculo independente', () => {
    for (const m of metricas) {
      expect(m.receita).toBeCloseTo(somaManual(ds.vendas.filter((v) => v.id_cliente === m.id_cliente)), 10);
      expect(m.compras).toBe(ds.vendas.filter((v) => v.id_cliente === m.id_cliente).length);
    }
  });

  it('os dois canais somam a receita e as compras do cliente', () => {
    for (const m of metricas) {
      expect(m.receitaEcommerce + m.receitaLoja).toBeCloseTo(m.receita, 10);
      expect(m.comprasEcommerce + m.comprasLoja).toBe(m.compras);
      expect(m.shareEcommerce).toBeGreaterThanOrEqual(0);
      expect(m.shareEcommerce).toBeLessThanOrEqual(1);
    }
  });

  it('ticketMedio = receita / compras', () => {
    for (const m of metricas) expect(m.ticketMedio).toBeCloseTo(m.receita / m.compras, 10);
  });

  it('recencia e medida contra o FIM da janela, nunca contra o relogio', () => {
    for (const m of metricas) {
      expect(m.recenciaDias).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(m.recenciaDias)).toBe(true);
    }
    // quem comprou no ultimo dia da janela tem recencia zero
    expect(Math.min(...metricas.map((m) => m.recenciaDias))).toBe(0);
  });

  it('cliente sem cadastro na tabela nao some e recebe rotulo neutro', () => {
    const semUf = metricas.find((m) => m.id_cliente === 'c3')!;
    expect(semUf.estado).toBe('Sem UF');
    expect(semUf.safra).toBeNull();
  });

  it('vem ordenado por receita decrescente', () => {
    for (let i = 1; i < metricas.length; i += 1) {
      expect(metricas[i - 1].receita).toBeGreaterThanOrEqual(metricas[i].receita);
    }
  });

  it('com base vazia devolve lista vazia sem estourar', () => {
    expect(clientes.metricasPorCliente(vazio)).toEqual([]);
  });
});

describe('resumo de abertura', () => {
  const r = clientes.resumoClientes(ds);

  it('ativos = clientes com ao menos uma compra; taxa de ativacao = ativos / cadastrados', () => {
    expect(r.ativos).toBe(new Set(ds.vendas.map((v) => v.id_cliente)).size);
    expect(r.cadastrados).toBe(ds.clientes.length);
    expect(r.taxaAtivacao).toBeCloseTo(r.ativos / r.cadastrados, 10);
  });

  it('gastoMedio, comprasPorCliente e ticketMedio batem com o calculo manual', () => {
    expect(r.gastoMedio).toBeCloseTo(RECEITA_TOTAL_FIXTURE / r.ativos, 10);
    expect(r.comprasPorCliente).toBeCloseTo(ds.vendas.length / r.ativos, 10);
    expect(r.ticketMedio).toBeCloseTo(RECEITA_TOTAL_FIXTURE / ds.vendas.length, 10);
  });

  it('todos os deltas sao finitos', () => {
    for (const d of [r.deltaGastoMedio, r.deltaComprasPorCliente, r.deltaTicketMedio]) {
      expect(Number.isFinite(d)).toBe(true);
    }
  });

  it('com base vazia devolve zeros em vez de NaN', () => {
    const z = clientes.resumoClientes(vazio);
    for (const v of Object.values(z)) expect(Number.isFinite(v as number)).toBe(true);
    expect(z.ativos).toBe(0);
    expect(z.taxaAtivacao).toBe(0);
  });
});

describe('concentracao de receita', () => {
  const c = clientes.concentracaoDeReceita(ds);

  it('a curva tem um ponto por cliente ativo e termina em 100%', () => {
    expect(c.curva).toHaveLength(clientes.metricasPorCliente(ds).length);
    expect(c.curva[c.curva.length - 1].pctReceitaAcum).toBeCloseTo(100, 8);
    expect(c.curva[c.curva.length - 1].pctClientes).toBeCloseTo(100, 8);
  });

  it('a curva e monotonica crescente', () => {
    for (let i = 1; i < c.curva.length; i += 1) {
      expect(c.curva[i].pctReceitaAcum).toBeGreaterThanOrEqual(c.curva[i - 1].pctReceitaAcum);
    }
  });

  it('a linha de igualdade e a diagonal', () => {
    for (const p of c.curva) expect(p.igualdade).toBeCloseTo(p.pctClientes, 10);
  });

  it('o gini fica entre 0 e 1', () => {
    expect(c.gini).toBeGreaterThanOrEqual(0);
    expect(c.gini).toBeLessThan(1);
  });

  it('clientesParaMetadeDaReceita e o menor k que cruza 50%', () => {
    const k = c.clientesParaMetadeDaReceita;
    expect(c.curva[k - 1].pctReceitaAcum).toBeGreaterThanOrEqual(50);
    if (k > 1) expect(c.curva[k - 2].pctReceitaAcum).toBeLessThan(50);
  });

  it('com base vazia devolve tudo zerado', () => {
    const z = clientes.concentracaoDeReceita(vazio);
    expect(z.curva).toEqual([]);
    expect(z.gini).toBe(0);
    expect(z.indiceConcentracao).toBe(0);
  });
});

describe('segmentacao RFM', () => {
  const rfm = clientes.segmentacaoRFM(ds);

  it('todo cliente ativo recebe exatamente um segmento', () => {
    expect(rfm.clientes).toHaveLength(clientes.metricasPorCliente(ds).length);
    const soma = rfm.segmentos.reduce((s, g) => s + g.n, 0);
    expect(soma).toBe(rfm.clientes.length);
  });

  it('os segmentos particionam a receita: pctReceita soma 1', () => {
    expect(rfm.segmentos.reduce((s, g) => s + g.pctReceita, 0)).toBeCloseTo(1, 10);
    expect(rfm.segmentos.reduce((s, g) => s + g.receita, 0)).toBeCloseTo(RECEITA_TOTAL_FIXTURE, 8);
  });

  it('os scores ficam sempre em 1..3', () => {
    for (const c of rfm.clientes) {
      for (const s of [c.scoreRecencia, c.scoreFrequencia, c.scoreValor]) {
        expect(s).toBeGreaterThanOrEqual(1);
        expect(s).toBeLessThanOrEqual(3);
      }
    }
  });

  it('avisa quando a recencia nao discrimina — a janela e de 30 dias', () => {
    expect(typeof rfm.recenciaInformativa).toBe('boolean');
    expect(rfm.recenciaInformativa).toBe(rfm.amplitudeRecenciaDias >= 7);
  });

  it('nenhum rotulo de segmento sugere ciclo de vida (churn, perdido, reativado)', () => {
    for (const g of rfm.segmentos) {
      expect(/churn|perdid|reativ|retenc|ltv/i.test(`${g.nome} ${g.descricao}`)).toBe(false);
    }
  });
});

describe('cortes que precisam declarar o n do grupo', () => {
  it('comportamentoPorSafra particiona os clientes e marca amostra pequena', () => {
    const safras = clientes.comportamentoPorSafra(ds);
    const ativos = clientes.metricasPorCliente(ds).length;
    expect(safras.reduce((s, x) => s + x.n, 0)).toBe(ativos);
    expect(safras.reduce((s, x) => s + x.receita, 0)).toBeCloseTo(RECEITA_TOTAL_FIXTURE, 8);
    for (const s of safras) expect(s.amostraSuficiente).toBe(s.n >= 10);
    // cliente sem data_cadastro nao pode sumir do corte
    expect(safras.some((s) => s.ano === null && s.rotulo === 'Sem data de cadastro')).toBe(true);
  });

  it('perfilDeCanal particiona os clientes nos tres perfis', () => {
    const perfis = clientes.perfilDeCanal(ds);
    expect(perfis.map((p) => p.nome)).toEqual(['Somente ecommerce', 'Somente loja fisica', 'Omnichannel']);
    expect(perfis.reduce((s, p) => s + p.n, 0)).toBe(clientes.metricasPorCliente(ds).length);
    expect(perfis.reduce((s, p) => s + p.pctReceita, 0)).toBeCloseTo(1, 10);
    for (const p of perfis) {
      expect(Number.isFinite(p.ticketMedio)).toBe(true);
      expect(Number.isFinite(p.gastoMedio)).toBe(true);
    }
  });

  it('perfilDeCanal devolve os TRES baldes mesmo com n = 0 — a evidencia e o zero', () => {
    // Na base real os 50 clientes sao omnichannel e os grupos mono-canal ficam
    // vazios. Suprimir os zeros faria a pagina fingir um recorte que nao existe.
    const soOmni = {
      ...ds,
      vendas: ds.vendas.map((v, i) => ({
        ...v,
        id_cliente: 'c1',
        canal_venda: (i % 2 === 0 ? 'ecommerce' : 'loja_fisica') as 'ecommerce' | 'loja_fisica',
      })),
    };
    const perfis = clientes.perfilDeCanal(soOmni);
    expect(perfis).toHaveLength(3);
    expect(perfis.map((p) => p.nome)).toEqual(['Somente ecommerce', 'Somente loja fisica', 'Omnichannel']);
    expect(perfis.find((p) => p.nome === 'Omnichannel')!.n).toBe(1);
    expect(perfis.find((p) => p.nome === 'Somente ecommerce')!.n).toBe(0);
    expect(perfis.find((p) => p.nome === 'Somente loja fisica')!.n).toBe(0);
    // e os grupos vazios nao podem virar NaN
    for (const p of perfis) {
      expect(Number.isFinite(p.gastoMedio)).toBe(true);
      expect(Number.isFinite(p.ticketMedio)).toBe(true);
      expect(Number.isFinite(p.pctReceita)).toBe(true);
    }
  });

  it('recenciaInformativa so liga quando a amplitude de recencia chega a 7 dias', () => {
    // Enquanto a amplitude for pequena (na base real: 2 dias), o eixo R do RFM
    // nao separa ninguem e a pagina tem de apaga-lo.
    const curto = {
      ...ds,
      vendas: ds.vendas.map((v) => ({ ...v, data_venda: '2026-01-10T10:00:00Z' })),
    };
    const rfmCurto = clientes.segmentacaoRFM(curto);
    expect(rfmCurto.amplitudeRecenciaDias).toBeLessThan(7);
    expect(rfmCurto.recenciaInformativa).toBe(false);

    const longo = clientes.segmentacaoRFM(ds);
    expect(longo.recenciaInformativa).toBe(longo.amplitudeRecenciaDias >= 7);
  });

  it('intensidadeDeCanal cobre todo cliente exatamente uma vez', () => {
    const faixas = clientes.intensidadeDeCanal(ds);
    expect(faixas.reduce((s, f) => s + f.n, 0)).toBe(clientes.metricasPorCliente(ds).length);
    expect(faixas.reduce((s, f) => s + f.receita, 0)).toBeCloseTo(RECEITA_TOTAL_FIXTURE, 8);
    for (const f of faixas) expect(Number.isFinite(f.shareEcommerceMedio)).toBe(true);
  });

  it('intensidadeDeCanal: o share EXATAMENTE na fronteira cai na faixa que o rotulo promete', () => {
    /**
     * Mesma classe de defeito que T3 achou nas faixas de desconto de pricing: um
     * teste de particao/conservacao passa mesmo com o cliente no balde errado,
     * porque compara a implementacao com ela mesma. As fronteiras aqui sao 0,60
     * e 0,75, e os rotulos prometem "60% a 75%" e "75% ou mais" — ou seja,
     * fechadas EMBAIXO. Um cliente exatamente em 60% nao pode cair em
     * "ate 60% online".
     */
    const v = (id: string, cliente: string, canal: 'ecommerce' | 'loja_fisica', valor: number) => ({
      id_venda: id, data_venda: '2026-01-05T00:00:00Z', id_cliente: cliente,
      id_produto: 'p1', canal_venda: canal, quantidade: 1, preco_unitario: valor,
    });
    const fronteira: Dataset = {
      produtos: [{ id_produto: 'p1', nome_produto: 'P1', categoria: 'C', marca: 'M', preco_atual: 100, data_criacao: null }],
      clientes: [
        { id_cliente: 'exato60', nome_cliente: 'Exato 60', estado: 'SP', pais: 'BR', data_cadastro: '2025-01-01' },
        { id_cliente: 'exato75', nome_cliente: 'Exato 75', estado: 'SP', pais: 'BR', data_cadastro: '2025-01-01' },
        { id_cliente: 'abaixo', nome_cliente: 'Abaixo', estado: 'SP', pais: 'BR', data_cadastro: '2025-01-01' },
      ],
      competidores: [],
      vendas: [
        v('a1', 'exato60', 'ecommerce', 60), v('a2', 'exato60', 'loja_fisica', 40),
        v('b1', 'exato75', 'ecommerce', 75), v('b2', 'exato75', 'loja_fisica', 25),
        v('c1', 'abaixo', 'ecommerce', 59), v('c2', 'abaixo', 'loja_fisica', 41),
      ],
    };

    const shares = new Map(
      clientes.metricasPorCliente(fronteira).map((m) => [m.id_cliente, m.shareEcommerce]),
    );
    expect(shares.get('exato60')).toBe(0.6);
    expect(shares.get('exato75')).toBe(0.75);

    const porFaixa = new Map(clientes.intensidadeDeCanal(fronteira).map((f) => [f.nome, f.n]));
    expect(porFaixa.get('Loja pesa mais')).toBe(1); // so o de 59%
    expect(porFaixa.get('Equilibrados')).toBe(1); // o de exatamente 60%
    expect(porFaixa.get('Digitais')).toBe(1); // o de exatamente 75%
  });

  it('distribuicaoGeografica nao perde receita e nomeia a UF ausente', () => {
    const linhas = clientes.distribuicaoGeografica(ds).estados;
    expect(linhas.reduce((s, e) => s + e.receita, 0)).toBeCloseTo(RECEITA_TOTAL_FIXTURE, 8);
    expect(linhas.reduce((s, e) => s + e.clientes, 0)).toBe(clientes.metricasPorCliente(ds).length);
    expect(linhas.some((e) => e.estado === 'Sem UF')).toBe(true);
  });
});

describe('migracao de canal entre as duas metades', () => {
  const m = clientes.migracaoDeCanal(ds);

  it('so entra cliente com receita nos DOIS periodos', () => {
    for (const c of m.clientes) {
      expect(Number.isFinite(c.shareAnterior)).toBe(true);
      expect(Number.isFinite(c.shareRecente)).toBe(true);
    }
  });

  it('deltaPP = shareRecente - shareAnterior, em pontos percentuais', () => {
    for (const c of m.clientes) expect(c.deltaPP).toBeCloseTo(c.shareRecente - c.shareAnterior, 8);
  });

  it('as contagens derivam da propria lista', () => {
    expect(m.migraramParaLoja).toBe(m.clientes.filter((c) => c.deltaPP < 0).length);
    expect(m.quedaAcima10pp).toBe(m.clientes.filter((c) => c.deltaPP < -10).length);
    expect(m.quedaAcima10pp).toBeLessThanOrEqual(m.migraramParaLoja);
  });

  it('vem ordenado da maior queda para a maior alta', () => {
    for (let i = 1; i < m.clientes.length; i += 1) {
      expect(m.clientes[i - 1].deltaPP).toBeLessThanOrEqual(m.clientes[i].deltaPP);
    }
  });

  it('com base vazia devolve estrutura vazia e medias finitas', () => {
    const z = clientes.migracaoDeCanal(vazio);
    expect(z.clientes).toEqual([]);
    expect(Number.isFinite(z.deltaMedioPP)).toBe(true);
  });
});

describe('canal por periodo e repertorio', () => {
  it('canalPorPeriodo nao perde receita entre as duas metades', () => {
    const c = clientes.canalPorPeriodo(ds);
    const soma = c.receita.reduce((s, p) => s + p.ecommerce + p.loja_fisica, 0);
    expect(soma).toBeCloseTo(RECEITA_TOTAL_FIXTURE, 8);
    expect(c.receita.map((p) => p.periodo)).toEqual(['15 dias anteriores', '15 dias recentes']);
  });

  it('canalPorPeriodo separa receita e ticket em DOIS blocos — nunca eixo duplo', () => {
    const c = clientes.canalPorPeriodo(ds);
    expect(Array.isArray(c.receita)).toBe(true);
    expect(Array.isArray(c.ticket)).toBe(true);
    for (const d of [c.deltaReceitaEcommerce, c.deltaReceitaLoja, c.deltaTicketEcommerce, c.deltaTicketLoja]) {
      expect(Number.isFinite(d)).toBe(true);
    }
    expect(c.shareEcommerceAnterior).toBeGreaterThanOrEqual(0);
    expect(c.shareEcommerceRecente).toBeLessThanOrEqual(1);
  });

  it('repertorioDeCategorias conta categorias distintas e ignora as orfas', () => {
    const r = clientes.repertorioDeCategorias(ds);
    // Catalogo do fixture: Eletronicos e Casa (p5 tem categoria nula).
    expect(r.categoriasNoCatalogo).toBe(2);
    expect(r.minCategorias).toBeGreaterThanOrEqual(1);
    expect(r.maxCategorias).toBeLessThanOrEqual(r.categoriasNoCatalogo);
    expect(r.mediaCategoriasPorCliente).toBeGreaterThanOrEqual(r.minCategorias);
    expect(r.mediaCategoriasPorCliente).toBeLessThanOrEqual(r.maxCategorias);
    expect(r.pctCobremCatalogoInteiro).toBeGreaterThanOrEqual(0);
    expect(r.pctCobremCatalogoInteiro).toBeLessThanOrEqual(1);

    const z = clientes.repertorioDeCategorias(vazio);
    expect(z.mediaCategoriasPorCliente).toBe(0);
  });

  it('a geografia usa topNComOutros nas barras: no maximo 9 itens', () => {
    const g = clientes.distribuicaoGeografica(ds);
    expect(g.barras.length).toBeLessThanOrEqual(9);
    expect(g.barras.reduce((s, b) => s + b.valor, 0)).toBeCloseTo(RECEITA_TOTAL_FIXTURE, 8);
    expect(g.totalEstados).toBe(g.estados.length);
    expect(g.estadosComUmCliente).toBe(g.estados.filter((e) => e.clientes === 1).length);
  });

  it('receitaPorCliente soma a receita total', () => {
    const mapa = clientes.receitaPorCliente(ds);
    expect([...mapa.values()].reduce((s, v) => s + v, 0)).toBeCloseTo(RECEITA_TOTAL_FIXTURE, 10);
    expect(mapa.size).toBe(new Set(ds.vendas.map((v) => v.id_cliente)).size);
  });

  it('dispersaoFrequenciaTicket respeita o teto de 3 series do scatter', () => {
    const d = clientes.dispersaoFrequenciaTicket(ds);
    expect(d.grupos.length).toBeLessThanOrEqual(3);
    expect(d.pontos).toHaveLength(clientes.metricasPorCliente(ds).length);
    for (const p of d.pontos) {
      expect(d.grupos).toContain(p.grupo);
      expect(p.ticketMedio).toBeCloseTo(p.receita / p.compras, 8);
    }
    expect(Number.isFinite(d.amplitudeCompras)).toBe(true);
    expect(Number.isFinite(d.amplitudeTicket)).toBe(true);
  });
});

describe('pureza', () => {
  it('nenhuma funcao muta o dataset', () => {
    const antes = JSON.stringify(ds);
    clientes.metricasPorCliente(ds);
    clientes.resumoClientes(ds);
    clientes.concentracaoDeReceita(ds);
    clientes.segmentacaoRFM(ds);
    clientes.comportamentoPorSafra(ds);
    clientes.perfilDeCanal(ds);
    clientes.intensidadeDeCanal(ds);
    clientes.migracaoDeCanal(ds);
    clientes.distribuicaoGeografica(ds);
    clientes.repertorioDeCategorias(ds);
    expect(JSON.stringify(ds)).toBe(antes);
  });

  it('duas chamadas identicas devolvem o mesmo resultado', () => {
    expect(JSON.stringify(clientes.resumoClientes(ds)))
      .toBe(JSON.stringify(clientes.resumoClientes(dataset())));
  });
});

describe('coerencia com a receita compartilhada', () => {
  it('a receita da aba CLIENTES e a mesma receita total do projeto', () => {
    const porCliente = clientes.metricasPorCliente(ds).reduce((s, m) => s + m.receita, 0);
    expect(porCliente).toBeCloseTo(receitaTotal(ds.vendas), 10);
  });
});
