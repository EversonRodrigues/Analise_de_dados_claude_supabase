"""
Carga do Dataset a partir do Supabase — espelho de `src/lib/data/fetch.ts`.

Le as credenciais dos mesmos arquivos que o Next usa (.env.local / .env). Nada
de chave embutida no codigo: o repositorio ignora *.env, e este modulo so le.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import requests

RAIZ = Path(__file__).resolve().parent.parent

# PostgREST corta em 1000 linhas por requisicao e `vendas` tem 3020 — sem
# paginacao explicita a receita apareceria truncada em um terco.
PAGINA = 1000

TABELAS = {
    "vendas": ("id_venda,data_venda,id_cliente,id_produto,canal_venda,quantidade,preco_unitario", "id_venda"),
    "produtos": ("id_produto,nome_produto,categoria,marca,preco_atual,data_criacao", "id_produto"),
    "clientes": ("id_cliente,nome_cliente,estado,pais,data_cadastro", "id_cliente"),
    "preco_competidores": ("id,id_produto,nome_concorrente,preco_concorrente,data_coleta", "id"),
}


def _ler_env() -> dict[str, str]:
    """Le .env.local e .env sem dependencia externa. Variaveis de ambiente vencem."""
    valores: dict[str, str] = {}
    for nome in (".env", ".env.local"):
        caminho = RAIZ / nome
        if not caminho.exists():
            continue
        for linha in caminho.read_text(encoding="utf-8").splitlines():
            linha = linha.strip()
            if not linha or linha.startswith("#") or "=" not in linha:
                continue
            chave, _, valor = linha.partition("=")
            valores[chave.strip()] = valor.strip().strip('"').strip("'")
    valores.update({k: v for k, v in os.environ.items() if k in valores or "SUPABASE" in k})

    valores.update(_ler_secrets())
    return valores


# Preenchido por _ler_secrets() para a mensagem de erro conseguir dizer o que
# realmente encontrou. Guarda so NOMES de chave, nunca valores.
_DIAGNOSTICO: dict[str, Any] = {"secrets": "nao consultado", "chaves": []}


def _ler_secrets() -> dict[str, str]:
    """
    Le st.secrets — a unica fonte de credenciais no Streamlit Community Cloud,
    porque o repositorio ignora *.env e nao ha .env no deploy.

    Aceita tanto chaves no nivel raiz quanto dentro de uma secao TOML, porque
    as duas formas sao naturais de colar no painel:

        NEXT_PUBLIC_SUPABASE_URL = "https://..."     # raiz

        [supabase]                                    # secao
        NEXT_PUBLIC_SUPABASE_URL = "https://..."
    """
    achados: dict[str, str] = {}
    try:
        import streamlit as st

        itens = list(st.secrets.items())
    except Exception as erro:
        _DIAGNOSTICO["secrets"] = f"indisponivel ({type(erro).__name__})"
        return achados

    vistas: list[str] = []
    for chave, valor in itens:
        if isinstance(valor, str):
            vistas.append(chave)
            achados[chave] = valor
        else:
            # Secao TOML: achata um nivel, prefixando nada — as chaves internas
            # e que interessam.
            try:
                for sub, subvalor in valor.items():
                    if isinstance(subvalor, str):
                        vistas.append(f"{chave}.{sub}")
                        achados.setdefault(sub, subvalor)
            except Exception:
                continue

    _DIAGNOSTICO["secrets"] = "ok" if vistas else "vazio"
    _DIAGNOSTICO["chaves"] = vistas
    return achados


def credenciais() -> tuple[str, str]:
    """URL do projeto + chave publica, com mensagem util quando faltar."""
    env = _ler_env()
    url = env.get("NEXT_PUBLIC_SUPABASE_URL") or env.get("SUPABASE_URL") or ""
    chave = (
        env.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
        or env.get("SUPABASE_PUBLISHABLE_KEY")
        or env.get("SUPABASE_ANON_KEY")
        or ""
    )
    if not url or not chave:
        raise RuntimeError(
            "Credenciais do Supabase nao encontradas.\n\n"
            f"st.secrets: {_DIAGNOSTICO['secrets']}\n"
            f"chaves visiveis em st.secrets: {_DIAGNOSTICO['chaves'] or 'nenhuma'}\n"
            f"URL encontrada: {'sim' if url else 'NAO'} | "
            f"chave encontrada: {'sim' if chave else 'NAO'}\n\n"
            "Esperado (as duas, no nivel raiz do secrets):\n"
            '  NEXT_PUBLIC_SUPABASE_URL = "https://<ref>.supabase.co"\n'
            '  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_..."\n\n'
            "Local: as mesmas duas em .env.local na raiz do projeto.\n"
            "Streamlit Cloud: Manage app > Settings > Secrets — o repositorio "
            "ignora *.env, entao nao existe .env no deploy. Depois de salvar, o "
            "app reinicia sozinho; se nao reiniciar, use Reboot."
        )
    return url.rstrip("/"), chave


def _buscar_tudo(url: str, chave: str, tabela: str, colunas: str, ordem: str) -> list[dict[str, Any]]:
    """Pagina ate o fim. Ordena por chave PRIMARIA: ordenar por coluna nao-unica
    pode repetir ou perder linha na fronteira entre paginas."""
    cabecalhos = {"apikey": chave, "Authorization": f"Bearer {chave}"}
    saida: list[dict[str, Any]] = []
    inicio = 0
    while True:
        resposta = requests.get(
            f"{url}/rest/v1/{tabela}",
            headers={**cabecalhos, "Range-Unit": "items", "Range": f"{inicio}-{inicio + PAGINA - 1}"},
            params={"select": colunas, "order": f"{ordem}.asc"},
            timeout=30,
        )
        if resposta.status_code not in (200, 206):
            raise RuntimeError(f"Falha ao ler {tabela}: HTTP {resposta.status_code} — {resposta.text[:200]}")
        linhas = resposta.json()
        saida.extend(linhas)
        if len(linhas) < PAGINA:
            return saida
        inicio += PAGINA


def carregar_dataset() -> dict[str, list[dict[str, Any]]]:
    """
    Le as 4 tabelas e devolve o mesmo Dataset que o dashboard Next consome.

    v1 (projeto de estudo): sem cadastro. As 4 tabelas tem policy de SELECT para
    o papel `anon`, entao a chave publica basta para ler. Nenhuma policy de
    escrita foi concedida a `anon` — a base continua nao-editavel de fora.
    Quando a trava voltar, e aqui que entra o access_token do usuario no Bearer.
    """
    url, chave = credenciais()
    dataset = {}
    for tabela, (colunas, ordem) in TABELAS.items():
        nome = "competidores" if tabela == "preco_competidores" else tabela
        dataset[nome] = _buscar_tudo(url, chave, tabela, colunas, ordem)
    return dataset
