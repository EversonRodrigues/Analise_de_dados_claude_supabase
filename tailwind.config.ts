import type { Config } from 'tailwindcss';

// SISTEMA DE DESIGN COMUM — dono: Lider. Nao editar em seções.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: 'var(--surface-1)',
        plane: 'var(--plane)',
        ink: {
          DEFAULT: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        hairline: 'var(--border-hairline)',
        grid: 'var(--gridline)',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: { card: '10px' },
      spacing: { '4.5': '1.125rem' },
    },
  },
  plugins: [],
};
export default config;
