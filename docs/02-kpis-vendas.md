# KPIs — Vendas & Receita

Código: `src/lib/kpi/vendas.ts` (funções puras) e
`src/app/(dashboard)/vendas/` (Server Component + gráficos `'use client'`).

Duas regras atravessam o arquivo inteiro:

- receita é **sempre** `quantidade × preco_unitario` (`receitaLinha` de `regras.ts`);
- as **vendas órfãs contam nos totais** e **saem dos cortes por
  produto/categoria/marca**. Toda função que passa por `enriquecer()` está
  cortando — o painel que a consome exibe `notaRodapeOrfas(dataset)`.

Nenhuma função lê o relógio da máquina. A janela temporal sai sempre dos próprios
dados, via `janela()` / `dividirPeriodos()`, então o número renderizado hoje é o
mesmo que o teste espera amanhã.

## Convenções da seção

| Item | Definição |
|---|---|
| `MetricaComDelta` | `{ valor, recente, anterior, delta }` — o total da janela, os dois blocos de 15 dias e a variação relativa |
| `CANAIS` | `['ecommerce', 'loja_fisica']` |
| `rotuloCanal(c)` | `E-commerce` / `Loja física` |
| `INDICE_COR_CANAL` | `ecommerce → 0`, `loja_fisica → 1`. Índice fixo por entidade: se a loja física ultrapassar o e-commerce, as cores não trocam |

## 1. Abertura — o estado do negócio

### `receitaComDelta(dataset)`
- **Fórmula:** `SOMA(quantidade × preco_unitario)`; `delta = (recente − anterior) / anterior`, com os períodos cortados no meio da janela observada.
- **Fonte:** `vendas.quantidade`, `vendas.preco_unitario`, `vendas.data_venda`.
- **Órfãs:** incluídas — o dinheiro entrou, independentemente do catálogo.
- **Leitura:** é o número de topo do dashboard. O delta responde se os últimos 15 dias ficaram acima ou abaixo dos 15 anteriores — não é tendência anual, e o painel diz a data de corte.

### `pedidosComDelta(dataset)`
- **Fórmula:** contagem distinta de `vendas.id_venda`; delta de 15 dias.
- **Fonte:** `vendas.id_venda`, `vendas.data_venda`.
- **Órfãs:** incluídas.
- **Leitura:** separa volume de valor. Receita caindo com pedidos estáveis é problema de ticket, não de demanda.

### `ticketMedioComDelta(dataset)`
- **Fórmula:** `receita_total / nº de pedidos distintos`.
- **Fonte:** `vendas.quantidade × vendas.preco_unitario`, `vendas.id_venda`.
- **Órfãs:** incluídas no numerador e no denominador.
- **Leitura:** o elo entre receita e pedidos. Queda de ticket com pedidos firmes aponta para desconto ou mix mais barato — e joga a investigação para a seção de Pricing.

### `unidadesComDelta(dataset)`
- **Fórmula:** `SOMA(vendas.quantidade)`.
- **Fonte:** `vendas.quantidade`, `vendas.data_venda`.
- **Órfãs:** incluídas.
- **Leitura:** volume físico. Unidades subindo com receita caindo é sinal claro de erosão de preço.

### `dataCorte(dataset)` e `periodoObservado(dataset)`
- **Fórmula:** `dataCorte` = `inicio + (fim − inicio) / 2`; `periodoObservado` = `MIN(data_venda)` e `MAX(data_venda)`, ambos em ISO `yyyy-mm-dd`.
- **Fonte:** `vendas.data_venda`, via `janela()`.
- **Leitura:** rótulo honesto. O painel não pode dizer "últimos 15 dias" sem dizer a partir de qual data, porque a janela vem dos dados e não do calendário.

## 2. Tensão — a série temporal

### `receitaPorDia(dataset)` → `PontoDia[]`
- **Fórmula:** para cada `data_venda::date`, `SOMA(quantidade × preco_unitario)` por `canal_venda`, mais o total do dia.
- **Fonte:** `vendas.data_venda`, `vendas.canal_venda`, `vendas.quantidade`, `vendas.preco_unitario`.
- **Órfãs:** incluídas — o corte aqui é temporal, não de produto.
- **Leitura:** mostra se a receita está estável, em degrau ou em queda, e se os dois canais se movem juntos. As duas séries estão na **mesma unidade (R$)**, logo um único eixo — o contrato proíbe eixo duplo.
- **Visual:** `ReceitaDiariaChart` (linha, 2 séries, slots de cor 0 e 1, `ReferenceLine` tracejada marcando a data de corte, legenda e tooltip).

### `receitaMediaDiaria(dataset)`
- **Fórmula:** `receita_total / nº de dias distintos com venda`.
- **Fonte:** `vendas.data_venda`, `vendas.quantidade × vendas.preco_unitario`.
- **Leitura:** linha de base para julgar um dia isolado como bom ou ruim.

## 3. Explicação — o corte por canal

### `desempenhoPorCanal(dataset)` → `DesempenhoCanal[]`
- **Fórmula:** por `canal_venda` — receita `SOMA(quantidade × preco_unitario)`; `participacao = receita_canal / receita_total`; `ticket = receita_canal / pedidos_canal`; e delta de 15 dias em receita, ticket e pedidos.
- **Fonte:** `vendas.canal_venda`, `vendas.quantidade`, `vendas.preco_unitario`, `vendas.id_venda`, `vendas.data_venda`.
- **Órfãs:** incluídas — canal é atributo da própria venda, não do produto.
- **Leitura:** responde qual canal carrega o negócio e qual deles mudou. Como traz o delta de receita e o de ticket lado a lado, distingue um canal que perdeu clientes de um que passou a vender mais barato. Ordenado por receita decrescente, mas a **cor vem de `indiceCor`**, não da posição.
- **Visual:** `TicketCanalChart` (barras agrupadas — ticket médio por canal, 15 dias anteriores vs. últimos 15; uma única medida, R$ por pedido, num único eixo; rótulo direto porque são só 2 séries).

## 4. Cortes por produto — aqui as órfãs saem

### `receitaClassificavel(dataset)`
- **Fórmula:** `SOMA(quantidade × preco_unitario)` apenas das vendas cujo `id_produto` existe em `produtos`.
- **Fonte:** `vendas × produtos`, via `enriquecer()`.
- **Leitura:** é o denominador de **todos** os percentuais de categoria e produto da seção. Usar a receita total aqui inflaria a base com valor que não pode ser atribuído a nenhuma categoria.

### `pesoOrfas(dataset)` → `{ linhas, receita, fracao }`
- **Fórmula:** `receita_orfas / receita_total`.
- **Fonte:** vendas sem correspondência em `produtos`, via `orfas()`.
- **Leitura:** quantifica o quanto o corte por produto deixa de fora (20 linhas, ~R$ 4.240, menos de 0,5% da receita), o que permite ao painel afirmar que o recorte é representativo em vez de pedir confiança.

### `receitaPorCategoria(dataset, limite = 8)` → `FatiaCategoria[]`
- **Fórmula:** por `produtos.categoria` — `SOMA(quantidade × preco_unitario)`; `participacao` sobre a receita **classificável**; `deltaAbsoluto = receita_recente − receita_anterior` em R$; `delta` relativo.
- **Fonte:** `vendas × produtos.categoria` (via `enriquecer`), `vendas.data_venda`.
- **Órfãs:** excluídas — sem produto não há categoria. Exibe `notaRodapeOrfas()`.
- **Leitura:** onde a receita está concentrada e quais categorias se moveram. O `limite` aplica `topNComOutros()`, então nunca passa de 8 matizes: as categorias além do teto viram "Outros".

### `deltaCategoriaPorCanal(dataset, canal)` → `FatiaCategoria[]`
- **Fórmula:** por `produtos.categoria`, filtrando `vendas.canal_venda = canal` — `receita_recente − receita_anterior`, em reais. Ordenado do mais negativo para o mais positivo.
- **Fonte:** `vendas × produtos.categoria`, `vendas.canal_venda`, `vendas.data_venda`.
- **Órfãs:** excluídas.
- **Leitura:** é a **atribuição da variação**, não uma foto do tamanho de cada categoria: responde "de onde saiu o dinheiro que sumiu neste canal". O valor é em reais justamente por isso — 300% de crescimento sobre uma base minúscula não move o resultado consolidado.
- **Detalhe que importa:** o ponto de corte vem da **janela completa**, não da janela do canal filtrado. Sem isso, o delta de um canal não conversaria com o do outro.

### `topProdutos(dataset, n = 10)` → `LinhaProduto[]`
- **Fórmula:** por `vendas.id_produto` — `SOMA(quantidade × preco_unitario)` em ordem decrescente; `participacao` sobre a receita classificável; `precoMedio = receita_produto / unidades_produto`.
- **Fonte:** `vendas × produtos`, via `enriquecer()`.
- **Órfãs:** excluídas.
- **Leitura:** os SKUs que sustentam o faturamento. Agrupa por `id_produto` e **não** por nome: nomes se repetem entre SKUs e somar por nome misturaria produtos distintos.

### `curvaPareto(dataset)` → `PontoPareto[]`
- **Fórmula:** produtos ordenados por receita decrescente; para cada rank *k*, `participacaoAcumulada = SOMA(receita dos k primeiros) / receita_classificavel` e `fracaoCatalogo = k / nº de produtos com venda`.
- **Fonte:** `vendas × produtos`, via `enriquecer()`.
- **Órfãs:** excluídas.
- **Leitura:** o grau de concentração do catálogo. Uma única medida no eixo Y (% acumulado) — a curva **não** é barra + linha com duas escalas, porque o contrato proíbe eixo duplo.

### `concentracaoTopN(dataset, n = 10)`
- **Fórmula:** `SOMA(receita dos N maiores produtos) / receita_classificavel`; `fracaoCatalogo = N / nº de produtos com venda`.
- **Fonte:** `vendas × produtos`, via `enriquecer()`.
- **Leitura:** transforma a curva num número citável no `<Insight>` — "N produtos, que são X% do catálogo, respondem por Y% da receita".

### `produtosPara(dataset, alvo = 0.8)`
- **Fórmula:** menor *k* tal que `SOMA(receita dos k maiores) / receita_classificavel ≥ alvo`.
- **Fonte:** `vendas × produtos`, via `enriquecer()`.
- **Leitura:** quantos SKUs precisam ser protegidos em ruptura, promoção ou negociação para cobrir 80% da receita. É a decisão operacional que sai da curva.

### `receitaDe(linhas)`
- **Fórmula:** `SOMA(quantidade × preco_unitario)` sobre um recorte arbitrário.
- **Fonte:** `vendas.quantidade`, `vendas.preco_unitario`.
- **Uso:** auxiliar exposto para os testes do QA recalcularem a receita de qualquer subconjunto sem reimplementar a fórmula.

## Cobertura do catálogo

30 dos 215 produtos não tiveram nenhuma venda na janela, então `curvaPareto` e
`concentracaoTopN` medem a concentração **entre os 205 que venderam**. É a base
correta para a pergunta "meu faturamento depende de poucos SKUs?" — incluir
produtos com receita zero só alongaria a cauda sem mudar a resposta.
