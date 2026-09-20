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

    # Streamlit Community Cloud nao tem .env: o repositorio ignora *.env, entao
    # la as credenciais vem de st.secrets (Settings > Secrets no painel do app).
    # Fica por ultimo de proposito — no deploy e a unica fonte; localmente o
    # .env.local continua valendo porque secrets nao existe.
    try:
        import streamlit as st

        for chave, valor in st.secrets.items():
            if isinstance(valor, str) and "SUPABASE" in chave:
                valores.setdefault(chave, valor)
    except Exception:
        # Sem streamlit no contexto (teste unitario, script) ou sem secrets
        # configurado: seguimos so com .env e variaveis de ambiente.
        pass

    return valores


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
            "Credenciais do Supabase nao encontradas.\n"
            "  Local: NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY "
            "em .env.local (ou SUPABASE_URL / SUPABASE_ANON_KEY em .env) na raiz do projeto.\n"
            "  Streamlit Cloud: as mesmas duas chaves em Settings > Secrets do app — "
            "o repositorio ignora *.env, entao nao ha .env no deploy."
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
