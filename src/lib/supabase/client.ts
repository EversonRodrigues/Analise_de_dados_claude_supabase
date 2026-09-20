'use client';
import { createBrowserClient } from '@supabase/ssr';

/**
 * Cliente de browser. Usa SOMENTE a chave publicavel (respeita RLS).
 * A service_role NUNCA aparece aqui nem em qualquer NEXT_PUBLIC_*.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
