'use client';
/**
 * Tema de graficos compartilhado. Dono: Lider. Consumido por TODAS as seções.
 * Resolve a paleta conforme o modo claro/escuro efetivo do navegador.
 */
import { useEffect, useState } from 'react';
import { SERIES_LIGHT, SERIES_DARK, MARKS } from './tokens';

export function useIsDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const stamp = document.documentElement.getAttribute('data-theme');
    if (stamp === 'dark') return setDark(true);
    if (stamp === 'light') return setDark(false);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return dark;
}

/** Cor da serie POR IDENTIDADE (indice fixo da entidade), nunca por ranking. */
export function useSeriesColors(): readonly string[] {
  return useIsDark() ? SERIES_DARK : SERIES_LIGHT;
}

/** Props padrao dos eixos/grid do Recharts — chrome recessivo. */
export const axisProps = {
  tick: { fill: 'var(--text-muted)', fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: 'var(--baseline)' },
} as const;

export const gridProps = {
  stroke: 'var(--gridline)',
  strokeDasharray: MARKS.gridStrokeDasharray,
  vertical: false,
} as const;

export const tooltipStyles = {
  contentStyle: {
    background: 'var(--surface-1)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 8,
    fontSize: 12,
    color: 'var(--text-primary)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
  },
  labelStyle: { color: 'var(--text-secondary)', marginBottom: 4 },
  cursor: { stroke: 'var(--baseline)', strokeWidth: 1 },
} as const;
