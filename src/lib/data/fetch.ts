import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Dataset, Venda, Produto, Cliente, PrecoCompetidor } from './types';

/**
 * PostgREST devolve no maximo 1000 linhas por requisicao. `vendas` tem ~3020,
 * entao paginamos explicitamente — sem isso a receita apareceria truncada em 1/3.
 */
const PAGE = 1000;

async function fetchAll<T>(
  supabase: ReturnType<typeof createClient>,
  table: string,
  columns: string,
  /**
   * A ordenacao PRECISA terminar numa coluna unica. Postgres nao garante ordem
   * estavel entre linhas empatadas, e com paginacao isso faz uma linha cair em
   * duas paginas ou em nenhuma. `vendas` tem 3020 linhas para 3016 timestamps
   * distintos — ordenar so por data_venda perderia/duplicaria receita.
   */
  orderBy: string[],
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns);
    for (const col of orderBy) q = q.order(col, { ascending: true });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(`Falha ao ler ${table}: ${error.message}`);
    const rows = (data ?? []) as unknown as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/**
 * Carrega as 4 tabelas UMA VEZ por request (React cache) e entrega o mesmo
 * Dataset para as tres seções. Evita 3x o mesmo trafego e garante que os
 * paineis concordem entre si.
 */
export class LeituraVaziaError extends Error {
  constructor() {
    super(
      'A leitura das tabelas voltou VAZIA. Quase sempre isso e permissao, nao ' +
      'ausencia de dados: a RLS do Supabase nao rejeita quem nao pode ler — ela ' +
      'responde 200 com lista vazia. Sem esta checagem o dashboard renderizaria ' +
      'zeros, indistinguivel de um negocio parado. Confira se as policies de ' +
      'SELECT cobrem o role em uso (hoje a v1 le como `anon`) e se a chave em ' +
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY e a do projeto certo.',
    );
    this.name = 'LeituraVaziaError';
  }
}

export const getDataset = cache(async (): Promise<Dataset> => {
  const supabase = createClient();


  const [vendas, produtos, clientes, competidores] = await Promise.all([
    fetchAll<Venda>(supabase, 'vendas', 'id_venda,data_venda,id_cliente,id_produto,canal_venda,quantidade,preco_unitario', ['data_venda', 'id_venda']),
    fetchAll<Produto>(supabase, 'produtos', 'id_produto,nome_produto,categoria,marca,preco_atual,data_criacao', ['id_produto']),
    fetchAll<Cliente>(supabase, 'clientes', 'id_cliente,nome_cliente,estado,pais,data_cadastro', ['id_cliente']),
    fetchAll<PrecoCompetidor>(supabase, 'preco_competidores', 'id,id_produto,nome_concorrente,preco_concorrente,data_coleta', ['id']),
  ]);
  // Falhar alto: "sem permissao" e "sem vendas" chegam aqui identicos (200 + []).
  // Preferimos um erro explicativo a um painel de zeros que parece legitimo.
  if (vendas.length === 0) throw new LeituraVaziaError();

  return { vendas, produtos, clientes, competidores };
});
