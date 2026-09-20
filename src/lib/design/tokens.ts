/**
 * SISTEMA DE DESIGN COMUM — dono exclusivo: Lider (Fase 1).
 * Seções (vendas/pricing/clientes) CONSOMEM daqui e NUNCA editam este arquivo.
 * Paleta = instancia de referencia do metodo dataviz, ja validada nos seis checks
 * (banda de luminosidade, piso de croma, separacao CVD por par adjacente, piso de
 * visao normal, contraste) em modo claro e escuro.
 */

/** Slots categoricos em ORDEM FIXA. Nunca cicle, nunca reordene por ranking. */
export const SERIES_LIGHT = [
  '#2a78d6', // 1 azul
  '#eb6834', // 2 laranja
  '#1baf7a', // 3 aqua
  '#eda100', // 4 amarelo
  '#e87ba4', // 5 magenta
  '#008300', // 6 verde
  '#4a3aa7', // 7 violeta
  '#e34948', // 8 vermelho
] as const;

export const SERIES_DARK = [
  '#3987e5', '#d95926', '#199e70', '#c98500',
  '#d55181', '#008300', '#9085e9', '#e66767',
] as const;

/**
 * Formas de par-completo (scatter, bubble, small multiples) tem TETO DE 3 SERIES:
 * apenas os 3 primeiros slots passam o gate all-pairs. Alem disso: dobre em "Outros".
 */
export const ALL_PAIRS_SERIES_CAP = 3;

/** Sequencial: um unico matiz (azul), claro -> escuro. Para magnitude continua. */
export const SEQUENTIAL_BLUE = [
  '#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec',
  '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab',
  '#184f95', '#104281', '#0d366b',
] as const;

/** Rampa ORDINAL (degraus discretos): nao use passos mais claros que o indice 3 no claro. */
export const ORDINAL_MIN_INDEX_LIGHT = 3;

/** Divergente: azul <-> vermelho, com CINZA no meio (nunca um matiz no ponto neutro). */
export const DIVERGING = {
  negativePole: '#d03b3b',
  positivePole: '#2a78d6',
  midLight: '#f0efec',
  midDark: '#383835',
} as const;

/** Status: RESERVADO. Nunca vira "serie 4". Sempre acompanhado de icone + rotulo. */
export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const;

export const SURFACES = { light: '#fcfcfb', dark: '#1a1a19' } as const;

/** Escala de espacamento unica do projeto (px). */
export const SPACING = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

/** Tipografia: uma unica familia sans do sistema. Sem serifa, sem display. */
export const TYPE = {
  hero: 'text-[2.5rem] leading-[1.1] font-semibold tracking-tight',
  kpiValue: 'text-[1.75rem] leading-none font-semibold tracking-tight',
  sectionTitle: 'text-xl font-semibold tracking-tight',
  cardTitle: 'text-sm font-medium',
  body: 'text-sm',
  caption: 'text-xs text-ink-muted',
  /** Só para colunas que precisam alinhar verticalmente (tabelas, ticks de eixo). */
  tabular: 'tabular-nums',
} as const;

/** Especificacoes de marca — aplicadas por todas as seções sem excecao. */
export const MARKS = {
  lineStrokeWidth: 2,
  barRadius: [4, 4, 0, 0] as [number, number, number, number],
  minMarkerSize: 8,
  /** Vao de 2px na cor da superficie entre segmentos empilhados e barras adjacentes. */
  surfaceGap: 2,
  gridStrokeDasharray: '0',
} as const;
