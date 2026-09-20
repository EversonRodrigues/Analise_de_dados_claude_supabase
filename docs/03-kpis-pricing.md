# KPIs — Pricing & Margem

Código: `src/lib/kpi/pricing.ts` (funções puras) e
`src/app/(dashboard)/pricing/` (Server Component + gráficos `'use client'`).

## A restrição que define a seção

**Não existe coluna de custo em nenhuma das 4 tabelas.** Margem bruta contábil é
incalculável. Nenhuma função deste arquivo devolve "margem" e nenhuma inventa
percentual de custo. Tudo aqui são dois proxies honestos:

1. **Posicionamento competitivo** — `produtos.preco_atual` contra a mediana dos 4
   concorrentes.
2. **Erosão de desconto** — preço de tabela contra o preço efetivamente praticado
   na venda.

Além disso, `preco_competidores` é um **snapshot de um único dia (2026-01-11)**.
Nenhuma função devolve série temporal de preço de concorrente, e a interface
rotula a data via `dataSnapshotCompetidores()`.

## Limiares (exportados, para o QA testar)

| Constante | Valor | Significado |
|---|---|---|
| `FAIXA_PARIDADE` | 0,05 | ±5% em torno da mediana do mercado conta como "na faixa" |
| `TOLERANCIA_DESCONTO` | 0,001 | tolerância de arredondamento para dizer que uma linha saiu com desconto |
| `LIMIAR_ANOMALIA` | 1,5 | acima deste índice **e** com os 4 concorrentes cotando o mesmo preço, a leitura vira "snapshot corrompido", não "somos caros" |
| `ALL_PAIRS_SERIES_CAP` | 3 | teto de séries em scatter (vem de `tokens.ts`) |

## 1. Base competitiva

### `referenciaMercado(dataset)` → `Map<id_produto, ReferenciaMercado>`
- **Fórmula:** mediana dos preços dos concorrentes do produto (interpolação linear nos pares), mais mínimo, máximo e contagem de concorrentes.
- **Fonte:** `preco_competidores.preco_concorrente` agrupado por `id_produto` (snapshot de 2026-01-11).
- **Leitura:** a mediana é a referência, não a média — com 4 cotações, uma outlier distorceria a média e não a mediana. O campo `cotacaoUniforme` (mínimo = máximo) marca produtos em que os 4 concorrentes cotam exatamente o mesmo valor, sinal de dado sintético.

### `classificar(indice)` → `'acima' | 'faixa' | 'abaixo'`
- **Fórmula:** `> 1 + 0,05` → acima; `< 1 − 0,05` → abaixo; senão faixa.
- **Fonte:** o índice vem de `indicePorProduto()` — `produtos.preco_atual` dividido pela mediana de `preco_competidores.preco_concorrente` do mesmo produto.
- **Leitura:** a faixa de paridade evita ler ruído de centavos como decisão de preço.

### `indicePorProduto(dataset)` → `LinhaIndiceProduto[]`
- **Fórmula:** `indice = produtos.preco_atual / mediana(preco_concorrente do produto)`; `unidades = SOMA(vendas.quantidade)`; `receita = SOMA(quantidade × preco_unitario)`; `precoPraticadoMedio = receita / unidades` (ou `null` se o produto não vendeu).
- **Fonte:** `produtos.preco_atual`, `preco_competidores.preco_concorrente`, `vendas`.
- **Órfãs:** fora — é corte por produto; o painel exibe `notaRodapeOrfas()`.
- **Leitura:** a tabela mestre da seção. Índice 1,00 é paridade; 1,15 é 15% acima do mercado. Traz o **giro** junto porque preço sem volume não sustenta decisão: estar caro num produto que ninguém compra é um problema diferente de estar caro no que vende.
- **Exclusões:** produtos sem cotação de concorrente, sem `preco_atual` ou com mediana zero não entram.

### `anomaliasCompetitivas(dataset)` → `Anomalia[]`
- **Fórmula:** produtos com `cotacaoUniforme = true` **e** `indice ≥ 1,5`, agrupados por categoria (nº de produtos, índice médio, unidades vendidas).
- **Fonte:** `preco_competidores.preco_concorrente`, `produtos.preco_atual`, `vendas.quantidade`.
- **Leitura:** existe para **impedir uma conclusão errada**. Quatro concorrentes cotando o centavo exato e um índice de 1,5+ não descrevem um mercado real; descrevem um snapshot sintético. Esses produtos aparecem sinalizados e ficam fora das recomendações de `oportunidades()`.

### `dataSnapshotCompetidores(dataset)`
- **Fórmula:** menor `data_coleta` da tabela (a coleta ocorreu em um único dia).
- **Fonte:** `preco_competidores.data_coleta`.
- **Leitura:** rótulo obrigatório na interface — o leitor precisa saber que a comparação competitiva é de uma data só.

## 2. Posicionamento competitivo

### `posicionamentoPorCategoria(dataset)` → `PosicionamentoCategoria[]`
- **Fórmula:** por `produtos.categoria`, contagem de produtos `acima` / `faixa` / `abaixo` via `classificar(indice)`, mais a mediana dos índices da categoria.
- **Fonte:** `produtos.preco_atual` vs. mediana de `preco_competidores.preco_concorrente`.
- **Leitura:** revela se o desalinhamento de preço é do catálogo inteiro ou de categorias específicas. Ordenado pelo índice mediano decrescente; `contemAnomalia` avisa quando a leitura da categoria está contaminada pelo snapshot suspeito.
- **Cor:** polaridade em torno de 1,00 → paleta **divergente** (azul ↔ vermelho com cinza no neutro), não categórica.

### `posicionamentoGeral(dataset)` → `PosicionamentoGeral`
- **Fórmula:** mesma contagem sobre todo o catálogo coberto, mais `indiceMediano`, `produtosAnomalos` e `semCobertura` (produtos do catálogo sem nenhuma cotação).
- **Fonte:** `produtos` (215 linhas) × `preco_competidores`.
- **Leitura:** o retrato de uma linha do posicionamento, e o número que o `<KpiTile>` de abertura exibe. `semCobertura` é honestidade metodológica: diz sobre quantos produtos a análise competitiva simplesmente não fala.

## 3. Erosão de desconto e realização de preço

### `metricasErosao(vendas)` → `MetricasErosao`
Bloco reutilizado por todos os cortes desta parte.
- **Fórmula:**
  - `erosao = SOMA(quantidade × (preco_atual − preco_unitario))` — positivo é dinheiro deixado na mesa;
  - `realizacao = SOMA(quantidade × preco_unitario) / SOMA(quantidade × preco_atual)` — 1,00 é venda sem desconto líquido;
  - desconto da linha = `1 − preco_unitario / preco_atual`;
  - `pctLinhasComDesconto` e `descontoMedioQuandoHa` (média **apenas** nas linhas descontadas).
- **Fonte:** `vendas.quantidade`, `vendas.preco_unitario`, `produtos.preco_atual`.
- **Exclusões:** linhas cujo produto não tem preço de tabela ficam de fora — sem tabela não há desconto a medir.
- **Leitura:** `descontoMedioQuandoHa` é separado de propósito. Diluir o desconto sobre as linhas que saíram a preço cheio esconderia a profundidade real da concessão.

### `erosaoPorCategoria(dataset)` / `erosaoPorCanal(dataset)` / `realizacaoPorMarca(dataset)` → `ErosaoPorChave[]`
- **Fórmula:** `metricasErosao()` aplicada por `produtos.categoria`, por `vendas.canal_venda` e por `produtos.marca`, respectivamente. Ordenação por erosão decrescente.
- **Fonte:** `vendas × produtos`.
- **Órfãs:** excluídas (precisam do preço de tabela do produto).
- **Leitura:** os três cortes respondem perguntas diferentes: *qual categoria* está dando desconto, se o desconto é prática de **canal** (loja física negocia, e-commerce não), e quais **marcas** conseguem sustentar o preço de tabela. A ordenação por erosão em reais põe no topo o que custa mais caro, não o maior percentual sobre base pequena.

## 4. Elasticidade aparente — o desconto compra volume?

### `elasticidadePorFaixa(dataset)` → `FaixaDesconto[]`
- **Fórmula:** desconto da linha = `1 − preco_unitario / preco_atual`, distribuído em 5 faixas (`Sem desconto`, `0–5%`, `5–10%`, `10–15%`, `15%+`); `unidadesPorPedido = SOMA(quantidade) / nº de linhas da faixa`.
- **Fonte:** `vendas.preco_unitario`, `vendas.quantidade`, `produtos.preco_atual`.
- **Leitura:** **não é elasticidade-preço econométrica** — é a leitura descritiva de se o desconto vem acompanhado de mais volume por pedido dentro da janela de 30 dias. Se `unidadesPorPedido` for plano entre as faixas, o desconto está sendo dado sem comprar volume, e a erosão é perda pura.

### `dispersaoDescontoVolume(dataset, maxSeries = 3)` → `SerieDispersao[]`
- **Fórmula:** por produto, `desconto = 1 − SOMA(qtd × preco_unitario) / SOMA(qtd × preco_atual)` e `unidades = SOMA(quantidade)`.
- **Fonte:** `vendas × produtos`. Produtos sem venda no período ficam de fora.
- **Leitura:** a checagem visual da faixa anterior — cada ponto é um produto. Scatter tem teto de **3 séries** (`ALL_PAIRS_SERIES_CAP`), então as `maxSeries − 1` maiores categorias por receita viram série própria e o resto é dobrado em "Outras categorias". Nunca um quarto matiz num scatter.

## 5. Oportunidades — onde está o dinheiro na mesa

### `oportunidades(dataset, limite = 6)` → `Oportunidades`
- **Fórmula:**
  - `giroMediano` = mediana das unidades vendidas entre os produtos cobertos;
  - `carosSemGiro` = `indice > 1,05` **e** `unidades ≤ giroMediano`, ordenados por índice decrescente; `valor` = a erosão de desconto já praticada nesse produto;
  - `baratosComGiro` = `indice < 0,95` **e** `unidades > giroMediano`; `valor = (mediana_mercado − preco_atual) × unidades`, ordenados por valor;
  - `potencialBaratosComGiro` = soma do `valor` de **todos** os baratos com giro (não só dos `limite` exibidos).
- **Fonte:** `produtos.preco_atual`, `preco_competidores`, `vendas.quantidade`.
- **Exclusões:** produtos com snapshot anômalo ficam de fora — recomendar reprecificação com base em cotação sintética seria pior que não recomendar.
- **Leitura de negócio:** são as duas pontas da mesma decisão.
  - *Caros sem giro*: o preço está travando a venda. Ação: revisar preço ou aceitar que o produto é de cauda.
  - *Baratos com giro*: já vendem bem estando abaixo do mercado. Subir até a paridade é receita quase direta, e `potencialBaratosComGiro` dá o tamanho dessa oportunidade em 30 dias.
- **Cuidado ao citar:** o potencial assume volume constante após o aumento de preço. É um teto, não uma previsão — e a base de 30 dias não permite validar a elasticidade que sustentaria a previsão.

## 6. Mix ou desconto? A decomposição por canal

### `decomposicaoPrecoPorCanal(dataset)` → `DecomposicaoCanal[]`
- **Fórmula (identidade exata, sem resíduo — travada por teste nos dois datasets):** com `P = média(preco_unitario)`, `T = média(preco_atual)` e `R = P / T` em cada metade da janela,

  ```
  P₁ − P₀ = R₀·(T₁ − T₀)  +  T₁·(R₁ − R₀)
            \___ mix ___/     \_ desconto _/
  ```

  O efeito mix é avaliado à razão antiga; o de desconto, sobre o mix novo. As duas parcelas somam exatamente o delta observado.
- **Fonte:** `vendas.preco_unitario`, `vendas.canal_venda`, `produtos.preco_atual`. Órfãs excluídas (precisam do preço de tabela).
- **Leitura:** responde "os canais convergiram porque o online passou a descontar mais?". Separa a queda do preço médio praticado em **mudança de mix** (passaram a vender outros produtos) e **mudança de política de desconto** (mesmo mix, preço menor) — que exigem ações opostas.
- **Resultado nesta base (decomposto pelo T3, conferido no banco pelo líder):** a resposta é **mix de produto, não desconto** — e o desconto não se moveu em volume: o que mudou foi o **alvo**. O percentual médio de desconto ficou plano nos dois canais, em torno de 9% (e-commerce 9,35% → 9,31%; loja física 8,83% → 9,04%), e a frequência de linhas descontadas mal se mexeu. O que mudou foi **em que produto o desconto cai**: na loja, o preço de tabela médio das linhas descontadas subiu de **R$ 196,02 para R$ 240,10** — antes descontava o item barato, agora desconta o caro; no e-commerce foi o inverso, **R$ 263,71 → R$ 224,78**. Mesmo percentual, produto diferente. É exatamente por isso que a realização **ponderada por receita** cai 0,67 p.p. na loja (97,01% → 96,34%) enquanto a média simples parece estável: a ponderada enxerga o alvo, a simples não. No e-commerce a ponderada vai de 96,95% a 96,84% (−0,11 p.p.). A decomposição fecha sem resíduo — e-commerce **−R$ 23,69 = mix −R$ 23,90 + desconto +R$ 0,21**; loja física **+R$ 17,13 = mix +R$ 18,36 + desconto −R$ 1,23**. A cesta é que mudou: o preço de tabela médio do que vendeu online caiu de R$ 256,25 para R$ 231,54 e o da loja subiu de R$ 212,80 para R$ 231,67 — os dois canais convergiram para **a mesma cesta**. A hipótese de erosão de desconto no online foi **testada e descartada**.
- **Motor do mix:** a categoria **Moda** (tabela média R$ 347,92, a 2ª mais cara do catálogo) moveu **−R$ 25.632 no e-commerce e +R$ 11.410 na loja** entre as metades. Informática, Casa e Esporte seguem o mesmo padrão; **Áudio** foi na direção oposta (+R$ 10.637 online) e amorteceu a queda.
- **Leitura de negócio:** migração de catálogo entre canais é decisão de **sortimento e logística, não de pricing**. Não se deve gastar verba de desconto tentando defender o share online — o desconto não causou o movimento e, pelos números acima, também não o conteria.
- **Base de cálculo e a nota metodológica que mudou a conclusão:** a decomposição usa **média simples por linha** para P e T (o preço médio unitário, a mesma base da seção de Clientes), mas o tipo também devolve `realizacaoAnterior`/`realizacaoRecente` **ponderadas por receita** — e devolve as duas de propósito, porque **a divergência entre elas é informação, não erro de conta**: quando a ponderada cai e a simples não, o desconto mudou de alvo, migrando para produtos de tabela mais alta. **A ponderada é a correta para impacto em receita** e é a que a seção de Pricing e a visão geral exibem. Quem reusar este código precisa escolher a medida conscientemente — nesta base ela troca a conclusão.

### `metadesDoProjeto()` (interno)
Auxiliar que particiona um subconjunto de vendas pelo corte calculado sobre
`dataset.vendas` **inteiro**. Existe para que o delta de 15 dias de Pricing
converse com o de Vendas e o de Clientes — mesma decisão de
`deltaCategoriaPorCanal()` em `vendas.ts`. Ver achado #10 em
[`05-qa-e-seguranca.md`](05-qa-e-seguranca.md).

## 7. Abertura da seção

### `resumoPricing(dataset)` → `ResumoPricing`
- **Fórmula:** `metricasErosao()` na janela inteira e em cada metade (via `metadesDoProjeto`, que corta pela janela completa do projeto); `delta = variacao(recente, anterior)` para realização, erosão e % de linhas com desconto. Inclui `indiceMedianoMercado` (de `posicionamentoGeral`) e a contagem/valor das linhas vendidas **acima** do preço de tabela.
- **Fonte:** `vendas × produtos`, `preco_competidores`.
- **Leitura:** os tiles de topo. Realização caindo com % de linhas descontadas subindo é concessão se espalhando; realização caindo com o percentual estável é concessão ficando mais profunda nos mesmos lugares. `linhasAcimaTabela` / `valorAcimaTabela` capturam o inverso — vendas acima da tabela, que indicam preço de tabela desatualizado.
- **Período:** não existe YoY na base (2025-12-13 a 2026-01-11). A única comparação válida é 15 dias vs. 15 dias anteriores.

## 8. O que a seção conclui nesta base

Números apurados pelo T3 e conferidos pelo líder direto no banco. São a leitura
de negócio que os KPIs acima sustentam.

### Desconto não compra volume — a curva é plana
Unidades por linha de venda: **1,424 sem desconto** contra **1,479 na faixa de
15%+**. Entre a ponta sem concessão e a concessão mais profunda, o ganho de
volume é marginal. Como `elasticidadePorFaixa()` é descritiva e não
econométrica, isso não prova ausência de elasticidade — mas mostra que, dentro
desta janela, o desconto saiu sem contrapartida mensurável.

### A erosão é de R$ 31.780 em 30 dias
Sem contrapartida em volume, é perda direta. A recomendação da seção é **teto de
desconto em 10%**: a faixa 10–15% sozinha custa **R$ 17.579 em 501 linhas**.

### O preço de tabela não é respeitado nos dois sentidos
**136 linhas saíram acima da tabela**, somando **+R$ 4.645** (até +10% acima).
Junto com os 38,6% de linhas descontadas, o quadro é de preço de tabela que não
funciona nem como teto nem como piso — o que aponta para tabela desatualizada ou
desgovernança de preço no ponto de venda, não para uma política de desconto.

### O índice competitivo de capa depende do filtro de anomalia
Sem `anomaliasCompetitivas()`, o dashboard reportaria "estamos 7,7% acima do
mercado". Com o filtro, a mediana real do catálogo é **1,01** — praticamente
paridade. A diferença inteira vem de 15 produtos da categoria **Tênis** com
snapshot sintético (detalhes em
[`05-qa-e-seguranca.md`](05-qa-e-seguranca.md)). É o caso que justifica a seção
validar a própria fonte antes de publicar o KPI.
