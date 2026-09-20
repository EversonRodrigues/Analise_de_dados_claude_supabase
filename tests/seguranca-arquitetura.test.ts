/**
 * AUDITORIA AUTOMATIZADA — dono: T5 (QA).
 *
 * Testes estaticos sobre os arquivos do repositorio. Nao acessam rede nem banco.
 * Guardam as regras que nao cabem em um teste de funcao pura:
 *  - nenhum segredo em variavel exposta ao browser,
 *  - `.env` e `.env.local` fora do git,
 *  - nenhuma seção reimplementando receita, `Intl` ou cor solta,
 *  - nenhuma pagina inteira marcada `'use client'`,
 *  - nenhum `Dataset` inteiro atravessando a fronteira servidor -> cliente,
 *  - nenhum eixo duplo em Recharts.
 *
 * Os testes varrem o que EXISTE: enquanto uma seção nao foi escrita, eles
 * passam vazios; assim que o arquivo aparece, a regra vale para ele.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(__dirname, '..');
const SRC = path.join(RAIZ, 'src');

function arquivos(dir: string, ext = ['.ts', '.tsx']): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) out.push(...arquivos(p, ext));
    else if (ext.includes(path.extname(p))) out.push(p);
  }
  return out;
}

const ler = (p: string) => readFileSync(p, 'utf8');

/**
 * Versao do arquivo SEM comentarios. As regras abaixo valem para o que o codigo
 * FAZ; um docblock que cita `quantidade * preco_unitario` ou `Date.now()` para
 * explicar a regra e legitimo e nao pode reprovar o arquivo.
 */
const lerCodigo = (p: string) =>
  ler(p)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
const rel = (p: string) => path.relative(RAIZ, p).replace(/\\/g, '/');

const SECOES = ['vendas', 'pricing', 'clientes'];
const dirSecao = (s: string) => path.join(SRC, 'app', '(dashboard)', s);
const arquivosDeSecoes = () => SECOES.flatMap((s) => arquivos(dirSecao(s)));
const kpisDeSecoes = () =>
  SECOES.map((s) => path.join(SRC, 'lib', 'kpi', `${s}.ts`)).filter((p) => existsSync(p));

/* -------------------------------------------------------------------------- */
/* Segredos                                                                   */
/* -------------------------------------------------------------------------- */

describe('segredos e variaveis de ambiente', () => {
  const lerEnv = (nome: string): Record<string, string> => {
    const p = path.join(RAIZ, nome);
    if (!existsSync(p)) return {};
    const out: Record<string, string> = {};
    for (const linha of ler(p).split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(linha);
      if (m) out[m[1]] = m[2].trim();
    }
    return out;
  };

  it('nenhuma variavel NEXT_PUBLIC_* carrega chave secreta ou service_role', () => {
    for (const nome of ['.env', '.env.local', '.env.example']) {
      for (const [k, v] of Object.entries(lerEnv(nome))) {
        if (!k.startsWith('NEXT_PUBLIC_')) continue;
        expect(/SECRET|SERVICE_ROLE|PASSWORD|PGPASSWORD/i.test(k), `${nome}: ${k} tem nome de segredo`).toBe(false);
        expect(/service_role|^sb_secret_/.test(v), `${nome}: ${k} contem valor de service_role`).toBe(false);
        // JWT legado com role service_role tem o payload em base64; nao pode ir ao browser.
        expect(v.includes('c2VydmljZV9yb2xl'), `${nome}: ${k} parece um JWT service_role`).toBe(false);
      }
    }
  });

  it('a chave secreta nunca e lida no codigo da aplicacao', () => {
    // Olha so o que o codigo LE de process.env — comentarios que citam
    // "service_role" para explicar a regra sao legitimos.
    const proibido = /^(SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY|PGPASSWORD|DATABASE_URL)$/;
    for (const f of arquivos(SRC)) {
      for (const m of ler(f).matchAll(/process\.env\.([A-Za-z0-9_]+)/g)) {
        expect(proibido.test(m[1]), `${rel(f)} le a credencial de servidor ${m[1]}`).toBe(false);
      }
    }
  });

  it('o cliente de browser so usa a chave publicavel', () => {
    const p = path.join(SRC, 'lib', 'supabase', 'client.ts');
    const conteudo = ler(p);
    const envs = [...conteudo.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]);
    expect(envs.length).toBeGreaterThan(0);
    for (const e of envs) expect(e.startsWith('NEXT_PUBLIC_')).toBe(true);
  });

  it('.gitignore cobre .env e .env.local, e mantem .env.example versionado', () => {
    const gi = ler(path.join(RAIZ, '.gitignore'));
    const linhas = gi.split(/\r?\n/).map((l) => l.trim());
    expect(linhas).toContain('.env.local');
    expect(linhas.some((l) => l === '*.env' || l === '.env')).toBe(true);
    expect(linhas).toContain('!.env.example');
  });

  it('.env.example nao tem nenhum valor preenchido', () => {
    const p = path.join(RAIZ, '.env.example');
    if (!existsSync(p)) return;
    for (const linha of ler(p).split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(linha);
      if (!m) continue;
      const [, chave, valor] = m;
      if (/SECRET|KEY|PASSWORD|TOKEN/i.test(chave)) {
        expect(valor.trim(), `${chave} tem valor em .env.example`).toBe('');
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Fronteira servidor / cliente                                               */
/* -------------------------------------------------------------------------- */

describe('fronteira servidor -> cliente', () => {
  const usaClient = (txt: string) => /^\s*['"]use client['"]/.test(txt.trimStart());

  it('nenhuma page.tsx de seção e um Client Component inteiro', () => {
    for (const s of SECOES) {
      const p = path.join(dirSecao(s), 'page.tsx');
      if (!existsSync(p)) continue;
      expect(usaClient(ler(p)), `${rel(p)} marcou a pagina inteira como 'use client'`).toBe(false);
    }
  });

  it('os graficos ficam em _components e sao os unicos com "use client"', () => {
    for (const f of arquivosDeSecoes()) {
      if (!usaClient(ler(f))) continue;
      expect(rel(f).includes('/_components/'), `${rel(f)} usa 'use client' fora de _components`).toBe(true);
    }
  });

  it('nenhum Dataset inteiro e passado como prop para o cliente', () => {
    for (const f of arquivosDeSecoes()) {
      const txt = ler(f);
      expect(/\bdataset=\{\s*(dataset|ds)\s*\}/.test(txt), `${rel(f)} passa o Dataset inteiro por prop`).toBe(false);
      expect(/\{\.\.\.dataset\}/.test(txt), `${rel(f)} espalha o Dataset em props`).toBe(false);
    }
    for (const f of arquivosDeSecoes()) {
      const txt = ler(f);
      if (!usaClient(txt)) continue;
      expect(/:\s*Dataset\b/.test(txt), `${rel(f)} e client e recebe Dataset tipado`).toBe(false);
      expect(/from '@\/lib\/data\/fetch'/.test(txt), `${rel(f)} e client e importa getDataset`).toBe(false);
    }
  });

  it('nenhum componente de cliente busca dados direto do Supabase', () => {
    for (const f of arquivosDeSecoes()) {
      const txt = ler(f);
      if (!usaClient(txt)) continue;
      expect(/@\/lib\/supabase\//.test(txt), `${rel(f)} e client e fala com o Supabase`).toBe(false);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Consistencia arquitetural entre seções                                     */
/* -------------------------------------------------------------------------- */

describe('consistencia entre as tres seções', () => {
  it('toda page.tsx de seção carrega os dados via getDataset()', () => {
    for (const s of SECOES) {
      const p = path.join(dirSecao(s), 'page.tsx');
      if (!existsSync(p)) continue;
      expect(ler(p).includes('getDataset'), `${rel(p)} nao usa getDataset()`).toBe(true);
    }
  });

  it('nenhuma seção redefine a formula de receita', () => {
    for (const f of [...kpisDeSecoes(), ...arquivosDeSecoes()]) {
      const txt = lerCodigo(f);
      const reimplementa = /quantidade\s*\*\s*preco_unitario/.test(txt);
      if (reimplementa) {
        expect(
          rel(f).startsWith('src/lib/data/'),
          `${rel(f)} recalcula receita em vez de importar receitaLinha de regras.ts`,
        ).toBe(true);
      }
    }
  });

  it('nenhuma seção reimplementa Intl — formatacao vem de format.ts', () => {
    for (const f of [...kpisDeSecoes(), ...arquivosDeSecoes()]) {
      expect(/new Intl\./.test(lerCodigo(f)), `${rel(f)} reimplementa Intl; use @/lib/design/format`).toBe(false);
    }
  });

  it('nenhuma seção usa cor solta em hex — a paleta vem de tokens.ts', () => {
    for (const f of arquivosDeSecoes()) {
      const hex = [...lerCodigo(f).matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
      expect(hex, `${rel(f)} tem hex solto; use SERIES_* de @/lib/design/tokens`).toEqual([]);
    }
  });

  it('nenhum grafico usa eixo duplo (proibido pelo contrato)', () => {
    for (const f of arquivosDeSecoes()) {
      const txt = lerCodigo(f);
      const direita = /orientation\s*=\s*["']right["']/.test(txt);
      const yAxisIds = new Set([...txt.matchAll(/yAxisId\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]));
      expect(direita, `${rel(f)} tem um eixo Y a direita — eixo duplo e proibido`).toBe(false);
      expect(yAxisIds.size, `${rel(f)} declara ${yAxisIds.size} eixos Y distintos`).toBeLessThanOrEqual(1);
    }
  });

  it('nenhuma seção gera uma nona cor de serie', () => {
    for (const f of [...kpisDeSecoes(), ...arquivosDeSecoes()]) {
      const txt = lerCodigo(f);
      for (const m of txt.matchAll(/topNComOutros\s*\([^)]*?,\s*(\d+)\s*\)/gs)) {
        expect(Number(m[1]), `${rel(f)} chama topNComOutros com N acima de 8`).toBeLessThanOrEqual(8);
      }
      for (const m of txt.matchAll(/SERIES_(?:LIGHT|DARK)\s*\[\s*(\d+)\s*\]/g)) {
        expect(Number(m[1]), `${rel(f)} indexa a paleta fora dos 8 slots`).toBeLessThan(8);
      }
    }
  });

  it('todo KPI de seção documenta Formula e Fonte', () => {
    for (const f of kpisDeSecoes()) {
      const txt = ler(f);
      const exportados = [...txt.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1]);
      for (const nome of exportados) {
        const antes = txt.slice(0, txt.indexOf(`function ${nome}`));
        const doc = antes.slice(antes.lastIndexOf('/**'));
        expect(/F[oó]rmula:/i.test(doc), `${rel(f)}: ${nome}() sem docblock de Formula`).toBe(true);
        expect(/Fonte:/i.test(doc), `${rel(f)}: ${nome}() sem docblock de Fonte`).toBe(true);
      }
    }
  });

  it('nenhuma funcao de KPI depende do relogio (Date.now / new Date())', () => {
    for (const f of kpisDeSecoes()) {
      const txt = lerCodigo(f);
      expect(/Date\.now\(\)/.test(txt), `${rel(f)} usa Date.now(): resultado muda com o tempo`).toBe(false);
      expect(/new Date\(\s*\)/.test(txt), `${rel(f)} usa new Date() sem argumento`).toBe(false);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Camada de dados                                                            */
/* -------------------------------------------------------------------------- */

describe('camada de dados', () => {
  const fetchTs = ler(path.join(SRC, 'lib', 'data', 'fetch.ts'));

  it('a paginacao usa 1000 linhas e continua enquanto a pagina vier cheia', () => {
    expect(/const PAGE = 1000/.test(fetchTs)).toBe(true);
    expect(/\.range\(from, from \+ PAGE - 1\)/.test(fetchTs)).toBe(true);
    expect(/rows\.length < PAGE/.test(fetchTs)).toBe(true);
  });

  it('getDataset e memoizado por request (React cache)', () => {
    expect(/cache\(async/.test(fetchTs)).toBe(true);
  });

  it('o middleware valida a sessao com getUser() e redireciona anonimo', () => {
    const mw = ler(path.join(SRC, 'middleware.ts'));
    expect(mw.includes('supabase.auth.getUser()')).toBe(true);
    expect(mw.includes('getSession()'), 'getSession() nao valida o JWT; use getUser()').toBe(false);
    expect(/NextResponse\.redirect/.test(mw)).toBe(true);
    expect(/startsWith\('\/login'\)/.test(mw)).toBe(true);
  });
});
