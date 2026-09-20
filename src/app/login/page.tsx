'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setErro(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setCarregando(false);
    if (error) { setErro('Nao foi possivel entrar. Verifique email e senha.'); return; }
    router.push('/');
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={entrar} className="w-full max-w-sm rounded-card border border-hairline bg-surface p-8">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Dashboard de Ecommerce</h1>
        <p className="mt-1.5 text-sm text-ink-secondary">
          Os dados estao protegidos por RLS. Entre para visualizar.
        </p>
        <label className="mt-6 block text-xs font-medium uppercase tracking-wide text-ink-muted" htmlFor="email">Email</label>
        <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-hairline bg-plane px-3 py-2 text-sm text-ink outline-none focus:border-ink-muted" />
        <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-ink-muted" htmlFor="senha">Senha</label>
        <input id="senha" type="password" required value={senha} onChange={(e) => setSenha(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-hairline bg-plane px-3 py-2 text-sm text-ink outline-none focus:border-ink-muted" />
        {erro && <p role="alert" className="mt-4 text-sm" style={{ color: '#d03b3b' }}>⚠ {erro}</p>}
        <button type="submit" disabled={carregando}
          className="mt-6 w-full rounded-md bg-ink px-3 py-2.5 text-sm font-medium text-surface disabled:opacity-50">
          {carregando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
