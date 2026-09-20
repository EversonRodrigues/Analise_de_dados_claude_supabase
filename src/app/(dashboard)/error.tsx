'use client';
import { useEffect } from 'react';

/** Estado de erro das rotas do dashboard. Dono: Lider. */
export default function ErroDashboard({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);

  const leituraVazia = error.name === 'LeituraVaziaError' || /vazia/i.test(error.message);

  return (
    <div className="mx-auto max-w-2xl rounded-card border border-hairline bg-surface p-8">
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: '#d03b3b' }}>
        <span aria-hidden>⚠ </span>
        {leituraVazia ? 'Sem acesso aos dados' : 'Falha ao carregar'}
      </p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight text-ink">
        {leituraVazia ? 'A leitura do banco voltou vazia' : 'Não foi possível montar o painel'}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-secondary">{error.message}</p>
      {leituraVazia && (
        <div className="mt-5 rounded-md border border-hairline bg-plane p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Como destravar</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink-secondary">
            <li>Confirme que as policies <code className="text-xs">v1 estudo: leitura publica de …</code> existem nas 4 tabelas, com <code className="text-xs">SELECT</code> para o role <code className="text-xs">anon</code>.</li>
            <li>Confirme que <code className="text-xs">NEXT_PUBLIC_SUPABASE_URL</code> e <code className="text-xs">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> em <code className="text-xs">.env.local</code> apontam para o projeto certo.</li>
            <li>Se o cadastro for reativado, restaure o gate no <code className="text-xs">middleware.ts</code> e remova as policies de <code className="text-xs">anon</code>.</li>
          </ol>
        </div>
      )}
      <button onClick={reset}
        className="mt-6 rounded-md bg-ink px-3 py-2 text-sm font-medium text-surface">
        Tentar de novo
      </button>
    </div>
  );
}
