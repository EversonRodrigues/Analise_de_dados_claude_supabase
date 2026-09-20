# Fase 0 — Verificação do ambiente e dos dados

Antes de escrever qualquer linha de dashboard, a equipe verificou conexão,
credenciais, segurança e o conteúdo real das tabelas. Este documento registra o
que foi encontrado. Nada aqui é suposição: tudo saiu de consulta ao banco ou de
leitura dos arquivos do projeto.

## 1. Conexão MCP com o Supabase

- Servidor MCP do Supabase configurado em `.mcp.json`, via HTTP.
- Projeto: `cjzfoitdvmbimzavaxcm`.
- Conexão testada com leitura das 4 tabelas e dos advisors.
- **Advisors de segurança: 0 alertas.**

## 2. Variáveis de ambiente

`.env` existe e está listado no `.gitignore` (junto com `.env.local`; apenas
`.env.example` é versionado).

| Variável | Estado |
|---|---|
| `SUPABASE_URL` | preenchida |
| `SUPABASE_PUBLISHABLE_KEY` | preenchida |
| `SUPABASE_ANON_KEY` | preenchida |
| `SUPABASE_SECRET_KEY` | **vazia** |
| `PGPASSWORD` | **vazia** |
| `DATABASE_URL` | presente, mas com a senha em branco |

Consequência prática: não há acesso direto por `psql` nem chave de serviço no
repositório. Todo acesso do app é feito com a chave publicável, sob RLS.

O líder criou `.env.local` espelhando **somente** as duas variáveis públicas que
o Next.js precisa:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

## 3. RLS e o que isso impõe ao produto

- RLS **ativo nas 4 tabelas**.
- Cada tabela tem uma policy de `SELECT` para a role `authenticated` com
  `qual = true` (usuário logado lê tudo; anônimo não lê nada).
- Verificado na prática: com a chave anônima e sem sessão, as consultas voltam
  vazias.

Por isso o dashboard **exige login**. `src/middleware.ts` redireciona toda rota
não autenticada para `/login`, e é preciso criar um usuário no Supabase Auth
(com *Auto Confirm*) para ver dados — veja o README.

## 4. Esquema das tabelas

### `vendas` — 3.020 linhas

| Coluna | Tipo | Observação |
|---|---|---|
| `id_venda` | text | PK |
| `data_venda` | timestamptz | |
| `id_cliente` | text | FK → `clientes` |
| `id_produto` | text | FK → `produtos` (**NOT VALID**, ver achado 1) |
| `canal_venda` | text | check: `ecommerce` \| `loja_fisica` |
| `quantidade` | int | check: > 0 |
| `preco_unitario` | numeric | check: ≥ 0 |

### `preco_competidores` — 728 linhas

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | bigint | PK, identity |
| `id_produto` | text | FK → `produtos` |
| `nome_concorrente` | text | 4 concorrentes distintos |
| `preco_concorrente` | numeric | check: ≥ 0 |
| `data_coleta` | timestamptz | **um único dia: 2026-01-11** |

### `produtos` — 215 linhas

`id_produto` (PK, text), `nome_produto`, `categoria`, `marca`, `preco_atual`
(numeric), `data_criacao`.

### `clientes` — 50 linhas

`id_cliente` (PK, text), `nome_cliente`, `estado`, `pais`, `data_cadastro`.

## 5. Perfil dos dados

| Dimensão | Valor apurado |
|---|---|
| Janela de vendas | 2025-12-13 → 2026-01-11 (30 dias) |
| Receita total | R$ 974.077,28 |
| Mix de canal | 2.155 ecommerce / 865 loja física |
| Clientes | 50, em 1 país e 22 estados |
| Catálogo | 215 produtos, 11 categorias, 20 marcas |
| Cobertura de venda | 205 produtos venderam; 30 sem nenhuma venda |
| Faixa de preço praticado | R$ 31,90 a R$ 1.428,99 (média R$ 211,76) |
| Realização de preço (praticado / tabela) | **96,83% ponderada por receita** (96,89% pela média simples por linha) |
| Linhas com desconto | 1.159 linhas (38,6%) — erosão de R$ 31.779,89 |
| Linhas vendidas acima da tabela | 136 |
| Preços de concorrentes | 4 concorrentes × 215 produtos, coleta de um único dia |

Esse perfil é o motivo de várias decisões da Fase 1: 30 dias sem histórico
impedem YoY; um único dia de coleta de concorrente impede série temporal de
pricing; 50 clientes tornam qualquer recorte por estado estatisticamente frágil.

## 6. Achados

### Achado 1 — FK `NOT VALID` e 20 vendas órfãs

A constraint `vendas_id_produto_fkey` está marcada como `NOT VALID` no Postgres,
ou seja, foi criada sem validar as linhas já existentes. Resultado: **20 vendas,
somando cerca de R$ 4.240, apontam para `id_produto` que não existe em
`produtos`**.

Tratamento adotado (implementado em `src/lib/data/regras.ts`):

- as órfãs **contam** nos totais de receita — a venda aconteceu e o dinheiro entrou;
- as órfãs **saem** de qualquer corte por produto, categoria ou marca, porque não
  há atributo para classificá-las;
- todo painel que aplica esse corte exibe a nota de rodapé gerada por
  `notaRodapeOrfas(dataset)`.

Isso é o que torna os números consistentes entre as abas: sem regra única, um
painel mostraria R$ 974.077 e outro R$ 969.837 para "receita total".

### Achado 2 — Não existe coluna de custo

Nenhuma das 4 tabelas guarda custo, CMV ou custo de aquisição. **Margem contábil
é incalculável.** Qualquer painel que exibisse "margem bruta" estaria inventando
o denominador.

Decisão: a seção de Pricing trabalha com dois proxies honestos — posição
competitiva (preço praticado vs. preço dos 4 concorrentes) e erosão de desconto
(preço praticado vs. `produtos.preco_atual`). Os dois estão documentados em
[`03-kpis-pricing.md`](03-kpis-pricing.md).
