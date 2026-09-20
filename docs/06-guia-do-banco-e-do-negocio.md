# Guia do banco e do negócio — transferência de conhecimento

> Documento de referência para iniciar **um novo projeto** sobre esta mesma base
> Supabase, sem precisar reabrir o código deste. Reúne esquema, fórmulas
> validadas, armadilhas dos dados e o que já foi descoberto sobre o negócio.
>
> Todos os números foram conferidos direto no banco. Onde houver divergência
> entre este documento e o código, o código manda — mas avise, porque significa
> que algo mudou.

---

## 1. Conexão

| Item | Valor |
|---|---|
| Project ref | `cjzfoitdvmbimzavaxcm` |
| URL | `https://cjzfoitdvmbimzavaxcm.supabase.co` |
| Chave pública | `sb_publishable_G1lpmkXNRdlUA_BlfaWrFw_eW8RqIfV` |
| MCP | HTTP em `.mcp.json`, features: docs, account, database, debugging, development, functions, branching |

**Somente leitura na prática.** `SUPABASE_SECRET_KEY` e `PGPASSWORD` estão
vazios no `.env`, e o host direto `db.<ref>.supabase.co:5432` **não resolve em
DNS** — o projeto só expõe o pooler. Ou seja: não há service-role nem conexão
psycopg/SQLAlchemy direta. Todo acesso é via PostgREST (supabase-js, `requests`)
ou via MCP.

### Segurança atual

- RLS **ativo** nas 4 tabelas.
- Policies de `SELECT` para `authenticated` **e** para `anon` (estas últimas
  criadas para a v1 pública de estudo, nomeadas `v1 estudo: leitura publica de …`).
- **Nenhuma policy de escrita** em nenhuma tabela.
- ⚠️ **Pendência conhecida:** os roles `anon` e `authenticated` ainda têm grants
  de `INSERT/UPDATE/DELETE/TRUNCATE` (padrão do Supabase). Hoje é inócuo porque
  não há policy de escrita — mas **`TRUNCATE` não passa por RLS**. Se o novo
  projeto for além de leitura, resolva isto antes:

```sql
revoke insert, update, delete, truncate on public.vendas, public.produtos,
  public.clientes, public.preco_competidores from anon, authenticated;
```

---

## 2. Esquema das 4 tabelas

### `vendas` — 3.020 linhas (tabela-fato)

| Coluna | Tipo | Notas |
|---|---|---|
| `id_venda` | `text` | **PK** |
| `data_venda` | `timestamptz` | 2025-12-13 → 2026-01-11 |
| `id_cliente` | `text` | FK → `clientes` · **válida** |
| `id_produto` | `text` | FK → `produtos` · ⚠️ **`NOT VALID`** |
| `canal_venda` | `text` | `CHECK IN ('ecommerce','loja_fisica')` |
| `quantidade` | `integer` | `CHECK > 0` |
| `preco_unitario` | `numeric` | `CHECK >= 0` — **preço praticado** |

**Granularidade:** uma linha é um *item* de venda, não um pedido. `id_venda` é
PK, então nesta base cada venda tem exatamente uma linha — mas não assuma isso
como invariante do modelo ao escrever queries novas.

### `produtos` — 215 linhas

| Coluna | Tipo | Notas |
|---|---|---|
| `id_produto` | `text` | **PK** |
| `nome_produto` | `text` | ⚠️ **repete entre SKUs** — nunca agrupe por nome |
| `categoria` | `text` | 11 categorias (10 com venda) |
| `marca` | `text` | 20 marcas |
| `preco_atual` | `numeric` | **preço de tabela**. R$ 31,90–1.428,99, média R$ 211,76 |
| `data_criacao` | `timestamptz` | |

### `clientes` — 50 linhas

| Coluna | Tipo | Notas |
|---|---|---|
| `id_cliente` | `text` | **PK** |
| `nome_cliente` | `text` | |
| `estado` | `text` | 22 UFs |
| `pais` | `text` | **1 país só** — não faça corte por país |
| `data_cadastro` | `timestamptz` | 2022-10 → 2025-10 |

### `preco_competidores` — 728 linhas

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `bigint` | **PK**, identity |
| `id_produto` | `text` | FK → `produtos` · válida · cobre os **215** produtos |
| `nome_concorrente` | `text` | 4 concorrentes |
| `preco_concorrente` | `numeric` | `CHECK >= 0` |
| `data_coleta` | `timestamptz` | ⚠️ **um único dia: 2026-01-11** |

Sem valores nulos em nenhuma coluna de nenhuma tabela.

---

## 3. Armadilhas — leia antes de escrever a primeira query

Estas seis custaram tempo real. Cada uma já produziu um número errado que
parecia plausível.

### 3.1 A FK de produto é `NOT VALID` → 20 vendas órfãs

O Postgres aceitou 20 linhas de `vendas` apontando para `id_produto`
inexistente (≈ R$ 4.240). **Qualquer `JOIN produtos` perde essas linhas em
silêncio.**

Regra adotada, e que recomendo manter: **contam nos totais de receita** (a venda
aconteceu), **saem de qualquer corte por produto/categoria/marca** (não há
atributo para classificá-las). Consequência aceita conscientemente: a receita
total e a soma das categorias **não fecham**, e a diferença é sempre esse valor.

```sql
-- as órfãs
select count(*), sum(quantidade*preco_unitario) from vendas v
where not exists (select 1 from produtos p where p.id_produto = v.id_produto);
```

Se o novo projeto puder corrigir na origem, o certo é investigar os 20 registros
e depois validar a constraint.

### 3.2 PostgREST corta em 1.000 linhas

`vendas` tem 3.020. **Sem paginação explícita a receita aparece truncada a um
terço** — e não há erro, só um número menor. Pagine com `range()`.

### 3.3 Ordene por coluna **única** ao paginar

`data_venda` tem 3.016 valores distintos para 3.020 linhas (4 empates). O
Postgres não garante ordem estável entre empates, então uma linha pode cair em
duas páginas ou em nenhuma. Ordene por `id_venda`, ou `data_venda, id_venda`.

### 3.4 Desconto é discreto — cuidado com binning por float

**Todas as 1.159 linhas descontadas saem em exatamente 5%, 10% ou 15%.** Se você
cortar faixas nesses mesmos limites, o volume inteiro cai *em cima* da
fronteira — e `1 - 90/100` dá `0.09999999999999998`, então um desconto de 10%
escorrega para a faixa de baixo em JS/Python enquanto em SQL fica na de cima.

Use limite superior **inclusivo** com tolerância (`d <= limite + 0.001`).

### 3.5 Categoria **Tênis** é dado sintético

15 produtos, os 4 concorrentes cotando **exatamente o mesmo valor**, sempre
metade do nosso preço (índice 2,000 nos 15), e **zero vendas**.

Isso não é posição de mercado. Sem excluir, o índice competitivo de capa
reportaria *"estamos 7,7% acima do mercado"* quando a mediana real é **1,01**.
Detecte por: cotação uniforme entre concorrentes **e** índice ≥ 1,5.

### 3.6 Média simples ≠ média ponderada — e a escolha muda a conclusão

Para realização de preço as duas leituras divergem:

| Canal | Simples (por linha) | Ponderada (por receita) |
|---|---|---|
| E-commerce | 96,91% → 96,71% | 96,95% → 96,84% |
| Loja física | 97,08% → **97,11%** | 97,01% → **96,34%** |

Pela simples a loja parece estável; pela ponderada cai 0,67 pp. **A divergência
é informação, não erro**: a loja passou a descontar item mais caro (tabela média
das linhas descontadas subiu de R$ 196,02 para R$ 240,10).

Padronize a **ponderada por receita** como métrica de capa — é a única que fecha
com a erosão em R$ — e **rotule qual está na tela**.

---

## 4. Números de referência (confira contra estes)

| Métrica | Valor |
|---|---|
| Janela | 2025-12-13 → 2026-01-11 (**30 dias**) |
| Receita total | **R$ 974.077,28** |
| Receita classificável (sem órfãs) | R$ 969.837,27 |
| Receita a preço de tabela | R$ 1.001.617,16 |
| Pedidos | 3.020 · Unidades 4.322 · Ticket médio R$ 322,54 |
| Receita média/dia | R$ 32.469 |
| Mix de canal | e-commerce 2.155 linhas (72,4% da receita) · loja 865 (27,6%) |
| Realização de preço (ponderada) | **96,83%** · simples 96,89% |
| Erosão total de desconto | **R$ 31.779,89** |
| Linhas com desconto | 1.159 (38,4%) |
| Linhas **acima** do preço de tabela | 136 (+R$ 4.645, até +10%) |
| Índice competitivo mediano | **1,01** |
| Produtos sem venda | 30 de 215 |
| Gini de receita por cliente | **0,129** · top 20% = 27,0% |
| Repertório médio | 9,9 de 10 categorias por cliente |

### Degraus de desconto

| Degrau | Linhas | Erosão | Unid./linha |
|---|---|---|---|
| 5% | 464 | R$ 7.220,58 | 1,455 |
| 10% | 413 | R$ 14.006,77 | 1,424 |
| 15% | 282 | **R$ 15.197,62** | 1,465 |

Sem desconto: 1,424 unidades por linha. **A curva é plana** — desconto não
compra volume nesta base.

### Categorias (só as que venderam)

| Categoria | Linhas | Receita | Share | Tabela média |
|---|---|---|---|---|
| Moda | 508 | R$ 248.124 | 25,6% | R$ 347,92 |
| Áudio | 194 | R$ 137.061 | 14,1% | **R$ 554,65** |
| Acessórios | 312 | R$ 120.910 | 12,5% | R$ 295,60 |
| Casa | 575 | R$ 112.705 | 11,6% | R$ 134,42 |
| Cozinha | 275 | R$ 85.060 | 8,8% | R$ 237,82 |
| Beleza | 197 | R$ 66.853 | 6,9% | R$ 258,56 |
| Eletrônicos | 251 | R$ 62.826 | 6,5% | R$ 180,97 |
| Informática | 261 | R$ 61.411 | 6,3% | R$ 173,91 |
| Games | 301 | R$ 50.176 | 5,2% | R$ 120,32 |
| Esporte | 126 | R$ 24.712 | 2,5% | R$ 134,97 |
| *Tênis* | 0 | — | — | *(sintética)* |

---

## 5. O que já se sabe sobre o negócio

### 5.1 O valor migrou do online para a loja — e **não foi desconto**

Entre as duas metades da janela: e-commerce **−13,6%** de receita, loja física
**+21,7%**. Compras por cliente estáveis (30,2 nas duas metades) → **não é
retração de demanda**.

A hipótese de erosão de desconto foi **testada e derrubada**. A causa é **mix de
produto**: o preço de tabela médio do que vendeu online caiu de R$ 256,25 para
R$ 231,54 e o da loja subiu de R$ 212,80 para R$ 231,67 — os dois canais
convergiram para a mesma cesta.

**Decomposição exata, sem resíduo.** Com P = preço praticado médio, T = tabela
médio, R = P/T:

```
P₁ − P₀ = R₀·(T₁ − T₀)  +  T₁·(R₁ − R₀)
           └── mix ──┘      └─ desconto ─┘
```

| Canal | Δ preço | Mix | Desconto |
|---|---|---|---|
| E-commerce | −R$ 23,69 | **−R$ 23,90** | +R$ 0,21 |
| Loja física | +R$ 17,13 | **+R$ 18,36** | −R$ 1,23 |

Motor do mix: **Moda** (2ª categoria mais cara) — −R$ 25.632 online e +R$ 11.410
na loja. Informática, Casa e Esporte no mesmo padrão; Áudio na direção oposta
(+R$ 10.637 online), amortecendo.

> **Recomendação:** não gastar verba de desconto para defender o share online.
> Migração de catálogo entre canais é sortimento e logística, não pricing.

### 5.2 Desconto é política, não negociação

Três degraus fixos (5/10/15%) indicam botão predefinido. Isso torna a
recomendação executável: não é "descontem menos", é **desligar o degrau de 15%,
que custa R$ 15.198 em 30 dias** sem contrapartida de volume.

### 5.3 A carteira é homogênea — não há Pareto

Gini **0,129**; top 20% = 27,0% da receita. Todos os 50 clientes são
**omnichannel** e compram em 9,9 de 10 categorias. Não há especialização, não há
concentração, e **não há espaço de cross-sell por categoria**.

---

## 6. Fórmulas validadas

Todas testadas (195 testes) e conferidas contra SQL.

### Base

```
receita_linha   = quantidade × preco_unitario
receita_total   = Σ receita_linha
ticket_medio    = receita_total / nº de id_venda distintos
desconto_linha  = 1 − preco_unitario / preco_atual
erosao          = Σ quantidade × (preco_atual − preco_unitario)
realizacao_pond = Σ(qtd×preco_unitario) / Σ(qtd×preco_atual)
variacao(a, b)  = b = 0 ? 0 : (a − b) / b        -- evita Infinity
```

### Período — **não existe YoY nesta base**

30 dias sem histórico anterior. A **única** comparação válida é *15 dias
recentes vs. 15 anteriores*:

```
corte = min(data_venda) + (max(data_venda) − min(data_venda)) / 2   -- 2025-12-28
```

Derive sempre da **janela completa** (`dataset.vendas`), nunca de um subconjunto
filtrado — senão cada painel compara um período diferente e os deltas param de
conversar entre si.

### Pricing — **não existe coluna de custo**

Margem contábil é **incalculável**. Nunca invente percentual de custo. Use:

```
mediana_mercado = mediana(preco_concorrente do produto)      -- 4 cotações
indice_preco    = preco_atual / mediana_mercado
posicao         = indice > 1,05 ? 'acima' : indice < 0,95 ? 'abaixo' : 'faixa'
oportunidade    = (mediana_mercado − preco_atual) × unidades
```

Faixa de paridade ±5%. Exclua as anomalias (§3.5) antes de qualquer recomendação
de reprecificação.

### Clientes — **não existe retenção, churn nem LTV**

Sem histórico anterior a 2025-12-13 não há "cliente perdido" nem "reativado".
Chame de *frequência em 30 dias*, não de retenção.

```
share_ecommerce = receita_ecommerce(cliente) / receita(cliente)
gini            = (2·Σ i·rᵢ) / (n·Σ rᵢ) − (n+1)/n     -- rᵢ CRESCENTE
RFM             = tercis sobre os 50 clientes
```

⚠️ **A recência não discrimina**: a base inteira comprou nos últimos 2 dias da
janela. O eixo R é praticamente constante — apoie-se em frequência e valor.

⚠️ **Safras de cadastro têm n de 3 a 21.** Rotule o n e não trate diferença
entre safras como tendência.

---

## 7. Regras de leitura que evitam painel mentiroso

1. **Órfãs:** dentro dos totais, fora dos cortes por produto. Declare a
   diferença em nota de rodapé.
2. **Denominador de percentual por categoria/produto:** use a receita
   **classificável**, não a total — senão o denominador infla com valor que não
   pode ser atribuído.
3. **Agrupe produto por `id_produto`**, nunca por `nome_produto` (nomes repetem).
4. **Geografia:** 22 UFs para 50 clientes, mediana de 2 por UF. Não existe
   "mercado forte no estado X" — existe **um cliente grande**.
5. **Concorrentes:** snapshot de um dia. Nunca plote como série temporal.
6. **Nunca eixo duplo.** Duas escalas → dois gráficos.
7. **Teto de séries:** 8 em barra/linha, **3 em scatter**. Acima disso, "Outros".
8. **Cor segue a entidade, não o ranking** — um filtro não pode repintar as
   séries sobreviventes.

---

## 8. Padrão de acesso recomendado

O que funcionou bem e vale repetir:

- **Carregue as 4 tabelas inteiras uma vez** (≈4.000 linhas, trivial nesta
  escala) e agregue em memória. Evita N queries e garante que os painéis
  concordem entre si.
- **Funções puras** sobre o dataset — sem I/O, sem relógio. É o que fica
  testável e o que permite validar contra SQL.
- **Regras compartilhadas num módulo único** (receita, período, órfãs). A causa
  raiz de divergência entre abas é cada seção redefinir a mesma coisa.
- **Docblock com `Fórmula:` e `Fonte:`** em cada KPI. Foi o que permitiu gerar
  este documento a partir do código.

⚠️ Esse padrão **não escala** além de dezenas de milhares de linhas. Aí migre
para agregação no banco (views ou RPC).

### Verificação — a lição mais cara do projeto

Typecheck, 195 testes e build **todos verdes**, e ainda assim: uma rota devolvia
HTTP 500 em produção, e um `<Insight>` recomendava cortar a faixa de desconto
errada com o valor errado.

O que pegou os dois: **renderizar de verdade e conferir os números contra SQL**.

> Teste que compara a implementação com ela mesma não valida fórmula nenhuma.
> Cruze com uma query independente.

---

## 9. Referências

| Documento | Conteúdo |
|---|---|
| [`00-verificacao-fase-0.md`](00-verificacao-fase-0.md) | Verificação inicial e perfil dos dados |
| [`01-fundacao-fase-1.md`](01-fundacao-fase-1.md) | Arquitetura e sistema de design |
| [`02-kpis-vendas.md`](02-kpis-vendas.md) | KPIs de Vendas |
| [`03-kpis-pricing.md`](03-kpis-pricing.md) | KPIs de Pricing |
| [`04-kpis-clientes.md`](04-kpis-clientes.md) | KPIs de Clientes |
| [`05-qa-e-seguranca.md`](05-qa-e-seguranca.md) | QA, segurança e limitações |
| [`../CONTRATO.md`](../CONTRATO.md) | Contrato de design e propriedade de arquivos |

Código-fonte das fórmulas: `src/lib/kpi/{vendas,pricing,clientes}.ts` e
`src/lib/data/regras.ts`.
