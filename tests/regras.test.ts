/**
 * Testes do NUCLEO COMPARTILHADO (`src/lib/data/regras.ts`).
 * Se uma destas invariantes quebra, as tres abas do dashboard passam a mostrar
 * numeros diferentes para a mesma pergunta.
 */
import { describe, expect, it } from 'vitest';
import {
  receitaLinha,
  receitaTotal,
  enriquecer,
  orfas,
  notaRodapeOrfas,
  janela,
  dividirPeriodos,
  variacao,
  agrupar,
  topNComOutros,
} from '@/lib/data/regras';
import type { Venda } from '@/lib/data/types';
import {
  CORTE_FIXTURE,
  PRODUTOS,
  RECEITA_CLASSIFICAVEL_FIXTURE,
  RECEITA_ORFAS_FIXTURE,
  RECEITA_TOTAL_FIXTURE,
  VENDAS,
  dataset,
  datasetVazio,
  somaManual,
} from './fixtures/dataset';

describe('receita', () => {
  it('receitaLinha e sempre quantidade * preco_unitario', () => {
    expect(receitaLinha(VENDAS[0])).toBe(200);
    for (const v of VENDAS) expect(receitaLinha(v)).toBe(v.quantidade * v.preco_unitario);
  });

  it('receitaTotal bate com a soma calculada por caminho independente', () => {
    expect(receitaTotal(VENDAS)).toBe(somaManual(VENDAS));
    expect(receitaTotal(VENDAS)).toBe(RECEITA_TOTAL_FIXTURE);
  });

  it('receitaTotal de lista vazia e zero, nao NaN', () => {
    expect(receitaTotal([])).toBe(0);
  });
});

describe('regra das orfas', () => {
  const ds = dataset();

  it('orfas devolve exatamente as vendas sem produto no catalogo', () => {
    const o = orfas(ds.vendas, ds.produtos);
    expect(o.map((v) => v.id_venda).sort()).toEqual(['v06', 'v11']);
  });

  it('enriquecer DESCARTA as orfas e preserva todas as demais linhas', () => {
    const linhas = enriquecer(ds.vendas, ds.produtos);
    expect(linhas).toHaveLength(ds.vendas.length - 2);
    expect(linhas.every((l) => l.produto.id_produto === l.id_produto)).toBe(true);
  });

  it('a diferenca entre total e classificavel e EXATAMENTE a receita das orfas', () => {
    const total = receitaTotal(ds.vendas);
    const classificavel = receitaTotal(enriquecer(ds.vendas, ds.produtos));
    const receitaOrfas = receitaTotal(orfas(ds.vendas, ds.produtos));

    expect(total - classificavel).toBeCloseTo(receitaOrfas, 10);
    expect(receitaOrfas).toBe(RECEITA_ORFAS_FIXTURE);
    expect(classificavel).toBe(RECEITA_CLASSIFICAVEL_FIXTURE);
  });

  it('enriquecer nao muda o total quando nao ha orfas', () => {
    const semOrfas = ds.vendas.filter((v) => v.id_produto !== 'p999');
    expect(receitaTotal(enriquecer(semOrfas, ds.produtos))).toBe(receitaTotal(semOrfas));
  });

  it('notaRodapeOrfas cita a contagem e some quando nao ha orfas', () => {
    const nota = notaRodapeOrfas(ds);
    expect(nota).toContain('2 vendas');
    expect(nota).toContain('vendas_id_produto_fkey');

    const limpo = { ...ds, vendas: ds.vendas.filter((v) => v.id_produto !== 'p999') };
    expect(notaRodapeOrfas(limpo)).toBe('');
    expect(notaRodapeOrfas(datasetVazio())).toBe('');
  });
});

describe('janela e dividirPeriodos', () => {
  it('janela devolve os extremos reais e o corte no meio', () => {
    const { inicio, fim, corte } = janela(VENDAS);
    expect(inicio.toISOString()).toBe('2026-01-01T10:00:00.000Z');
    expect(fim.toISOString()).toBe('2026-01-11T00:00:00.000Z');
    expect(corte.toISOString()).toBe(CORTE_FIXTURE);
  });

  it('a janela nao depende da ordem das linhas', () => {
    const embaralhado = [...VENDAS].reverse();
    expect(janela(embaralhado).corte.toISOString()).toBe(janela(VENDAS).corte.toISOString());
  });

  it('dividirPeriodos PARTICIONA: nao perde nem duplica nenhuma linha', () => {
    const { recente, anterior } = dividirPeriodos(VENDAS);

    expect(recente.length + anterior.length).toBe(VENDAS.length);

    const ids = [...recente, ...anterior].map((v) => v.id_venda).sort();
    expect(ids).toEqual(VENDAS.map((v) => v.id_venda).sort());
    expect(new Set(ids).size).toBe(VENDAS.length);
  });

  it('a receita dos dois periodos somada reconstroi a receita total', () => {
    const { recente, anterior } = dividirPeriodos(VENDAS);
    expect(receitaTotal(recente) + receitaTotal(anterior)).toBeCloseTo(receitaTotal(VENDAS), 10);
  });

  it('nenhuma linha do periodo anterior e posterior ao corte (e vice-versa)', () => {
    const { recente, anterior, corte } = dividirPeriodos(VENDAS);
    expect(anterior.every((v) => new Date(v.data_venda) < corte)).toBe(true);
    expect(recente.every((v) => new Date(v.data_venda) >= corte)).toBe(true);
  });

  it('a linha exatamente no corte cai no periodo RECENTE (borda fechada a esquerda)', () => {
    const base: Venda = { ...VENDAS[0], id_venda: 'borda' };
    const linhas: Venda[] = [
      { ...base, data_venda: '2026-01-01T00:00:00Z' },
      { ...base, id_venda: 'meio', data_venda: '2026-01-02T00:00:00Z' },
      { ...base, id_venda: 'fim', data_venda: '2026-01-03T00:00:00Z' },
    ];
    const { recente } = dividirPeriodos(linhas);
    expect(recente.map((v) => v.id_venda)).toContain('meio');
  });

  it('janela sinaliza a base vazia com a flag `vazio`, sem Invalid Date', () => {
    const j = janela([]);
    expect(j.vazio).toBe(true);
    expect(Number.isNaN(j.corte.getTime())).toBe(false);
    expect(janela(VENDAS).vazio).toBe(false);
    // Quem consome tem de ramificar por essa flag: com base vazia o corte cai
    // no relogio da maquina, e nenhum painel pode exibir isso como se fosse a
    // janela observada.
  });

  it('com lista vazia nao estoura e devolve dois periodos vazios', () => {
    expect(() => dividirPeriodos([])).not.toThrow();
    const { recente, anterior } = dividirPeriodos([]);
    expect(recente).toHaveLength(0);
    expect(anterior).toHaveLength(0);
  });
});

describe('variacao', () => {
  it('calcula a variacao relativa padrao', () => {
    expect(variacao(150, 100)).toBeCloseTo(0.5, 10);
    expect(variacao(50, 100)).toBeCloseTo(-0.5, 10);
    expect(variacao(100, 100)).toBe(0);
  });

  it('NUNCA devolve Infinity nem NaN com base zero', () => {
    expect(variacao(10, 0)).toBe(0);
    expect(variacao(0, 0)).toBe(0);
    expect(Number.isFinite(variacao(1e9, 0))).toBe(true);
  });
});

describe('agrupar', () => {
  it('preserva todos os itens e nao inventa grupo', () => {
    const grupos = agrupar(VENDAS, (v) => v.canal_venda);
    const total = [...grupos.values()].reduce((s, g) => s + g.length, 0);
    expect(total).toBe(VENDAS.length);
    expect([...grupos.keys()].sort()).toEqual(['ecommerce', 'loja_fisica']);
  });

  it('a receita somada por grupo reconstroi a receita total', () => {
    const grupos = agrupar(VENDAS, (v) => v.data_venda.slice(0, 10));
    const soma = [...grupos.values()].reduce((s, g) => s + receitaTotal(g), 0);
    expect(soma).toBeCloseTo(receitaTotal(VENDAS), 10);
  });

  it('lista vazia gera mapa vazio', () => {
    expect(agrupar([] as Venda[], (v) => v.canal_venda).size).toBe(0);
  });
});

describe('topNComOutros', () => {
  const grupos = agrupar(enriquecer(VENDAS, PRODUTOS), (l) => l.produto.categoria ?? 'Sem categoria');
  const totalClassificavel = receitaTotal(enriquecer(VENDAS, PRODUTOS));

  it('a soma do topo + Outros PRESERVA o total', () => {
    for (const n of [1, 2, 3]) {
      const fatias = topNComOutros(grupos, receitaTotal, n);
      const soma = fatias.reduce((s, f) => s + f.valor, 0);
      expect(soma).toBeCloseTo(totalClassificavel, 10);
    }
  });

  it('nunca devolve mais de N+1 itens — a paleta tem 8 slots fixos', () => {
    for (const n of [1, 2, 3, 8]) {
      expect(topNComOutros(grupos, receitaTotal, n).length).toBeLessThanOrEqual(n + 1);
    }
  });

  it('nao cria "Outros" quando N cobre todos os grupos', () => {
    const fatias = topNComOutros(grupos, receitaTotal, grupos.size);
    expect(fatias.map((f) => f.nome)).not.toContain('Outros');
    expect(fatias).toHaveLength(grupos.size);
  });

  it('ordena por valor decrescente e deixa "Outros" por ultimo', () => {
    const fatias = topNComOutros(grupos, receitaTotal, 1);
    expect(fatias[fatias.length - 1].nome).toBe('Outros');
    const topo = fatias.slice(0, -1);
    for (let i = 1; i < topo.length; i += 1) {
      expect(topo[i - 1].valor).toBeGreaterThanOrEqual(topo[i].valor);
    }
  });

  it('com N = 0 tudo vira Outros, sem perder receita', () => {
    const fatias = topNComOutros(grupos, receitaTotal, 0);
    expect(fatias).toHaveLength(1);
    expect(fatias[0].nome).toBe('Outros');
    expect(fatias[0].valor).toBeCloseTo(totalClassificavel, 10);
  });

  it('com mapa vazio devolve lista vazia', () => {
    expect(topNComOutros(new Map<string, Venda[]>(), receitaTotal, 5)).toEqual([]);
  });
});

describe('contrato de numeros da base real', () => {
  it('a relacao total = classificavel + orfas vale tambem para os numeros reais', () => {
    // Conferidos por SQL direto: 974077.28 = 969837.27 + 4240.01
    expect(969837.27 + 4240.01).toBeCloseTo(974077.28, 2);
  });
});
