# QA, segurança e limitações dos dados

Responsável pelos testes: T5 (QA/Arquitetura), em modo somente-leitura sobre o
código de produção — escreve apenas em `tests/**`.

Rodar: `npm test` (Vitest, execução única) ou `npm run test:watch`.

## 1. Estratégia de teste

Nenhum teste toca a rede ou o Supabase. São dois tipos:

- **Testes de função pura** sobre um fixture determinístico — as funções de
  `regras.ts` e de `src/lib/kpi/*.ts` recebem um `Dataset` fabricado e o valor
  esperado é conferido à mão.
- **Auditoria estática** sobre os arquivos do repositório — regras do contrato
  que não cabem num teste de função (segredos, fronteira servidor/cliente,
  eixo duplo, cor solta).

A auditoria estática varre **o que existe**: enquanto uma seção não foi escrita,
os testes passam vazios; assim que o arquivo aparece, a regra passa a valer para
ele. Foi o que permitiu o QA rodar em paralelo com as três seções.

| Arquivo | Cobre |
|---|---|
| `tests/fixtures/dataset.ts` | fixtures determinísticos e as constantes reais da base |
| `tests/regras.test.ts` | núcleo compartilhado de `src/lib/data/regras.ts` |
| `tests/kpi-vendas.test.ts` | KPIs de Vendas e a concordância com a visão geral |
| `tests/kpi-pricing.test.ts` | mercado, índice, erosão, faixas, dispersão, oportunidades |
| `tests/kpi-clientes.test.ts` | cliente, concentração, RFM, safra, canal, migração, geografia |
| `tests/seguranca-arquitetura.test.ts` | auditoria estática do repositório |

A contagem por arquivo não está fixada aqui de propósito — a suíte cresceu
durante a auditoria e qualquer número escrito envelhece em uma hora. Rode
`npm test` para o estado corrente.

### `tests/fixtures/dataset.ts`

Sem rede e sem Supabase. **Dois cenários**: o principal (12 vendas, duas órfãs
com `id_produto: 'p999'`, um produto com `categoria` e `preco_atual` nulos, um
cliente sem estado nem data de cadastro, dois canais, datas espalhadas de modo
que o corte caia no meio de um dia) e um **de pricing** (linha com desconto,
venda acima da tabela, produto sem giro, snapshot competitivo suspeito e uma
órfã de R$ 4.995). Guarda também as **constantes reais da base**, conferidas por
SQL, para os testes de contrato contra os números de produção.

Números de referência: receita total 2.380; receita das órfãs 200; receita
classificável 2.180; corte em `2026-01-06T05:00:00.000Z`.

### `tests/regras.test.ts` — as definições compartilhadas

Cobre `receitaLinha`, `receitaTotal`, a regra das órfãs, `janela`,
`dividirPeriodos`, `variacao`, `agrupar` e `topNComOutros`. Os testes que mais
importam são os de **conservação**, porque são eles que impedem divergência entre
as abas:

- a diferença entre receita total e receita classificável é **exatamente** a
  receita das órfãs;
- `dividirPeriodos` **particiona**: não perde nem duplica linha, e a receita dos
  dois períodos reconstrói o total;
- a linha exatamente no corte cai no período **recente** (borda fechada à
  esquerda) — comportamento fixado por teste, não por acaso;
- `topNComOutros` preserva o total, nunca devolve mais de N+1 itens e deixa
  "Outros" por último;
- `variacao` nunca devolve `Infinity` nem `NaN` com base zero;
- a relação `total = classificável + órfãs` vale também para os números reais da
  base.

### `tests/kpi-vendas.test.ts` — a seção Vendas

Cobre os quatro KPIs de abertura, a série temporal, o corte por canal e os
cortes por produto. Destaques:

- a receita de abertura soma **todas** as vendas (órfãs incluídas) e é
  explicitamente diferente da receita classificável;
- a seção Vendas e a visão geral **concordam** em receita, delta, pedidos e
  ticket — teste cruzado entre módulos;
- a soma dos dias reconstrói a receita total, e em cada dia os dois canais somam
  o total do dia;
- as participações por canal somam 1;
- a **cor segue a entidade**: o índice de cor por canal é fixo e não muda com o
  ranking;
- nenhum produto órfão aparece no top de produtos; `topProdutos` agrupa por
  `id_produto`, não por nome;
- a curva de Pareto é monotônica e termina em 100% da receita classificável;
- com base vazia, os KPIs devolvem zero em vez de `NaN`/`Infinity`;
- **pureza**: nenhuma função muta o `Dataset` recebido, e duas chamadas idênticas
  devolvem o mesmo resultado (nada depende do relógio).

### `tests/kpi-pricing.test.ts` — a seção Pricing

Guardam as duas invariantes da seção: **nenhuma função pode devolver
"margem"** (há um teste que varre os campos retornados por todas as funções
exportadas procurando nome de margem ou custo) e **nada de série temporal** sobre
o snapshot de concorrentes. Além disso:

- a mediana com número par de cotações é a média das duas centrais;
- `cotacaoUniforme` marca o snapshot sintético, e `anomalo` exige cotação
  uniforme **e** índice ≥ 1,5;
- `classificar` respeita a faixa de paridade de ±5%, e as três posições somam o
  total de produtos cobertos;
- produto sem venda tem `precoPraticadoMedio` `null` — nunca 0, nunca `NaN`;
- venda **acima** da tabela não vira desconto negativo, e cai na faixa
  "Sem desconto";
- a erosão por categoria, por canal e por marca soma a mesma erosão total;
- as 5 faixas de desconto particionam as linhas e sempre voltam na mesma ordem
  (a cor segue a faixa, não o ranking);
- o scatter respeita o teto de 3 séries e nenhum ponto se perde ao dobrar o resto
  em "Outras categorias";
- o desconto do ponto é ponderado por volume, não média simples;
- `oportunidades` exclui os produtos anômalos, e o potencial soma **todos** os
  baratos com giro, não só os exibidos.

### `tests/kpi-clientes.test.ts` — a seção Clientes

Além das conservações usuais (receita por cliente soma a receita
total com órfãs incluídas; os dois canais somam o total do cliente):

- a **recência é medida contra o fim da janela**, nunca contra o relógio;
- cliente que não está na tabela `clientes` não some e recebe rótulo neutro;
- todo cliente ativo recebe exatamente um segmento e o `pctReceita` dos
  segmentos soma 1; os scores ficam sempre em 1..3;
- há um teste que **rejeita rótulo de ciclo de vida** (churn, perdido,
  reativado) nos nomes de segmento — a janela de 30 dias não sustenta esses
  conceitos;
- `comportamentoPorSafra`, `perfilDeCanal` e `intensidadeDeCanal` particionam os
  clientes, cada um exatamente uma vez;
- `distribuicaoGeografica` não perde receita, nomeia a UF ausente e as barras
  ficam em no máximo 9 itens (8 + "Outros");
- `canalPorPeriodo` separa receita e ticket em **dois blocos** — nunca eixo duplo;
- `repertorioDeCategorias` ignora as órfãs;
- a receita da aba Clientes é a mesma receita total do projeto.

### `tests/seguranca-arquitetura.test.ts` — auditoria estática

**Segredos e ambiente**
- nenhuma variável `NEXT_PUBLIC_*` carrega nome ou valor de segredo — inclui a
  checagem do payload base64 de um JWT `service_role`;
- o código da aplicação **nunca** lê `SUPABASE_SECRET_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `PGPASSWORD` ou `DATABASE_URL` de `process.env`;
- o cliente de browser só usa variáveis `NEXT_PUBLIC_*`;
- `.gitignore` cobre `.env` e `.env.local` e mantém `.env.example` versionado;
- `.env.example` não tem nenhum valor preenchido em campo de chave ou senha.

**Fronteira servidor → cliente**
- nenhuma `page.tsx` de seção é um Client Component inteiro;
- os únicos arquivos com `'use client'` estão em `_components/`;
- nenhum `Dataset` inteiro é passado por prop, espalhado em props, tipado num
  componente de cliente ou importado via `getDataset` no cliente;
- nenhum componente de cliente fala direto com o Supabase.

**Consistência entre as três seções**
- toda `page.tsx` carrega dados por `getDataset()`;
- nenhuma seção recalcula `quantidade * preco_unitario` por conta própria —
  só `src/lib/data/` pode;
- nenhuma seção reimplementa `Intl` (formatação vem de `format.ts`);
- nenhum hex solto nos arquivos de seção (a paleta vem de `tokens.ts`);
- **nenhum eixo duplo**: nada de `orientation="right"` e no máximo um `yAxisId`
  distinto por arquivo;
- nenhuma nona cor de série: `topNComOutros` nunca é chamado com N > 8 e a
  paleta nunca é indexada fora dos 8 slots;
- **toda função de KPI exportada tem docblock com `Fórmula:` e `Fonte:`** — é o
  teste que garante que esta documentação corresponde ao código;
- nenhuma função de KPI usa `Date.now()` ou `new Date()` sem argumento.

**Camada de dados**
- a paginação usa blocos de 1.000 e continua enquanto a página vier cheia;
- `getDataset` é memoizado por request com o `cache()` do React;
- o middleware valida a sessão com `getUser()` — e o teste **proíbe
  `getSession()`**, que não valida o JWT — e redireciona anônimo para `/login`.

## 2. Achados do QA

Sete achados, todos abertos como tarefa para o dono do arquivo (o QA não edita
código de produção). **Seis já foram corrigidos** pelos respectivos donos e a
suíte fecha verde; segue aberto apenas o **#8**, que exige migração no banco. Nenhum era exploração ativa.

### #9 — `classificar()` sem "Fonte:" no docblock — CORRIGIDO
`src/lib/kpi/pricing.ts`. O contrato exige **Fórmula e Fonte** em toda função de
KPI exportada; `classificar()` tinha só a fórmula, e era a única falha de
`npm test`. O T3 acrescentou a fonte (o índice vem de `indicePorProduto()`). O
teste que acusava é
`tests/seguranca-arquitetura.test.ts > todo KPI de seção documenta Formula e Fonte`.

### #7 — Paginação de `getDataset()` ordena por coluna não-única — CORRIGIDO
`src/lib/data/fetch.ts`. Para `vendas`, a paginação usa
`.order('data_venda').range(from, from+999)`, mas `data_venda` **não é única**:
3.020 linhas para 3.016 timestamps distintos (4 empates, conferido por SQL). O
Postgres não garante ordem estável entre execuções com chave de ordenação
empatada, então uma linha empatada pode aparecer em duas páginas (receita
inflada) ou em nenhuma (receita truncada). A chance é pequena com 3.020 linhas,
mas é não-determinismo silencioso no número que o dashboard inteiro usa.
Correção aplicada: `fetchAll` passou a aceitar uma **lista** de colunas de
ordenação, e `vendas` agora ordena por `data_venda` + `id_venda`. As outras três
tabelas já ordenavam por coluna única.

### #10 — Corte de 15 dias de Pricing sobre subconjunto filtrado — CORRIGIDO
`src/lib/kpi/pricing.ts`, em `resumoPricing()`. `dividirPeriodos()` recebe as
vendas já enriquecidas e filtradas por `!semPreco` — um subconjunto. Como
`janela()` tira mínimo e máximo desse subconjunto, o corte de Pricing é a mediana
temporal de **outro** conjunto, enquanto Vendas e Clientes cortam sobre
`dataset.vendas` inteiro. **Impacto hoje é zero** (os extremos da base pertencem
a vendas não órfãs e todos os 215 produtos têm `preco_atual > 0`, então os três
cortes coincidem), mas basta a venda mais antiga ou mais recente ser órfã para
Pricing passar a comparar um período diferente do das outras abas. O padrão
correto já existia em `vendas.ts`, em `deltaCategoriaPorCanal()`. Correção
aplicada: `pricing.ts` ganhou o auxiliar `metadesDoProjeto()`, que tira o corte de
`dataset.vendas` inteiro e particiona o subconjunto por ele.

### #12 — `janela([])` produz `Invalid Date` — CORRIGIDO
`src/lib/data/regras.ts`. Com lista vazia, `Math.min(...[])` é `Infinity` e o
retorno são três `Invalid Date`. `dividirPeriodos([])` sobrevive (toda comparação
com `NaN` é falsa, e há teste cobrindo), mas `dataCorte()` e
`periodoObservado()` chamam `.toISOString()` e lançam `RangeError`. Basta a
leitura devolver `[]` para a rota de Vendas quebrar em vez de mostrar estado
vazio. Correção aplicada: `janela()` ganhou guarda para lista vazia e passou a
devolver um campo `vazio: true`, com datas de fallback, em vez de `Invalid Date`.
Nota secundária ainda válida: `Math.min(...ts)` espalha o array inteiro — seguro
com 3.020 linhas, estoura a pilha na casa das centenas de milhares.

**Desdobramento (#13), também corrigido:** a primeira versão da guarda devolvia
`new Date()` — o relógio da máquina —, o que tornava `janela()` não
determinística e faria o painel rotular "período observado: hoje" como se fosse
a janela dos dados. A versão final devolve **epoch** (`new Date(0)`): é
determinístico e obviamente não é a janela. Os consumidores ramificam pela flag
`vazio` e renderizam estado vazio.

### #11 — Middleware: escape perdido no matcher — CORRIGIDO
`src/middleware.ts`. O matcher usa `'.*\.(?:svg|png|...)$'` entre aspas simples;
em JavaScript `'\.'` vira `'.'`, então o regex efetivo casa **qualquer**
caractere no lugar do ponto. Consequência: um caminho como `/relatoriospng` casa
a exclusão e **pula o middleware inteiro**, ficando acessível sem sessão.
Correção: `'\\.'` ou a classe `[.]`. Ponto secundário: no redirect para `/login`
o middleware devolve um `NextResponse.redirect` novo, descartando os cookies que
`setAll` escreveu — hoje inócuo (não há sessão a preservar nesse caminho), mas o
padrão do `@supabase/ssr` é copiar `response.cookies.getAll()` para a resposta de
redirect.

O que está **correto** e deve ser mantido: o middleware usa
`supabase.auth.getUser()`, que valida o JWT no servidor, e não `getSession()`.
Há teste travando isso.

### Hex solto em `SafraChart.tsx` — CORRIGIDO
`src/app/(dashboard)/clientes/_components/SafraChart.tsx` tinha duas cores em hex
(`#c3c2b7` / `#52514e`) direto no `LabelList`, em vez de vir de `tokens.ts`. O T4
corrigiu antes mesmo de virar tarefa. É o tipo de desvio que a auditoria estática
pega sozinha — há um teste que proíbe hex nos arquivos de seção.

### `deltaPedidos` contava linhas, `pedidos` contava pedidos — CORRIGIDO
Em `desempenhoPorCanal()` (`src/lib/kpi/vendas.ts`), o campo `deltaPedidos`
calculava a variação sobre o **número de linhas**, enquanto o campo `pedidos` do
mesmo objeto contava **`id_venda` distintos** — dois significados de "pedido" no
mesmo objeto. Idêntico na base de hoje, porque `id_venda` é único nas 3.020
linhas; passaria a contar **itens em vez de pedidos** assim que houvesse carrinho
multi-item. Corrigido pelo T2 e travado por um **fixture sintético**, que é o
único jeito de distinguir as duas implementações — com os dados reais, os dois
cálculos dão o mesmo número e o teste passaria errado.

### Segunda função de pricing sem "Fonte:" — CORRIGIDO
Um docblock em `src/lib/kpi/pricing.ts` escrevia `Formula (identidade exata...)`
sem os dois-pontos, e com isso escapava do regex da regra do CONTRATO §5.
Corrigido pelo T3. Vale como lembrete de que a auditoria estática vale o que vale
o padrão que ela procura.

### Duas realizações de preço — ambas corretas, medindo coisas diferentes

Não houve número errado. Existem **duas leituras** da realização, e o que se
propagou para os textos de resumo foi um rótulo de coluna de uma query
exploratória, não um cálculo equivocado:

| Leitura | Valor | Fórmula |
|---|---|---|
| **Ponderada por receita** (a do painel) | **0,968271** | `Σ qtd·preco_unitario / Σ qtd·preco_atual` |
| Média simples por linha | 0,968929 | `avg(preco_unitario / preco_atual)` |

A ponderada é a que `metricasErosao()` e `resumoPricing()` calculam, a que o
`<KpiTile>` renderiza e **a única que fecha com a erosão de R$ 31.779,89**. O T3
verificou os 4 arquivos da seção: não há nenhum valor fixo no código, tudo
renderiza em runtime — **nenhum painel exibiu número errado**. O 0,9689 viveu só
nas mensagens entre a equipe e no texto da Fase 0, já corrigido.

**Por que o card de decomposição mostra as duas lado a lado.** É decisão de
projeto, não redundância. Na metade anterior da loja física as duas leituras
ficam a **0,08 p.p.** uma da outra; na metade recente, a **0,78 p.p.** A
divergência aparece exatamente quando o **alvo** do desconto muda (tabela média
das linhas descontadas indo de R$ 196,02 para R$ 240,10). Exibir só uma faria a
aba de Pricing e a visão geral parecerem se contradizer sem explicação — e a
divergência entre elas é justamente a informação.

Outros números de referência: erosão de **R$ 31.779,89**, **1.159 linhas com
desconto** e **136 vendidas acima da tabela**.

### #8 — Grants de escrita de `anon`/`authenticated` — ABERTO (severidade média)
Achado de auditoria do banco. Via `information_schema.role_table_grants`, os
papéis `anon` e `authenticated` têm `DELETE`, `INSERT`, `UPDATE`, `TRUNCATE`,
`REFERENCES`, `TRIGGER` e `SELECT` nas 4 tabelas — os grants padrão do Supabase
no schema `public`.

**Por que hoje está seguro:** RLS ativo e existe apenas policy de `SELECT`. Sem
policy de escrita, o PostgREST barra qualquer `INSERT`/`UPDATE`/`DELETE`,
inclusive anônimo, e os advisors voltam limpos.

**Por que ainda importa:** o grant é o que sobra se a RLS for desligada por
engano numa migração futura, e `TRUNCATE` não é filtrado por RLS. O dashboard é
100% leitura, então nada justifica manter permissão de escrita.

**Pendência aguardando decisão da usuária — o SQL está pronto, não foi
aplicado:**

```sql
revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public
  from anon, authenticated;

-- mantém o que o dashboard precisa:
grant select on all tables in schema public to authenticated;
```

Considerar também revogar o `SELECT` de `anon` — já inócuo por falta de policy,
mas explícito é melhor que implícito.

## 3. Qualidade de dados — a seção que valida a própria fonte

Dois achados de conteúdo (não de código). São a razão de o projeto tratar
validação de fonte como parte do KPI, e não como etapa anterior a ele.

### Categoria Tênis: snapshot competitivo sintético

Os **15 produtos** da categoria **Tênis** têm os 4 concorrentes cotando
**exatamente o mesmo preço**, sempre metade do nosso preço de tabela — índice
competitivo **2,000 nos 15** — e **zero vendas** no período. Quatro concorrentes
independentes não convergem ao centavo em 15 produtos: isso é assinatura de dado
gerado, não posição de mercado.

Impacto se ninguém filtrasse: o dashboard reportaria **"estamos 7,7% acima do
mercado"** num KPI de capa, quando a mediana real do catálogo é **1,01** —
praticamente paridade. Seria uma mentira no número mais visível da seção.

Tratamento: `anomaliasCompetitivas()` isola esses produtos, exclui os 15 das
recomendações de reprecificação de `oportunidades()` e marca a categoria como
dado suspeito na interface (`contemAnomalia`). O critério é explícito e testável
— cotação uniforme **e** índice ≥ `LIMIAR_ANOMALIA` (1,5).

### FK `NOT VALID` e as 20 vendas órfãs

Já descrito na [Fase 0](00-verificacao-fase-0.md). Mesma lógica: em vez de
descartar as linhas ou fingir que não existem, a regra é declarada (contam nos
totais, saem dos cortes por produto) e a diferença aparece na tela via
`notaRodapeOrfas()`.

## 4. Postura de segurança

| Item | Estado |
|---|---|
| Advisors de segurança do Supabase | 0 alertas |
| RLS | ativo nas 4 tabelas; `SELECT` só para `authenticated` |
| Acesso anônimo | não lê nenhuma linha (verificado na Fase 0) |
| Chave de serviço | `SUPABASE_SECRET_KEY` e `PGPASSWORD` **vazios** — não existe service_role no projeto |
| Variáveis públicas | apenas URL e chave publicável, que respeita RLS |
| Arquivos de ambiente | `.env` e `.env.local` no `.gitignore` e ausentes de `git ls-files` |
| `.mcp.json` | versionado, mas só com o `project_ref` — sem token |
| Validação de sessão | `getUser()` no middleware (valida o JWT no servidor), nunca `getSession()` |
| Fronteira servidor/cliente | nenhum `Dataset` atravessa; gráficos recebem dados agregados |
| Dependências | `next` elevado de 14.2.15 para 14.2.35 por CVE |
| Tipagem | `npx tsc --noEmit` limpo, zero erros |

**Conclusão do QA: nada crítico, nenhum segredo exposto.**

Dois pontos de atenção não-bloqueantes:

1. Como a policy é `qual = true` para `authenticated`, **qualquer usuário
   autenticado lê a base inteira**. Adequado para um dashboard interno; não
   sobrevive a um cenário multi-tenant sem policy por `auth.uid()`.
2. `getDataset()` puxa as 4 tabelas inteiras (~4.000 linhas) a cada request.
   Adequado nesta escala; além de dezenas de milhares de linhas, a agregação
   teria de descer para o banco.

## 5. Limitações conhecidas dos dados

Valem para toda leitura feita no dashboard. Estão documentadas aqui porque
nenhum gráfico deve ser interpretado sem elas.

**O fio condutor, com todas as letras: esta base é pequena, curta e homogênea.**
Ela serve muito bem para demonstrar a arquitetura e o método — regras únicas de
receita, validação da própria fonte, deltas honestos, testes de conservação. Mas
**várias análises clássicas de ecommerce simplesmente não têm sustentação aqui**:
não há coorte, não há Pareto de carteira, não há grupo mono-canal, não há
especialização por cliente, não há margem. Dizer isso é mais útil que fingir
robustez, e é por isso que cada seção carrega a ressalva junto do número em vez
de escondê-la no rodapé.

### Janela de 30 dias (2025-12-13 → 2026-01-11)
Não há histórico anterior. **Não existe YoY, sazonalidade, retenção, churn nem
LTV.** Todo delta do projeto é últimos 15 dias vs. 15 dias anteriores, dentro da
própria janela. A janela sai dos dados, não do calendário, e o painel exibe a
data de corte. Uma comparação de 15 contra 15 dias em dezembro/janeiro atravessa
o Natal e o Ano-Novo: a diferença entre as metades tem componente de calendário
que a base não permite isolar.

### 50 clientes
Qualquer recorte cai para grupos de 1 a 21 pessoas. As safras de cadastro têm
`n` de 3 a 21 — a seção marca `amostraSuficiente = false` abaixo de 10 e exibe o
`n`. Há 22 UFs para 50 clientes, com mediana de 2 clientes por estado e vários
estados com **um**: ali a receita do estado é a de uma pessoa. Diferença entre
grupos pequenos não é tendência.

### A carteira é homogênea — quatro ausências de dado, não de análise

Os quatro fatos abaixo foram apurados pela seção de Clientes e **impedem**
análises que o leitor vai procurar:

- **Todos os 50 clientes são omnichannel.** Não existe grupo mono-canal na base.
  A comparação "só-online vs. só-loja" é impossível — é ausência de dado, não
  escolha de recorte. A substituta é `intensidadeDeCanal()`, que mede o *quanto*
  de cada cliente vai para o online.
- **A recência não discrimina.** A base inteira comprou nos últimos 2 dias da
  janela, então o eixo R do RFM é praticamente constante. A segmentação se apoia
  em frequência e valor, e o painel omite o R quando `recenciaInformativa` é
  falso.
- **Não há concentração de receita.** Gini **0,129**; o top 20% responde por
  **27,0%** da receita. **Não existe 80/20 nesta base** — quem procurar Pareto de
  carteira não vai achar, e isso está registrado de propósito, porque a ausência
  do padrão esperado é o achado.
- **Cada cliente compra em 9,9 de 10 categorias.** Não há especialização por
  cliente, e portanto não há espaço de crescimento em cross-sell por categoria.

### Snapshot de concorrentes de um único dia (2026-01-11)
4 concorrentes, 215 produtos, 728 linhas, **uma só data de coleta**. Não existe
série temporal de preço de concorrente e nenhuma função devolve uma. Além disso,
parte do snapshot é suspeita: em alguns produtos os 4 concorrentes cotam
exatamente o mesmo valor com índice acima de 1,5 — `anomaliasCompetitivas()`
isola esses casos e eles ficam fora das recomendações de preço.

### Sem coluna de custo
Margem contábil é incalculável. A seção de Pricing usa dois proxies declarados
(posição competitiva e erosão de desconto) e nenhum painel exibe "margem bruta".

### 20 vendas órfãs (~R$ 4.240)
A FK `vendas_id_produto_fkey` está `NOT VALID`. As órfãs contam nos totais de
receita e saem dos cortes por produto/categoria/marca, sempre com nota de rodapé.
Consequência prática: a receita total e a soma das categorias **não fecham** — e
é assim de propósito, com a diferença declarada na tela.

### Outras
- 30 dos 215 produtos não venderam na janela; a concentração é medida entre os
  205 que venderam.
- Cada linha de `vendas` tem `id_venda` próprio: "pedido" significa a compra de
  um item, não um carrinho multi-item. "Compras por cliente" precisa ser lido
  com isso em mente.
- Um único país na base, logo não há corte geográfico por país.

## 6. Estado da suíte

Verificado nesta máquina, após todas as correções:

```
npm test        # = tsc --noEmit && vitest run

 (tsc: sem saída — zero erros)
 Test Files  5 passed (5)
      Tests  185 passed (185)
```

As 4 rotas constroem. A suíte cresceu durante a auditoria — houve execuções com
175 e com 184 —, então **rode `npm test` para o número corrente** em vez de
confiar no que está escrito aqui. O que se mantém em todas as execuções é o que
importa: **nenhuma falha e `tsc` limpo**.

**#14, corrigida:** `npm test` agora roda `tsc --noEmit && vitest run`. Antes
executava só o Vitest, que apaga os tipos sem checá-los — uma suíte verde não
dizia nada sobre o estado do `tsc`, e isso custou tempo real de investigação a um
dos agentes. Os scripts separados continuam disponíveis: `npm run test:unit`
(só testes) e `npm run typecheck` (só tipos).

Fica aberto **um único item**: a **#8**, aguardando decisão da usuária —
revogar os grants de escrita de `anon`/`authenticated` no banco. O SQL está
pronto na seção 2 e **não foi aplicado**.

Nenhum dos achados corrigidos alterou os números exibidos no dashboard — todos
eram fragilidade latente.
