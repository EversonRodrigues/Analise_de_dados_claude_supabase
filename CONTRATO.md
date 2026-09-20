# Contrato da equipe — Dashboard de Ecommerce

> Escrito na Fase 1 pelo **Líder (executivo de negócio: pricing e vendas)**.
> É a fonte única de verdade. Nenhum especialista altera este arquivo nem os
> arquivos marcados como propriedade do líder.

## 1. Stack

Next.js 14 (App Router) · React 18 · TypeScript strict · Tailwind · Recharts ·
`@supabase/ssr` · Vitest. Node 25. Dependências já instaladas.

**`npm test` roda `tsc --noEmit && vitest run`.** O Vitest apaga os tipos sem
checar, então um teste verde não dizia nada sobre o typecheck — e um erro de
tipo em trânsito de outro teammate era indistinguível de um erro próprio.
Use `npm run test:unit` se quiser só os testes, e `npm run typecheck` para só
os tipos.

## 2. Propriedade de arquivos (regra anti-conflito)

Ninguém escreve fora da sua coluna. Se precisar de algo que pertence a outro,
abra tarefa para o dono — **não edite**.

| Dono | Arquivos exclusivos |
|---|---|
| **Líder** | `CONTRATO.md`, `package.json`, `*.config.*`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/login/**`, `src/app/(dashboard)/layout.tsx`, `src/app/(dashboard)/page.tsx`, `src/middleware.ts`, `src/lib/supabase/**`, `src/lib/design/**`, `src/lib/data/**`, `src/components/ui/**`, `src/components/charts/**`, `src/lib/kpi/_visao-geral.ts` |
| **T2 Vendas** | `src/app/(dashboard)/vendas/**`, `src/lib/kpi/vendas.ts` |
| **T3 Pricing** | `src/app/(dashboard)/pricing/**`, `src/lib/kpi/pricing.ts` |
| **T4 Clientes** | `src/app/(dashboard)/clientes/**`, `src/lib/kpi/clientes.ts` |
| **T5 QA/Arquiteto** | `tests/**` — e **nada mais**. Modo somente-leitura no código de produção. |
| **T6 Documentador** | `docs/**`, `README.md` |

## 3. Sistema de design comum

Tudo já existe em código. **Consuma, não recrie.**

- **Paleta** — `src/lib/design/tokens.ts`. Instância de referência do método
  `dataviz`, já aprovada nos seis checks (banda de luminosidade, piso de croma,
  separação CVD por par adjacente, piso de visão normal, contraste) em claro e
  escuro. `SERIES_LIGHT` / `SERIES_DARK`, 8 slots em **ordem fixa**.
- **Cor segue a entidade, nunca o ranking.** Um filtro que muda a contagem de
  séries não pode repintar as sobreviventes. Fixe o índice da cor pelo id da
  entidade.
- **Teto de séries:** 8 em formas de par adjacente (linha, barra, empilhado);
  **3** em scatter/bubble/small multiples (`ALL_PAIRS_SERIES_CAP`). Acima disso,
  use `topNComOutros()` — nunca gere um nono matiz.
- **Nunca eixo duplo.** Duas medidas de escalas diferentes → dois gráficos ou
  indexadas a uma base comum.
- **Sequencial** = um matiz (azul, claro→escuro). **Divergente** = azul↔vermelho
  com cinza no meio. **Status** (`STATUS`) é reservado e sempre vem com
  ícone + rótulo, nunca cor sozinha.
- **Tipografia** — só `system-ui`. Escala em `TYPE`. `tabular-nums` apenas em
  colunas que alinham na vertical.
- **Espaçamento** — `SPACING` (4/8/16/24/32/48). Cartões: `p-6`, grid `gap-6`.
- **Marcas** — `MARKS`: linha 2px, topo de barra arredondado 4px, marcador ≥8px,
  vão de 2px na cor da superfície entre segmentos empilhados.
- **Tema de gráfico** — `src/lib/design/chart-theme.ts`: `useSeriesColors()`,
  `axisProps`, `gridProps`, `tooltipStyles`. Use-os em todo Recharts.
- **Acessibilidade obrigatória por gráfico:** legenda sempre que houver ≥2
  séries (uma série não leva legenda — o título a nomeia), rótulo direto quando
  ≤4 séries, e `<DataTable>` como visão alternativa em todo gráfico denso.
- **Tooltip/hover é padrão**, não opcional. Só um stat tile sem plot dispensa.
- **Formatação** — `src/lib/design/format.ts`. Não reimplemente `Intl` na seção.

### Componentes compartilhados (`src/components/ui/`)
`Card`, `KpiTile`, `Insight`, `Legend`, `DataTable`, `Nav`.

## 4. Contrato de dados

- Carregue com `getDataset()` de `src/lib/data/fetch.ts` (Server Component).
  Ele lê as 4 tabelas **uma vez por request** e já pagina — PostgREST corta em
  1000 linhas e `vendas` tem 3020.
- **Nunca** redefina receita, período ou o tratamento das órfãs. Importe de
  `src/lib/data/regras.ts`: `receitaLinha`, `receitaTotal`, `enriquecer`,
  `orfas`, `notaRodapeOrfas`, `janela`, `dividirPeriodos`, `variacao`,
  `agrupar`, `topNComOutros`.
- **Regra das órfãs:** 20 vendas apontam para produtos inexistentes (FK
  `NOT VALID`). Contam nos **totais de receita**; saem de qualquer corte por
  produto/categoria/marca. Todo painel que aplica o corte exibe
  `notaRodapeOrfas(dataset)` como `footnote` do `<Card>`.
- **Período:** 2025-12-13 → 2026-01-11, 30 dias. **Não existe YoY nem
  sazonalidade.** Todo delta do projeto é *últimos 15 dias vs. 15 anteriores*,
  via `dividirPeriodos()`. Qualquer painel que sugira tendência anual está errado.
- **Não existe coluna de custo.** Margem real é incalculável. Pricing trabalha
  com proxy competitivo + erosão de desconto (ver §5). Nenhum painel pode
  exibir "margem bruta" como se fosse real.
- `preco_competidores` é um **snapshot de um único dia (2026-01-11)**, 4
  concorrentes, cobrindo os 215 produtos. Não plote como série temporal.

## 5. Arquitetura de cada seção

Cada seção entrega dois arquivos:

1. `src/lib/kpi/<seção>.ts` — **funções puras** sobre `Dataset`. Sem React, sem
   fetch, sem `Date.now()`. É isso que o QA testa.
2. `src/app/(dashboard)/<seção>/page.tsx` — Server Component: chama
   `getDataset()`, aplica as funções puras, renderiza.
   Gráficos Recharts precisam de `'use client'` → coloque-os em
   `src/app/(dashboard)/<seção>/_components/*.tsx` e passe dados já agregados
   por props. **Nunca** passe o `Dataset` inteiro para o cliente.

Toda função de KPI leva um docblock com **fórmula** e **fonte de dados**:

```ts
/**
 * Ticket médio.
 * Fórmula: receita_total / nº de pedidos distintos
 * Fonte: vendas.quantidade * vendas.preco_unitario, vendas.id_venda
 */
```

## 6. Narrativa (não é opcional)

Cada seção conta **uma história**, com esta espinha:

1. **Abertura** — 3 a 4 `<KpiTile>` com o estado do negócio e o delta 15d.
2. **Tensão** — o gráfico que mostra onde está o problema ou a oportunidade.
3. **Explicação** — o corte que revela a causa.
4. **Fechamento** — um `<Insight>` que diz *o que fazer*, em linguagem de
   negócio, citando o número.

Números soltos sem leitura são rejeitados na revisão do líder.

## 7. Idioma

Toda a interface, KPIs e documentação em **português do Brasil**.
Código (identificadores) em português também, para bater com o esquema do banco.
