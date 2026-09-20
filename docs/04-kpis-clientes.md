# KPIs — Clientes & Comportamento

Código: `src/lib/kpi/clientes.ts` (funções puras) e
`src/app/(dashboard)/clientes/` (Server Component + gráficos `'use client'`).

## Os três limites que moldam a seção

Lidos no banco, não supostos. Todo rótulo da seção os respeita:

1. **`clientes` tem 50 linhas.** Qualquer recorte (safra, estado) cai para grupos
   de 1 a 21 clientes. Toda função que agrupa devolve o `n` do grupo para a
   interface exibir. Variação entre grupos pequenos **não é tendência**.
2. **A janela é de 30 dias** (2025-12-13 → 2026-01-11), sem histórico transacional
   anterior. **Retenção, churn e LTV não são calculáveis.** O que se mede aqui é
   frequência, recência e valor **dentro** da janela.
3. **Cada linha de `vendas` tem `id_venda` próprio:** 3.020 linhas = 3.020
   compras. "Pedido" aqui significa a compra de um item, não um carrinho
   multi-item. Isso muda a leitura de "compras por cliente".

Um detalhe de tratamento das órfãs: os cortes **por cliente** incluem as 20
vendas órfãs, porque a FK de cliente é válida para as 3.020 linhas — só o
produto está faltando. Apenas `repertorioDeCategorias()` corta por produto e,
portanto, exige `notaRodapeOrfas()`.

## 1. Base — perfil por cliente

### `metricasPorCliente(dataset)` → `MetricasCliente[]`
- **Fórmula:** por `id_cliente` — `receita = Σ(quantidade × preco_unitario)`; `compras` = nº de linhas de venda; `ticketMedio = receita / compras`; `shareEcommerce = receita(ecommerce) / receita`; `recenciaDias = (fim da janela − max(data_venda)) / 1 dia`.
- **Fonte:** `vendas` (todas as linhas, inclusive órfãs), `clientes`.
- **Leitura:** a tabela mestre da seção — valor, frequência, recência e mix de canal de cada cliente, ordenada por receita. Todo o resto deriva daqui.

### `resumoClientes(dataset)` → `ResumoClientes`
- **Fórmula:** `gastoMedio = receita_total / clientes ativos`; `comprasPorCliente = nº de compras / ativos`; `ticketMedio = receita_total / nº de compras`; `taxaAtivacao = ativos / cadastrados`; deltas de 15d via `dividirPeriodos()`.
- **Fonte:** `vendas.quantidade × vendas.preco_unitario`, `vendas.id_cliente`, `clientes.id_cliente`.
- **Leitura:** os tiles de abertura. `omnichannel` conta quem comprou nos dois canais na janela. **Não é retenção nem churn** — a janela de 30 dias não permite esses conceitos, e o painel não usa essas palavras.

## 2. Tensão — concentração de receita

### `concentracaoDeReceita(dataset)` → `Concentracao`
- **Fórmula:** clientes ordenados por receita decrescente; `pctReceitaAcum(k) = Σ receita(1..k) / receita_total`; `gini = (2 · Σ i·rᵢ) / (n · Σ rᵢ) − (n+1)/n` com `rᵢ` em ordem **crescente**; `indiceConcentracao = top20pct / 0,20`.
- **Fonte:** receita agrupada por `vendas.id_cliente`.
- **Saídas:** a curva (com a reta de igualdade `y = x` como referência), `top10pct`, `top20pct`, `clientesParaMetadeDaReceita`, `gini` e `indiceConcentracao`.
- **Leitura:** responde se o faturamento depende de poucos clientes. `gini` 0 é base perfeitamente uniforme, 1 é um cliente levando tudo; `indiceConcentracao` = 1,0 significa que o top 20% pesa exatamente 20%, ou seja, nenhuma concentração. Com 50 clientes, esse é o número de risco comercial mais direto da seção.

## 3. Segmentação

### `segmentacaoRFM(dataset)` → `AnaliseRFM`
- **Fórmula:** cada eixo vira tercil (1..3) sobre os 50 clientes — R = recência invertida (compra mais recente = 3), F = nº de compras, M = receita. O segmento é uma regra sobre (F, M): `Alto volume e alto valor`, `Alto valor, volume médio/baixo`, `Alto volume, valor médio/baixo`, `Baixo volume e baixo valor`, `Intermediários`.
- **Fonte:** `vendas.data_venda`, `vendas.id_venda`, `vendas.quantidade × vendas.preco_unitario`.
- **Leitura:** **não é RFM de ciclo de vida.** Sem histórico anterior a 2025-12-13 não existe "cliente perdido" nem "reativado" — os rótulos descrevem apenas a janela, e foram escolhidos para dizer o que foi medido, não para sugerir um estágio de vida.
- **Salvaguarda:** `amplitudeRecenciaDias` é a amplitude da recência na base e `recenciaInformativa` é `false` quando ela é menor que 7 dias. Se todos compraram na mesma semana, o eixo R não discrimina ninguém e **deve ser omitido da leitura** — segmentar por um eixo sem variância produziria grupos falsos.

### `dispersaoFrequenciaTicket(dataset)`
- **Fórmula:** X = nº de compras na janela; Y = `receita / compras`; grupo = tercil de receita total (3 séries, o teto de scatter). Devolve também `amplitudeCompras` e `amplitudeTicket` (max/min de cada eixo).
- **Fonte:** `vendas.id_cliente`, `vendas.id_venda`, `vendas.quantidade × vendas.preco_unitario`.
- **Leitura:** mostra **qual eixo realmente separa os clientes**. As amplitudes respondem objetivamente: se a de compras for muito maior que a de ticket, o que diferencia um cliente grande de um pequeno é frequência, e a ação comercial é de recorrência, não de upsell.

## 4. Cortes de comportamento

### `comportamentoPorSafra(dataset)` → `Safra[]`
- **Fórmula:** por ano de `clientes.data_cadastro` — `n` = nº de clientes; `gastoMedio = Σ receita / n`; `ticketMedio = Σ receita / Σ compras`; `comprasMedia`; `shareEcommerce = Σ receita_ecommerce / Σ receita`.
- **Fonte:** `clientes.data_cadastro`, `vendas.quantidade × vendas.preco_unitario`.
- **Leitura com ressalva embutida:** o `n` por safra vai de 3 a 21 e `amostraSuficiente` marca os grupos com `n < 10`. A interface exibe o `n` e **não** trata a diferença entre safras como tendência — com 3 clientes, um comprador atípico move a safra inteira.

### `perfilDeCanal(dataset)` → `PerfilCanal[]`
- **Fórmula:** cliente é omnichannel se tem ≥1 compra em cada canal na janela; `ticketMedio` do grupo = `Σ receita / Σ compras`.
- **Fonte:** `vendas.canal_venda`, `vendas.id_cliente`, receita.
- **Resultado real nesta base:** **os 50 clientes compram nos dois canais.** Os grupos "somente e-commerce" e "somente loja física" vêm vazios, então a comparação de ticket entre perfis não existe aqui. A função permanece porque documenta esse achado; a análise útil é `intensidadeDeCanal()`.

### `intensidadeDeCanal(dataset)` → `FaixaIntensidade[]`
- **Fórmula:** `shareEcommerce(cliente) = receita_ecommerce / receita do cliente`, distribuído em faixas fixas — `Loja pesa mais` (<60% online), `Equilibrados` (60–75%), `Digitais` (≥75%); `ticketMedio` = `Σ receita / Σ compras` da faixa.
- **Fonte:** `vendas.canal_venda`, receita.
- **Leitura:** como todos são omnichannel, o que varia é **o quanto** de cada cliente vai para o e-commerce. É a substituta honesta da comparação de perfis que a base não sustenta.

### `migracaoDeCanal(dataset)` → `Migracao`
- **Fórmula:** por cliente, `share_ecommerce(periodo) = receita_ecommerce / receita do período`; `deltaPP = (share_recente − share_anterior) × 100`, em pontos percentuais.
- **Fonte:** `vendas.data_venda` (corte via `dividirPeriodos`), `vendas.canal_venda`, receita.
- **Exclusão:** clientes sem receita em algum dos dois períodos ficam de fora — o delta seria indefinido.
- **Leitura:** detecta movimento de canal **dentro** da janela. `migraramParaLoja`, `quedaAcima10pp` e `deltaMedioPP` dizem se a migração é generalizada e pequena, ou concentrada e profunda. O delta está em pontos percentuais, não em variação relativa: ir de 50% para 60% de share é +10 p.p., e chamar isso de "+20%" confundiria o leitor.

### `canalPorPeriodo(dataset)` → `CanalComparativo`
- **Fórmula:** `receita(canal, periodo) = Σ(quantidade × preco_unitario)`; `ticket(canal, periodo) = receita / nº de compras`; `delta = (recente − anterior) / anterior`; mais o share de e-commerce em cada metade.
- **Fonte:** `vendas.canal_venda`, `vendas.data_venda`.
- **Leitura:** a visão agregada do que `migracaoDeCanal` mostra por cliente. Receita e ticket são **escalas diferentes** → **dois gráficos**, nunca eixo duplo (`CanalPeriodoChart`).

### `distribuicaoGeografica(dataset)` → `Geografia`
- **Fórmula:** por `clientes.estado` — clientes distintos, `Σ(quantidade × preco_unitario)` e `receitaPorCliente = receita / clientes`. As barras usam `topNComOutros(..., 8)`.
- **Fonte:** `clientes.estado`, `clientes.pais`, `vendas.id_cliente`.
- **Leitura com ressalva:** 22 UFs para 50 clientes — a mediana é 2 clientes por UF e vários estados têm 1, o que `estadosComUmCliente` expõe. **Não existe "mercado forte no estado X": existe um cliente grande.** A tabela traz todos os estados; o gráfico fica no teto de 8 categorias + "Outros". Há um único país na base, então não há corte por país.

### `repertorioDeCategorias(dataset)` → `Repertorio`
- **Fórmula:** por cliente, nº de `produtos.categoria` distintas entre suas compras; média, mínimo, máximo sobre os clientes ativos, e o % que cobriu **todas** as categorias do catálogo.
- **Fonte:** vendas enriquecidas com `produtos` (via `enriquecer`).
- **Órfãs:** **excluídas** — é a única função da seção que corta por produto. O cartão que a usa exibe `notaRodapeOrfas(dataset)`.
- **Leitura:** mede amplitude de compra. Se a média de categorias por cliente já estiver perto do total do catálogo, cross-sell por categoria não tem espaço, e o crescimento tem de vir de frequência ou de ticket.

### `receitaPorCliente(dataset)` → `Map<id_cliente, number>`
- **Fórmula:** `Σ(quantidade × preco_unitario)` por `id_cliente`.
- **Fonte:** `vendas`, sem corte por produto.
- **Uso:** checagem cruzada entre seções — a soma deste mapa bate exatamente com `receitaTotal(dataset.vendas)` de Vendas.

## O que a seção encontrou nesta base

### O achado principal: migração de canal dentro dos 30 dias
Entre as duas metades da janela, a receita de **e-commerce caiu 13,6%** e a de
**loja física subiu 21,7%**, e o **ticket da loja ultrapassou o do online** na
segunda metade. Não houve queda de demanda: as compras por cliente ficaram
estáveis em **30,2**. Ou seja, os mesmos clientes, comprando a mesma frequência,
deslocaram gasto de um canal para o outro.

A explicação **não** é desconto: a seção de Pricing testou a hipótese e a
descartou. O percentual médio de desconto ficou plano nos dois canais, em torno
de 9%, e a frequência de linhas descontadas mal se mexeu — o desconto não se
moveu em volume. O que mudou foi o **alvo**: na loja, o preço de tabela médio das
linhas descontadas subiu de R$ 196,02 para R$ 240,10 (passou a descontar o item
caro), e no e-commerce caiu de R$ 263,71 para R$ 224,78. Por isso a realização
ponderada por receita cai 0,67 p.p. na loja (97,01% → 96,34%) contra 0,11 p.p. no
e-commerce (96,95% → 96,84%), enquanto a média simples não acusa nada. A
convergência de preço médio vem de **mudança de mix de produto**, puxada pela
categoria Moda. Ver
[`03-kpis-pricing.md`](03-kpis-pricing.md), na decomposição por canal.

Ressalva obrigatória: 15 dias contra 15 dias, com 50 clientes, atravessando Natal
e Ano-Novo. O movimento é grande o suficiente para merecer investigação, não
para virar decisão sozinho.

### A carteira é homogênea — não existe Pareto aqui
`concentracaoDeReceita()` devolve **Gini 0,129** e **top 20% = 27,0% da
receita**. Numa base de ecommerce o leitor espera algo próximo de 80/20; **não
está aqui**. A receita é quase uniformemente distribuída entre os 50 clientes,
então "proteger as contas-chave" não é uma conclusão que esta base sustente.
Registrado explicitamente porque a ausência do padrão esperado é, ela mesma, o
achado.

### Todos os 50 clientes são omnichannel
Nenhum cliente comprou em um único canal. Os grupos "somente e-commerce" e
"somente loja física" de `perfilDeCanal()` vêm **vazios** — não por escolha de
recorte, mas por ausência de dado. Qualquer comparação "só-online vs. só-loja" é
impossível nesta base; a leitura útil é a de intensidade
(`intensidadeDeCanal()`).

### A recência não discrimina ninguém
A base inteira comprou nos últimos 2 dias da janela, então o eixo **R** do RFM é
praticamente constante e `recenciaInformativa` vem `false`. A segmentação se
apoia em **frequência e valor**; o painel omite o R em vez de fingir que ele
separa grupos.

### Não há especialização por cliente
Cada cliente comprou em média **9,9 de 10 categorias**. Não existe cliente
"de eletrônicos" ou "de casa" nesta base. Consequência direta: **cross-sell por
categoria não tem espaço para crescer** — o caminho de crescimento teria de ser
ticket ou frequência, não amplitude de catálogo.

## O que esta seção deliberadamente não calcula

Retenção, churn, LTV, coorte de repetição e sazonalidade. Todos exigem histórico
anterior a 2025-12-13, que não existe na base. Qualquer um desses números seria
uma extrapolação apresentada como medida.
