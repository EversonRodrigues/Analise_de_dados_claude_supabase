/** Formatadores unicos do projeto. Dono: Lider. Nunca reimplemente em uma seção. */
const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
});
const BRL_CENTS = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const NUM = new Intl.NumberFormat('pt-BR');
const PCT = new Intl.NumberFormat('pt-BR', {
  style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1,
});

export const fmtBRL = (n: number) => BRL.format(n ?? 0);
export const fmtBRLCents = (n: number) => BRL_CENTS.format(n ?? 0);
export const fmtNum = (n: number) => NUM.format(n ?? 0);
export const fmtPct = (n: number) => PCT.format(n ?? 0);
/** Delta com sinal explicito. O sinal e o rotulo carregam o significado, nunca a cor sozinha. */
export const fmtDelta = (n: number) => `${n >= 0 ? '+' : ''}${PCT.format(n ?? 0)}`;
export const fmtDate = (d: string | Date) =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(d));
