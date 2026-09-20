/** Tipos espelhando o esquema real do Supabase. Dono: Lider. */
export type Venda = {
  id_venda: string;
  data_venda: string;
  id_cliente: string;
  id_produto: string;
  canal_venda: 'ecommerce' | 'loja_fisica';
  quantidade: number;
  preco_unitario: number;
};

export type Produto = {
  id_produto: string;
  nome_produto: string;
  categoria: string | null;
  marca: string | null;
  preco_atual: number | null;
  data_criacao: string | null;
};

export type Cliente = {
  id_cliente: string;
  nome_cliente: string;
  estado: string | null;
  pais: string | null;
  data_cadastro: string | null;
};

export type PrecoCompetidor = {
  id: number;
  id_produto: string;
  nome_concorrente: string;
  preco_concorrente: number;
  data_coleta: string;
};

/** Venda ja enriquecida com o produto. Linhas orfas NAO aparecem aqui. */
export type VendaEnriquecida = Venda & { produto: Produto };

export type Dataset = {
  vendas: Venda[];
  produtos: Produto[];
  clientes: Cliente[];
  competidores: PrecoCompetidor[];
};
