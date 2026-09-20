# Fase 1 — Fundação: arquitetura e sistema de design

Resumo do que foi decidido e construído na fundação. O documento normativo é
[`/CONTRATO.md`](../CONTRATO.md); aqui está a leitura explicada, com o porquê de
cada regra.

## 1. Stack e por quê

Next.js 14 com App Router, React 18, TypeScript `strict`, Tailwind, Recharts,
`@supabase/ssr` e Vitest.

O App Router permite que cada seção seja um **Server Component**: os dados são
lidos no servidor, agregados ali, e só o resultado agregado atravessa para o
cliente. Nenhum `Dataset` inteiro vai para o browser — o que reduz payload e
mantém a chave e a sessão fora do bundle.

`next` foi elevado de 14.2.15 para **14.2.35** ainda na fundação, por
vulnerabilidade conhecida na versão anterior.

## 2. Acesso a dados

### Autenticação e RLS

- `src/lib/supabase/server.ts` — cliente de servidor com a sessão via cookies.
  Continua sob RLS: cada leitura passa pela policy de `authenticated`.
- `src/lib/supabase/client.ts` — cliente de browser, **só** com a chave
  publicável.
- `src/middleware.ts` — renova a sessão a cada request e redireciona quem não
  está logado para `/login`.

A `service_role` não aparece em lugar nenhum, nem em variável `NEXT_PUBLIC_*`.

### `getDataset()` — uma leitura por request

`src/lib/data/fetch.ts` expõe `getDataset()`, embrulhado no `cache()` do React:
as 4 tabelas são lidas **uma única vez por request** e o mesmo `Dataset` serve as
três seções. Evita triplicar o tráfego e garante que os painéis concordem entre si.

A função pagina explicitamente em blocos de 1.000 linhas. Isso não é enfeite: o
PostgREST corta em 1.000 e `vendas` tem 3.020 — sem paginação a receita
apareceria truncada em um terço.

### `regras.ts` — a fonte única das definições

`src/lib/data/regras.ts` é de propriedade exclusiva do líder e nenhuma seção
redefine o que está aqui:

| Função | O que faz |
|---|---|
| `receitaLinha(v)` | `quantidade × preco_unitario` — fórmula única de receita |
| `receitaTotal(vendas)` | soma de `receitaLinha` |
| `enriquecer(vendas, produtos)` | junta venda + produto; descarta as órfãs |
| `orfas(vendas, produtos)` | as vendas sem produto correspondente |
| `notaRodapeOrfas(dataset)` | texto da nota de rodapé, com contagem e valor |
| `janela(vendas)` | início, fim e ponto de corte da janela observada |
| `dividirPeriodos(vendas)` | separa em `recente` e `anterior` pelo corte |
| `variacao(atual, base)` | variação relativa; devolve 0 quando a base é 0, em vez de `Infinity` |
| `agrupar(itens, chave)` | agrupador genérico usado por todas as seções |
| `topNComOutros(grupos, valor, n)` | top N e o resto dobrado em "Outros" |

### Três decisões de negócio embutidas no código

1. **Órfãs** — contam nos totais de receita, saem dos cortes por
   produto/categoria/marca, e o painel que corta exibe a nota de rodapé.
2. **Período** — a base tem 30 dias. Não existe YoY nem sazonalidade. **Todo
   delta do projeto é últimos 15 dias vs. 15 dias anteriores**, via
   `dividirPeriodos()`. Painel que sugira tendência anual está errado por
   construção.
3. **Margem** — sem coluna de custo, margem contábil não é calculada. Pricing usa
   proxy competitivo e erosão de desconto, nunca um custo inventado.

## 3. Sistema de design

Tudo já existe em código, em `src/lib/design/`. A regra é **consumir, não
recriar**.

### Cor — `tokens.ts`

- `SERIES_LIGHT` / `SERIES_DARK`: 8 slots categóricos em **ordem fixa**,
  instância de referência do método `dataviz`, validada nos seis checks (banda de
  luminosidade, piso de croma, separação CVD por par adjacente, piso de visão
  normal, contraste) em claro e escuro.
- **Cor segue a entidade, nunca o ranking.** O índice da cor é fixado pelo id da
  entidade, então um filtro que muda a contagem de séries não repinta as
  sobreviventes.
- **Teto de séries:** 8 em formas de par adjacente (linha, barra, empilhado); **3**
  em scatter/bubble/small multiples (`ALL_PAIRS_SERIES_CAP`). Acima disso,
  `topNComOutros()` — nunca um nono matiz.
- `SEQUENTIAL_BLUE`: magnitude contínua, um único matiz claro→escuro. Em rampas
  ordinais no modo claro, não use passos mais claros que `ORDINAL_MIN_INDEX_LIGHT`.
- `DIVERGING`: azul ↔ vermelho com **cinza** no ponto neutro.
- `STATUS`: reservado (`good`, `warning`, `serious`, `critical`). Nunca vira
  "série 4" e nunca aparece como cor sozinha — sempre com ícone e rótulo.
- **Nunca eixo duplo.** Duas medidas de escalas diferentes → dois gráficos, ou
  indexadas a uma base comum.

### Tipografia, espaçamento e marcas

- Uma única família: `system-ui`. Escala em `TYPE` (`hero`, `kpiValue`,
  `sectionTitle`, `cardTitle`, `body`, `caption`). `tabular-nums` só em colunas
  que alinham na vertical.
- `SPACING`: 4/8/16/24/32/48. Cartões `p-6`, grid `gap-6`.
- `MARKS`: linha 2px, topo de barra arredondado 4px, marcador ≥8px, vão de 2px na
  cor da superfície entre segmentos empilhados.

### Tema de gráfico — `chart-theme.ts`

`useSeriesColors()` resolve a paleta conforme o tema efetivo (atributo
`data-theme` no `<html>`, senão `prefers-color-scheme`). `axisProps`,
`gridProps` e `tooltipStyles` padronizam o chrome do Recharts — eixos recessivos,
grid horizontal, tooltip na superfície do tema.

### Formatação — `format.ts`

`fmtBRL`, `fmtBRLCents`, `fmtNum`, `fmtPct`, `fmtDelta` e `fmtDate`, todos em
`pt-BR`. Nenhuma seção reimplementa `Intl`. `fmtDelta` sempre imprime o sinal: o
sinal e o rótulo carregam o significado, não a cor.

### Acessibilidade obrigatória por gráfico

- Legenda sempre que houver ≥2 séries (uma série não leva legenda — o título a nomeia).
- Rótulo direto quando ≤4 séries.
- `<DataTable>` como visão alternativa em todo gráfico denso.
- Tooltip/hover é padrão, não opcional; só um stat tile sem plot dispensa.

### Componentes compartilhados — `src/components/ui/`

`Card` (com `footnote`), `KpiTile`, `Insight`, `Legend`, `DataTable`, `Nav`.

## 4. Arquitetura de uma seção

Cada seção entrega exatamente dois artefatos:

1. **`src/lib/kpi/<seção>.ts`** — funções puras sobre `Dataset`. Sem React, sem
   fetch, sem `Date.now()`. É o que o QA testa. Toda função leva docblock com
   **Fórmula** e **Fonte**.
2. **`src/app/(dashboard)/<seção>/page.tsx`** — Server Component: chama
   `getDataset()`, aplica as funções puras, renderiza. Gráficos Recharts exigem
   `'use client'` e ficam em `_components/*.tsx`, recebendo dados **já agregados**
   por props.

## 5. Narrativa de cada seção

Não é opcional. A espinha é sempre:

1. **Abertura** — 3 a 4 `<KpiTile>` com o estado do negócio e o delta de 15 dias.
2. **Tensão** — o gráfico que mostra onde está o problema ou a oportunidade.
3. **Explicação** — o corte que revela a causa.
4. **Fechamento** — um `<Insight>` que diz o que fazer, em linguagem de negócio,
   citando o número.

Números soltos, sem leitura, são rejeitados na revisão.

## 6. Propriedade de arquivos

Para permitir trabalho paralelo sem conflito, cada dono escreve só na sua coluna:
líder nos arquivos de fundação e configuração; T2/T3/T4 na sua seção e no seu
arquivo de KPI; T5 só em `tests/`; T6 só em `docs/` e `README.md`. A matriz
completa está no §2 do `CONTRATO.md`.
