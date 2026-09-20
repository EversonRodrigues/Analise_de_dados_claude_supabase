/**
 * FIXTURE DETERMINISTICO — dono: T5 (QA).
 *
 * Nenhum teste unitario toca a rede nem o Supabase. Este dataset e pequeno o
 * bastante para que os valores esperados sejam conferidos a mao e grande o
 * bastante para exercitar todas as regras do contrato:
 *  - dois canais,
 *  - duas vendas ORFAS (id_produto inexistente no catalogo),
 *  - um produto com `categoria` nula,
 *  - datas espalhadas na janela, com o corte caindo no meio de um dia.
 *
 * Numeros de referencia (conferidos linha a linha em `tests/regras.test.ts`):
 *   receita total ............ 2380
 *   receita das orfas ........ 200   (v06 = 111 + v11 = 89)
 *   receita classificavel .... 2180
 *   corte (janela) ........... 2026-01-06T05:00:00.000Z
 */
import type { Cliente, Dataset, PrecoCompetidor, Produto, Venda } from '@/lib/data/types';

export const PRODUTOS: Produto[] = [
  { id_produto: 'p1', nome_produto: 'Fone X', categoria: 'Eletronicos', marca: 'Acme', preco_atual: 100, data_criacao: '2025-11-01' },
  { id_produto: 'p2', nome_produto: 'Teclado Y', categoria: 'Eletronicos', marca: 'Beta', preco_atual: 200, data_criacao: '2025-11-02' },
  { id_produto: 'p3', nome_produto: 'Panela Z', categoria: 'Casa', marca: 'Acme', preco_atual: 50, data_criacao: '2025-11-03' },
  { id_produto: 'p4', nome_produto: 'Cadeira W', categoria: 'Casa', marca: 'Gama', preco_atual: 300, data_criacao: '2025-11-04' },
  { id_produto: 'p5', nome_produto: 'Item Solto', categoria: null, marca: null, preco_atual: null, data_criacao: null },
];

export const CLIENTES: Cliente[] = [
  { id_cliente: 'c1', nome_cliente: 'Cliente Um', estado: 'SP', pais: 'Brasil', data_cadastro: '2025-10-01' },
  { id_cliente: 'c2', nome_cliente: 'Cliente Dois', estado: 'RJ', pais: 'Brasil', data_cadastro: '2025-10-02' },
  { id_cliente: 'c3', nome_cliente: 'Cliente Tres', estado: null, pais: null, data_cadastro: null },
];

/** `id_produto: 'p999'` = orfa: nao existe em PRODUTOS (FK NOT VALID no banco real). */
export const VENDAS: Venda[] = [
  { id_venda: 'v01', data_venda: '2026-01-01T10:00:00Z', id_cliente: 'c1', id_produto: 'p1', canal_venda: 'ecommerce', quantidade: 2, preco_unitario: 100 },
  { id_venda: 'v02', data_venda: '2026-01-02T10:00:00Z', id_cliente: 'c2', id_produto: 'p2', canal_venda: 'ecommerce', quantidade: 1, preco_unitario: 200 },
  { id_venda: 'v03', data_venda: '2026-01-03T10:00:00Z', id_cliente: 'c1', id_produto: 'p3', canal_venda: 'loja_fisica', quantidade: 4, preco_unitario: 50 },
  { id_venda: 'v04', data_venda: '2026-01-04T10:00:00Z', id_cliente: 'c3', id_produto: 'p4', canal_venda: 'ecommerce', quantidade: 1, preco_unitario: 300 },
  { id_venda: 'v05', data_venda: '2026-01-05T10:00:00Z', id_cliente: 'c2', id_produto: 'p5', canal_venda: 'loja_fisica', quantidade: 3, preco_unitario: 10 },
  { id_venda: 'v06', data_venda: '2026-01-05T12:00:00Z', id_cliente: 'c1', id_produto: 'p999', canal_venda: 'ecommerce', quantidade: 1, preco_unitario: 111 },
  { id_venda: 'v12', data_venda: '2026-01-06T00:00:00Z', id_cliente: 'c3', id_produto: 'p1', canal_venda: 'ecommerce', quantidade: 1, preco_unitario: 100 },
  { id_venda: 'v07', data_venda: '2026-01-07T10:00:00Z', id_cliente: 'c2', id_produto: 'p1', canal_venda: 'ecommerce', quantidade: 1, preco_unitario: 100 },
  { id_venda: 'v08', data_venda: '2026-01-08T10:00:00Z', id_cliente: 'c1', id_produto: 'p2', canal_venda: 'loja_fisica', quantidade: 2, preco_unitario: 200 },
  { id_venda: 'v09', data_venda: '2026-01-09T10:00:00Z', id_cliente: 'c3', id_produto: 'p3', canal_venda: 'ecommerce', quantidade: 1, preco_unitario: 50 },
  { id_venda: 'v10', data_venda: '2026-01-10T10:00:00Z', id_cliente: 'c2', id_produto: 'p4', canal_venda: 'loja_fisica', quantidade: 2, preco_unitario: 300 },
  { id_venda: 'v11', data_venda: '2026-01-11T00:00:00Z', id_cliente: 'c1', id_produto: 'p999', canal_venda: 'ecommerce', quantidade: 1, preco_unitario: 89 },
];

export const COMPETIDORES: PrecoCompetidor[] = [
  { id: 1, id_produto: 'p1', nome_concorrente: 'ConcA', preco_concorrente: 90, data_coleta: '2026-01-11' },
  { id: 2, id_produto: 'p1', nome_concorrente: 'ConcB', preco_concorrente: 110, data_coleta: '2026-01-11' },
  { id: 3, id_produto: 'p2', nome_concorrente: 'ConcA', preco_concorrente: 250, data_coleta: '2026-01-11' },
  { id: 4, id_produto: 'p3', nome_concorrente: 'ConcA', preco_concorrente: 45, data_coleta: '2026-01-11' },
  { id: 5, id_produto: 'p4', nome_concorrente: 'ConcB', preco_concorrente: 280, data_coleta: '2026-01-11' },
];

export const dataset = (): Dataset => ({
  vendas: VENDAS.map((v) => ({ ...v })),
  produtos: PRODUTOS.map((p) => ({ ...p })),
  clientes: CLIENTES.map((c) => ({ ...c })),
  competidores: COMPETIDORES.map((c) => ({ ...c })),
});

/** Dataset vazio — usado para checar que nenhuma funcao estoura com base zero. */
export const datasetVazio = (): Dataset => ({ vendas: [], produtos: [], clientes: [], competidores: [] });

/** Soma de referencia, calculada por um caminho independente das regras. */
export const somaManual = (vs: Venda[]) => vs.reduce((s, v) => s + v.quantidade * v.preco_unitario, 0);

/* Constantes do fixture, conferidas a mao. */
export const RECEITA_TOTAL_FIXTURE = 2380;
export const RECEITA_ORFAS_FIXTURE = 200;
export const RECEITA_CLASSIFICAVEL_FIXTURE = 2180;
export const CORTE_FIXTURE = '2026-01-06T05:00:00.000Z';

/**
 * Numeros REAIS da base (conferidos por SQL direto no Supabase em 2026-09-20).
 * Servem de contrato: se uma seção mudar a formula de receita, o teste de
 * integracao opcional (tests/contrato-base.test.ts) acusa.
 */
export const BASE_REAL = {
  vendas: 3020,
  produtos: 215,
  clientes: 50,
  competidores: 728,
  receitaTotal: 974077.28,
  orfas: 20,
  receitaOrfas: 4240.01,
  receitaClassificavel: 969837.27,
  inicio: '2025-12-13',
  fim: '2026-01-11',
} as const;

/* -------------------------------------------------------------------------- */
/* Fixture especifico de PRICING                                              */
/* -------------------------------------------------------------------------- */

/**
 * Cenario com desconto, venda acima da tabela, produto sem giro e snapshot
 * competitivo suspeito — o fixture principal vende tudo no preco de tabela e
 * por isso nao exercita erosao.
 *
 * Valores conferidos a mao:
 *   receita praticada .... 820
 *   receita de tabela .... 850
 *   erosao ............... 30
 *   linhas com desconto .. 3 de 6
 *   acima da tabela ...... 1 linha, R$ 10
 */
export const PRODUTOS_PRICING: Produto[] = [
  { id_produto: 'q1', nome_produto: 'Q1 paridade', categoria: 'Audio', marca: 'Acme', preco_atual: 100, data_criacao: '2025-11-01' },
  { id_produto: 'q2', nome_produto: 'Q2 caro', categoria: 'Audio', marca: 'Beta', preco_atual: 200, data_criacao: '2025-11-01' },
  { id_produto: 'q3', nome_produto: 'Q3 barato', categoria: 'Casa', marca: 'Acme', preco_atual: 50, data_criacao: '2025-11-01' },
  { id_produto: 'q4', nome_produto: 'Q4 snapshot suspeito', categoria: 'Casa', marca: 'Gama', preco_atual: 300, data_criacao: '2025-11-01' },
  { id_produto: 'q5', nome_produto: 'Q5 sem cotacao', categoria: 'Casa', marca: 'Gama', preco_atual: 80, data_criacao: '2025-11-01' },
  { id_produto: 'q6', nome_produto: 'Q6 mediana impar', categoria: 'Audio', marca: 'Beta', preco_atual: 100, data_criacao: '2025-11-01' },
];

export const VENDAS_PRICING: Venda[] = [
  { id_venda: 'd01', data_venda: '2026-01-02T12:00:00Z', id_cliente: 'c1', id_produto: 'q1', canal_venda: 'ecommerce', quantidade: 1, preco_unitario: 100 },
  { id_venda: 'd02', data_venda: '2026-01-03T12:00:00Z', id_cliente: 'c1', id_produto: 'q1', canal_venda: 'ecommerce', quantidade: 2, preco_unitario: 90 },
  { id_venda: 'd03', data_venda: '2026-01-04T12:00:00Z', id_cliente: 'c2', id_produto: 'q2', canal_venda: 'ecommerce', quantidade: 1, preco_unitario: 190 },
  { id_venda: 'd04', data_venda: '2026-01-08T12:00:00Z', id_cliente: 'c2', id_produto: 'q3', canal_venda: 'loja_fisica', quantidade: 4, preco_unitario: 50 },
  { id_venda: 'd05', data_venda: '2026-01-09T12:00:00Z', id_cliente: 'c3', id_produto: 'q3', canal_venda: 'loja_fisica', quantidade: 1, preco_unitario: 40 },
  { id_venda: 'd06', data_venda: '2026-01-10T12:00:00Z', id_cliente: 'c3', id_produto: 'q1', canal_venda: 'ecommerce', quantidade: 1, preco_unitario: 110 },
  // ORFA no meio da janela: entra nos totais de receita, sai de todo corte por
  // produto. Fica longe dos extremos de proposito, para nao mexer no corte 15d.
  { id_venda: 'd07', data_venda: '2026-01-05T12:00:00Z', id_cliente: 'c1', id_produto: 'q999', canal_venda: 'ecommerce', quantidade: 5, preco_unitario: 999 },
];

export const COMPETIDORES_PRICING: PrecoCompetidor[] = [
  { id: 1, id_produto: 'q1', nome_concorrente: 'ConcA', preco_concorrente: 95, data_coleta: '2026-01-11T00:00:00Z' },
  { id: 2, id_produto: 'q1', nome_concorrente: 'ConcB', preco_concorrente: 105, data_coleta: '2026-01-11T00:00:00Z' },
  { id: 3, id_produto: 'q2', nome_concorrente: 'ConcA', preco_concorrente: 150, data_coleta: '2026-01-11T00:00:00Z' },
  { id: 4, id_produto: 'q2', nome_concorrente: 'ConcB', preco_concorrente: 150, data_coleta: '2026-01-11T00:00:00Z' },
  { id: 5, id_produto: 'q3', nome_concorrente: 'ConcA', preco_concorrente: 100, data_coleta: '2026-01-11T00:00:00Z' },
  { id: 6, id_produto: 'q3', nome_concorrente: 'ConcB', preco_concorrente: 100, data_coleta: '2026-01-11T00:00:00Z' },
  { id: 7, id_produto: 'q4', nome_concorrente: 'ConcA', preco_concorrente: 100, data_coleta: '2026-01-11T00:00:00Z' },
  { id: 8, id_produto: 'q4', nome_concorrente: 'ConcB', preco_concorrente: 100, data_coleta: '2026-01-11T00:00:00Z' },
  { id: 9, id_produto: 'q6', nome_concorrente: 'ConcA', preco_concorrente: 95, data_coleta: '2026-01-11T00:00:00Z' },
  { id: 10, id_produto: 'q6', nome_concorrente: 'ConcB', preco_concorrente: 100, data_coleta: '2026-01-11T00:00:00Z' },
  { id: 11, id_produto: 'q6', nome_concorrente: 'ConcC', preco_concorrente: 105, data_coleta: '2026-01-11T00:00:00Z' },
];

export const datasetPricing = (): Dataset => ({
  vendas: VENDAS_PRICING.map((v) => ({ ...v })),
  produtos: PRODUTOS_PRICING.map((p) => ({ ...p })),
  clientes: CLIENTES.map((c) => ({ ...c })),
  competidores: COMPETIDORES_PRICING.map((c) => ({ ...c })),
});
