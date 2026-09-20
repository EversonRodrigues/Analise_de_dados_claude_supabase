import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Renova a sessao e barra acesso anonimo ao dashboard. */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (all: { name: string; value: string; options: CookieOptions }[]) => {
          all.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          all.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // v1 (projeto de estudo): o dashboard roda SEM cadastro, por decisao da dona
  // do projeto. As 4 tabelas ganharam policy de SELECT para `anon`, entao os
  // dados ja sao publicos no banco — um gate aqui nao protegeria nada, so
  // impediria o app de abrir. O middleware fica so renovando a sessao, para
  // que /login continue funcionando quando o cadastro voltar.
  //
  // PARA RESTAURAR O GATE: descomente o bloco abaixo E remova as 4 policies
  // `v1 estudo: leitura publica de ...` do banco. As duas coisas juntas — so
  // uma delas deixa o sistema incoerente.
  //
  // const { data: { user } } = await supabase.auth.getUser();
  // if (!user && !request.nextUrl.pathname.startsWith('/login')) {
  //   const url = request.nextUrl.clone();
  //   url.pathname = '/login';
  //   const redirect = NextResponse.redirect(url);
  //   response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  //   return redirect;
  // }
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // A barra invertida precisa estar DOBRADA na fonte: '\\.' em JS vira a string
  // '\.', que no regex e um ponto literal. Com uma so, o regex recebe '.' e
  // casa qualquer caractere — um caminho como /relatoriospng escaparia do middleware.
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
