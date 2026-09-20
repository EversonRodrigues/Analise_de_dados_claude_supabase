'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ABAS = [
  { href: '/', label: 'Visao geral' },
  { href: '/vendas', label: 'Vendas & Receita' },
  { href: '/pricing', label: 'Pricing & Margem' },
  { href: '/clientes', label: 'Clientes & Comportamento' },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Seções do dashboard" className="border-b border-hairline bg-surface">
      <ul className="mx-auto flex max-w-7xl gap-1 px-6">
        {ABAS.map((a) => {
          const ativo = path === a.href;
          return (
            <li key={a.href}>
              <Link href={a.href} aria-current={ativo ? 'page' : undefined}
                className={`inline-block border-b-2 px-3 py-3.5 text-sm transition-colors ${
                  ativo ? 'border-ink font-medium text-ink' : 'border-transparent text-ink-secondary hover:text-ink'
                }`}>
                {a.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
