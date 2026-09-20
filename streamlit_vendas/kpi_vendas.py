"""
Espelho em Python dos KPIs de `src/lib/kpi/vendas.ts`.

Mesmas formulas, mesma regra das orfas, mesmo corte de 15 dias. Funcoes PURAS
sobre `dataset` (dict de listas de dicts): sem I/O, sem datetime.now(). A janela
temporal sai sempre dos proprios dados, nunca do relogio — assim o numero que
aparece aqui e o mesmo que a pagina Next mostra.

REGRA DAS ORFAS (§4 do CONTRATO.md): 20 vendas apontam para produtos que nao
existem no catalogo. Elas CONTAM nos totais de receita e SAEM de qualquer corte
por produto/categoria/marca.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable, Iterable

Venda = dict[str, Any]
Dataset = dict[str, list[dict[str, Any]]]


# --------------------------------------------------------------------------- #
# Regras compartilhadas — espelho de src/lib/data/regras.ts                    #
# --------------------------------------------------------------------------- #

def receita_linha(v: Venda) -> float:
    """Receita de uma linha. Formula unica do projeto: quantidade * preco_unitario."""
    return float(v["quantidade"]) * float(v["preco_unitario"])


def receita_total(vendas: Iterable[Venda]) -> float:
    return sum(receita_linha(v) for v in vendas)


def _ts(valor: str) -> datetime:
    """Parseia o timestamptz do PostgREST em datetime timezone-aware (UTC)."""
    texto = valor.replace("Z", "+00:00")
    dt = datetime.fromisoformat(texto)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def enriquecer(vendas: list[Venda], produtos: list[dict]) -> list[Venda]:
    """Junta venda + produto. Linhas ORFAS nao aparecem no resultado."""
    idx = {p["id_produto"]: p for p in produtos}
    out = []
    for v in vendas:
        produto = idx.get(v["id_produto"])
        if produto is not None:
            out.append({**v, "produto": produto})
    return out


def orfas(vendas: list[Venda], produtos: list[dict]) -> list[Venda]:
    ids = {p["id_produto"] for p in produtos}
    return [v for v in vendas if v["id_produto"] not in ids]


def nota_rodape_orfas(dataset: Dataset) -> str:
    o = orfas(dataset["vendas"], dataset["produtos"])
    if not o:
        return ""
    return (
        f"Exclui {len(o)} vendas ({fmt_brl(receita_total(o))}) cujo produto nao existe no "
        "catalogo — FK vendas_id_produto_fkey esta NOT VALID no banco. "
        "Esses valores seguem contando nos totais de receita."
    )


def janela(vendas: list[Venda]) -> dict[str, Any]:
    """
    Inicio, fim e corte (ponto medio) da janela observada.
    Base vazia devolve epoch + flag `vazio`: o relogio da maquina tornaria esta
    funcao nao-deterministica e faria o painel rotular "periodo observado: hoje"
    como se fosse a janela dos dados.
    """
    if not vendas:
        epoch = datetime.fromtimestamp(0, tz=timezone.utc)
        return {"inicio": epoch, "fim": epoch, "corte": epoch, "vazio": True}
    ts = [_ts(v["data_venda"]) for v in vendas]
    inicio, fim = min(ts), max(ts)
    return {"inicio": inicio, "fim": fim, "corte": inicio + (fim - inicio) / 2, "vazio": False}


def dividir_periodos(vendas: list[Venda]) -> tuple[list[Venda], list[Venda], datetime]:
    """Ultimos 15 dias vs. 15 anteriores. Unico delta do projeto — nao existe YoY."""
    corte = janela(vendas)["corte"]
    recente = [v for v in vendas if _ts(v["data_venda"]) >= corte]
    anterior = [v for v in vendas if _ts(v["data_venda"]) < corte]
    return recente, anterior, corte


def variacao(atual: float, base: float) -> float:
    """Variacao relativa segura (evita divisao por zero)."""
    return 0.0 if base == 0 else (atual - base) / base


def agrupar(itens: Iterable[Any], chave: Callable[[Any], str]) -> dict[str, list[Any]]:
    m: dict[str, list[Any]] = {}
    for it in itens:
        m.setdefault(chave(it), []).append(it)
    return m


def top_n_com_outros(
    grupos: dict[str, list[Any]], valor: Callable[[list[Any]], float], n: int
) -> list[dict[str, Any]]:
    """Teto de series: acima de n entidades o resto vira "Outros". Nunca um nono matiz."""
    ordenado = sorted(
        ({"nome": k, "valor": valor(v)} for k, v in grupos.items()),
        key=lambda d: d["valor"],
        reverse=True,
    )
    topo = ordenado[:n]
    resto = ordenado[n:]
    if resto:
        topo.append({"nome": "Outros", "valor": sum(r["valor"] for r in resto)})
    return topo


# --------------------------------------------------------------------------- #
# Formatadores — espelho de src/lib/design/format.ts                           #
# --------------------------------------------------------------------------- #

def _milhar(texto: str) -> str:
    """Converte o separador en-US do Python para o pt-BR (1,234.56 -> 1.234,56)."""
    return texto.replace(",", "\x00").replace(".", ",").replace("\x00", ".")


def fmt_brl(n: float) -> str:
    return "R$ " + _milhar(f"{round(n):,.0f}")


def fmt_brl_cents(n: float) -> str:
    return "R$ " + _milhar(f"{n:,.2f}")


def fmt_num(n: float) -> str:
    return _milhar(f"{n:,.0f}")


def fmt_pct(n: float) -> str:
    return _milhar(f"{n * 100:,.1f}") + "%"


def fmt_delta(n: float) -> str:
    return ("+" if n >= 0 else "") + fmt_pct(n)


def leitura(d: float) -> str:
    """Delta como texto de negocio: "caiu 5,0%" / "subiu 21,7%"."""
    return f"{'subiu' if d >= 0 else 'caiu'} {fmt_pct(abs(d))}"


# --------------------------------------------------------------------------- #
# 1. Abertura — o estado do negocio                                            #
# --------------------------------------------------------------------------- #

def _com_delta(vendas: list[Venda], medida: Callable[[list[Venda]], float]) -> dict[str, float]:
    recente, anterior, _ = dividir_periodos(vendas)
    r, a = medida(recente), medida(anterior)
    return {"valor": medida(vendas), "recente": r, "anterior": a, "delta": variacao(r, a)}


def _pedidos(vs: list[Venda]) -> float:
    return float(len({v["id_venda"] for v in vs}))


def _ticket(vs: list[Venda]) -> float:
    n = _pedidos(vs)
    return 0.0 if n == 0 else receita_total(vs) / n


def receita_com_delta(dataset: Dataset) -> dict[str, float]:
    """
    Receita total e variacao 15d.
    Formula: SOMA(quantidade * preco_unitario); delta = (recente - anterior) / anterior.
    Fonte: vendas.quantidade, vendas.preco_unitario, vendas.data_venda.
    Orfas: INCLUIDAS.
    """
    return _com_delta(dataset["vendas"], receita_total)


def pedidos_com_delta(dataset: Dataset) -> dict[str, float]:
    """
    Numero de pedidos e variacao 15d.
    Formula: CONTAGEM DISTINTA de vendas.id_venda.
    Fonte: vendas.id_venda, vendas.data_venda. Orfas: INCLUIDAS.
    """
    return _com_delta(dataset["vendas"], _pedidos)


def ticket_medio_com_delta(dataset: Dataset) -> dict[str, float]:
    """
    Ticket medio e variacao 15d.
    Formula: receita_total / nº de pedidos distintos.
    Fonte: vendas.quantidade * vendas.preco_unitario, vendas.id_venda. Orfas: INCLUIDAS.
    """
    return _com_delta(dataset["vendas"], _ticket)


def unidades_com_delta(dataset: Dataset) -> dict[str, float]:
    """
    Unidades vendidas e variacao 15d.
    Formula: SOMA(vendas.quantidade).
    Fonte: vendas.quantidade, vendas.data_venda. Orfas: INCLUIDAS.
    """
    return _com_delta(dataset["vendas"], lambda vs: float(sum(v["quantidade"] for v in vs)))


def data_corte(dataset: Dataset) -> str | None:
    """Data do corte entre os dois periodos, ISO. `None` com base vazia."""
    j = janela(dataset["vendas"])
    return None if j["vazio"] else j["corte"].date().isoformat()


def periodo_observado(dataset: Dataset) -> dict[str, str] | None:
    """Extremos da janela observada, ISO. `None` com base vazia."""
    j = janela(dataset["vendas"])
    if j["vazio"]:
        return None
    return {"inicio": j["inicio"].date().isoformat(), "fim": j["fim"].date().isoformat()}


# --------------------------------------------------------------------------- #
# 2. Tensao — a serie temporal                                                 #
# --------------------------------------------------------------------------- #

def receita_por_dia(dataset: Dataset) -> list[dict[str, Any]]:
    """
    Receita por dia, quebrada por canal.
    Formula: por data_venda::date, SOMA(quantidade * preco_unitario) por canal_venda.
    Fonte: vendas.data_venda, vendas.canal_venda. Orfas: INCLUIDAS (corte e temporal).
    Duas series na MESMA unidade (R$) — um unico eixo, jamais eixo duplo.
    """
    por_dia = agrupar(dataset["vendas"], lambda v: v["data_venda"][:10])
    linhas = [
        {
            "dia": dia,
            "ecommerce": receita_total([v for v in vs if v["canal_venda"] == "ecommerce"]),
            "loja_fisica": receita_total([v for v in vs if v["canal_venda"] == "loja_fisica"]),
            "total": receita_total(vs),
        }
        for dia, vs in por_dia.items()
    ]
    return sorted(linhas, key=lambda d: d["dia"])


def receita_media_diaria(dataset: Dataset) -> float:
    """Formula: receita_total / nº de dias distintos com venda."""
    dias = len({v["data_venda"][:10] for v in dataset["vendas"]})
    return 0.0 if dias == 0 else receita_total(dataset["vendas"]) / dias


# --------------------------------------------------------------------------- #
# 3. Explicacao — o corte por canal                                            #
# --------------------------------------------------------------------------- #

ROTULO_CANAL = {"ecommerce": "E-commerce", "loja_fisica": "Loja física"}
# Cor segue a ENTIDADE, nunca o ranking: indice fixo por canal.
INDICE_COR_CANAL = {"ecommerce": 0, "loja_fisica": 1}


def desempenho_por_canal(dataset: Dataset) -> list[dict[str, Any]]:
    """
    Desempenho por canal: mix, ticket e os deltas 15d.
    Formula: por canal_venda — receita = SOMA(qtd * preco); participacao = receita_canal /
             receita_total; ticket = receita_canal / pedidos_canal; delta = (rec - ant) / ant.
    Fonte: vendas.canal_venda, vendas.id_venda, vendas.data_venda.
    Orfas: INCLUIDAS — canal e atributo da propria venda, nao do produto.
    """
    total = receita_total(dataset["vendas"])
    corte = janela(dataset["vendas"])["corte"]
    grupos = agrupar(dataset["vendas"], lambda v: v["canal_venda"])

    saida = []
    for canal, vs in grupos.items():
        recente = [v for v in vs if _ts(v["data_venda"]) >= corte]
        anterior = [v for v in vs if _ts(v["data_venda"]) < corte]
        receita = receita_total(vs)
        r_rec, r_ant = receita_total(recente), receita_total(anterior)
        t_rec, t_ant = _ticket(recente), _ticket(anterior)
        saida.append(
            {
                "canal": canal,
                "rotulo": ROTULO_CANAL.get(canal, canal),
                "indice_cor": INDICE_COR_CANAL.get(canal, 2),
                "receita": receita,
                "participacao": 0.0 if total == 0 else receita / total,
                "pedidos": int(_pedidos(vs)),
                "unidades": sum(v["quantidade"] for v in vs),
                "ticket_medio": _ticket(vs),
                "receita_anterior": r_ant,
                "receita_recente": r_rec,
                "delta_receita": variacao(r_rec, r_ant),
                "ticket_anterior": t_ant,
                "ticket_recente": t_rec,
                "delta_ticket": variacao(t_rec, t_ant),
                # Pedidos DISTINTOS nos dois lados, igual ao campo `pedidos`.
                "delta_pedidos": variacao(_pedidos(recente), _pedidos(anterior)),
            }
        )
    return sorted(saida, key=lambda c: c["receita"], reverse=True)


# --------------------------------------------------------------------------- #
# 4. Cortes por produto — a partir daqui as ORFAS SAEM                         #
# --------------------------------------------------------------------------- #

def receita_classificavel(dataset: Dataset) -> float:
    """
    Receita das vendas cujo id_produto existe no catalogo.
    Base de TODOS os percentuais de categoria/produto: usar a receita total aqui
    inflaria o denominador com valor que nao pode ser atribuido.
    """
    return receita_total(enriquecer(dataset["vendas"], dataset["produtos"]))


def peso_orfas(dataset: Dataset) -> dict[str, float]:
    """Formula: receita_orfas / receita_total."""
    o = orfas(dataset["vendas"], dataset["produtos"])
    total = receita_total(dataset["vendas"])
    receita = receita_total(o)
    return {"linhas": len(o), "receita": receita, "fracao": 0.0 if total == 0 else receita / total}


def _categoria(linha: dict) -> str:
    return linha["produto"].get("categoria") or "Sem categoria"


def receita_por_categoria(dataset: Dataset, limite: int = 8) -> list[dict[str, Any]]:
    """
    Receita por categoria com delta 15d.
    Formula: por produtos.categoria — SOMA(qtd * preco); participacao sobre a
             receita CLASSIFICAVEL. `limite` aplica top-N + "Outros" (teto de 8 matizes).
    Fonte: vendas x produtos.categoria. Orfas: EXCLUIDAS.
    """
    linhas = enriquecer(dataset["vendas"], dataset["produtos"])
    base = receita_total(linhas)
    corte = janela(dataset["vendas"])["corte"]
    grupos = agrupar(linhas, _categoria)
    topo = top_n_com_outros(grupos, receita_total, limite)
    nomes_topo = {t["nome"] for t in topo}

    saida = []
    for fatia in topo:
        nome = fatia["nome"]
        if nome == "Outros" and nome not in grupos:
            itens = [l for l in linhas if _categoria(l) not in nomes_topo]
        else:
            itens = grupos.get(nome, [])
        recente = receita_total([l for l in itens if _ts(l["data_venda"]) >= corte])
        anterior = receita_total([l for l in itens if _ts(l["data_venda"]) < corte])
        saida.append(
            {
                "nome": nome,
                "receita": fatia["valor"],
                "participacao": 0.0 if base == 0 else fatia["valor"] / base,
                "pedidos": len({l["id_venda"] for l in itens}),
                "anterior": anterior,
                "recente": recente,
                "delta_absoluto": recente - anterior,
                "delta": variacao(recente, anterior),
            }
        )
    return saida


def delta_categoria_por_canal(dataset: Dataset, canal: str) -> list[dict[str, Any]]:
    """
    Variacao ABSOLUTA de receita por categoria dentro de um canal.
    Formula: receita_recente - receita_anterior, em R$, por produtos.categoria.
    Fonte: vendas x produtos.categoria, vendas.canal_venda. Orfas: EXCLUIDAS.
    Em reais e nao percentual: 300% de uma base minuscula nao move o resultado.
    O corte vem da janela COMPLETA — os canais tem de ser comparaveis entre si.
    """
    do_canal = [v for v in dataset["vendas"] if v["canal_venda"] == canal]
    linhas = enriquecer(do_canal, dataset["produtos"])
    base = receita_total(linhas)
    corte = janela(dataset["vendas"])["corte"]

    saida = []
    for nome, itens in agrupar(linhas, _categoria).items():
        recente = receita_total([l for l in itens if _ts(l["data_venda"]) >= corte])
        anterior = receita_total([l for l in itens if _ts(l["data_venda"]) < corte])
        receita = receita_total(itens)
        saida.append(
            {
                "nome": nome,
                "receita": receita,
                "participacao": 0.0 if base == 0 else receita / base,
                "pedidos": len({l["id_venda"] for l in itens}),
                "anterior": anterior,
                "recente": recente,
                "delta_absoluto": recente - anterior,
                "delta": variacao(recente, anterior),
            }
        )
    return sorted(saida, key=lambda c: c["delta_absoluto"])


def top_produtos(dataset: Dataset, n: int = 10) -> list[dict[str, Any]]:
    """
    Top N produtos por receita.
    Formula: por vendas.id_produto — SOMA(qtd * preco), desc; participacao sobre
             a receita CLASSIFICAVEL; preco_medio = receita / unidades.
    Fonte: vendas x produtos. Orfas: EXCLUIDAS.
    Agrupa por id_produto (nao por nome): nomes repetem entre SKUs.
    """
    linhas = enriquecer(dataset["vendas"], dataset["produtos"])
    base = receita_total(linhas)

    saida = []
    for id_produto, itens in agrupar(linhas, lambda l: l["id_produto"]).items():
        receita = receita_total(itens)
        unidades = sum(l["quantidade"] for l in itens)
        saida.append(
            {
                "id_produto": id_produto,
                "nome": itens[0]["produto"]["nome_produto"],
                "categoria": _categoria(itens[0]),
                "receita": receita,
                "participacao": 0.0 if base == 0 else receita / base,
                "unidades": unidades,
                "pedidos": len({l["id_venda"] for l in itens}),
                "preco_medio": 0.0 if unidades == 0 else receita / unidades,
            }
        )
    return sorted(saida, key=lambda p: p["receita"], reverse=True)[:n]


def curva_pareto(dataset: Dataset) -> list[dict[str, Any]]:
    """
    Curva de Pareto da receita por produto.
    Formula: produtos ordenados desc; para cada rank k, acumulado_k / receita_classificavel.
    Fonte: vendas x produtos. Orfas: EXCLUIDAS.
    UMA unica medida no eixo Y — nao e barra + linha com duas escalas (eixo duplo e proibido).
    """
    linhas = enriquecer(dataset["vendas"], dataset["produtos"])
    base = receita_total(linhas)
    grupos = agrupar(linhas, lambda l: l["id_produto"])
    ordenado = sorted((receita_total(itens) for itens in grupos.values()), reverse=True)

    saida, acumulado = [], 0.0
    for i, r in enumerate(ordenado):
        acumulado += r
        saida.append(
            {
                "rank": i + 1,
                "participacao_acumulada": 0.0 if base == 0 else acumulado / base,
                "fracao_catalogo": (i + 1) / len(ordenado),
            }
        )
    return saida


def concentracao_top_n(dataset: Dataset, n: int = 10) -> dict[str, Any]:
    """Quanto os N maiores produtos representam da receita classificavel."""
    curva = curva_pareto(dataset)
    if not curva:
        return {"n": 0, "participacao": 0.0, "produtos_com_venda": 0, "fracao_catalogo": 0.0}
    k = min(n, len(curva))
    return {
        "n": k,
        "participacao": curva[k - 1]["participacao_acumulada"],
        "produtos_com_venda": len(curva),
        "fracao_catalogo": k / len(curva),
    }


def produtos_para(dataset: Dataset, alvo: float = 0.8) -> int:
    """Menor k tal que o acumulado dos k maiores produtos alcanca `alvo` da receita."""
    curva = curva_pareto(dataset)
    for p in curva:
        if p["participacao_acumulada"] >= alvo:
            return p["rank"]
    return len(curva)
