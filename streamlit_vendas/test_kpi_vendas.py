"""
Autoteste do espelho Python dos KPIs de vendas.

Nao depende de rede nem de credenciais: roda sobre um fixture sintetico com
valores conferidos a mao. Cobre as mesmas invariantes que o QA travou no lado
TypeScript — regra das orfas, corte de 15 dias, pedidos distintos, Pareto.

Rodar:  python streamlit_vendas/test_kpi_vendas.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import kpi_vendas as k  # noqa: E402

FALHAS: list[str] = []


def checar(nome: str, obtido, esperado, tol: float = 1e-9) -> None:
    ok = (
        abs(obtido - esperado) <= tol
        if isinstance(esperado, (int, float)) and isinstance(obtido, (int, float))
        else obtido == esperado
    )
    print(f"{'ok  ' if ok else 'FALHA'}  {nome}: {obtido!r}" + ("" if ok else f" != {esperado!r}"))
    if not ok:
        FALHAS.append(nome)


def venda(id_venda, dia, id_produto, canal, qtd, preco, id_cliente="cus_1"):
    return {
        "id_venda": id_venda,
        "data_venda": f"2026-01-{dia:02d}T12:00:00+00:00",
        "id_cliente": id_cliente,
        "id_produto": id_produto,
        "canal_venda": canal,
        "quantidade": qtd,
        "preco_unitario": preco,
    }


def produto(id_produto, nome, categoria):
    return {
        "id_produto": id_produto,
        "nome_produto": nome,
        "categoria": categoria,
        "marca": "M",
        "preco_atual": 10,
        "data_criacao": None,
    }


# Janela: dias 01 a 11 -> corte no dia 06 ao meio-dia. Dias >= 06 sao "recente".
DS = {
    "vendas": [
        # --- periodo ANTERIOR (dias 01-05) ---
        venda("v1", 1, "p1", "ecommerce", 2, 100.0),      # 200
        venda("v2", 3, "p2", "loja_fisica", 1, 50.0),     # 50
        venda("v3", 5, "p_orfao", "ecommerce", 1, 40.0),  # 40  <- ORFA
        # --- periodo RECENTE (dias 06-11) ---
        venda("v4", 7, "p1", "ecommerce", 1, 100.0),      # 100
        venda("v5", 9, "p2", "loja_fisica", 3, 50.0),     # 150
        venda("v5", 9, "p1", "loja_fisica", 1, 100.0),    # 100 <- MESMO id_venda que acima
        venda("v6", 11, "p_orfao", "ecommerce", 2, 30.0), # 60  <- ORFA
    ],
    "produtos": [produto("p1", "Produto Um", "Moda"), produto("p2", "Produto Dois", "Casa")],
    "clientes": [],
    "competidores": [],
}

print("\n--- totais: orfas CONTAM ---")
r = k.receita_com_delta(DS)
checar("receita total (200+50+40+100+150+100+60)", r["valor"], 700.0)
checar("receita anterior (200+50+40)", r["anterior"], 290.0)
checar("receita recente (100+150+100+60)", r["recente"], 410.0)
checar("delta receita (410-290)/290", r["delta"], 410 / 290 - 1)

print("\n--- pedidos: DISTINTOS, nao linhas ---")
p = k.pedidos_com_delta(DS)
checar("7 linhas mas 6 id_venda distintos", p["valor"], 6.0)
checar("pedidos anteriores (v1,v2,v3)", p["anterior"], 3.0)
checar("pedidos recentes (v4,v5,v6) — v5 aparece 2x", p["recente"], 3.0)
checar("delta pedidos = 0 (3 -> 3)", p["delta"], 0.0)

print("\n--- ticket e unidades ---")
t = k.ticket_medio_com_delta(DS)
checar("ticket = 700 / 6 pedidos", t["valor"], 700 / 6)
u = k.unidades_com_delta(DS)
checar("unidades (2+1+1+1+3+1+2)", u["valor"], 11.0)

print("\n--- orfas: contam no total, saem do corte por produto ---")
peso = k.peso_orfas(DS)
checar("2 linhas orfas", peso["linhas"], 2)
checar("receita orfa (40+60)", peso["receita"], 100.0)
checar("receita classificavel (700-100)", k.receita_classificavel(DS), 600.0)
checar("nota de rodape menciona as 2 orfas", "2 vendas" in k.nota_rodape_orfas(DS), True)

print("\n--- canal: delta_pedidos conta pedidos distintos ---")
canais = {c["canal"]: c for c in k.desempenho_por_canal(DS)}
checar("receita ecommerce (200+40+100+60)", canais["ecommerce"]["receita"], 400.0)
checar("receita loja_fisica (50+150+100)", canais["loja_fisica"]["receita"], 300.0)
checar("mix soma 1", sum(c["participacao"] for c in canais.values()), 1.0)
checar("loja_fisica: 2 linhas recentes mas 1 pedido", canais["loja_fisica"]["pedidos"], 2)
checar(
    "delta_pedidos loja_fisica: 1 -> 1 = 0 (nao 2/1-1=1,0)",
    canais["loja_fisica"]["delta_pedidos"],
    0.0,
)
checar("cor do ecommerce e sempre slot 0", canais["ecommerce"]["indice_cor"], 0)
checar("cor da loja fisica e sempre slot 1", canais["loja_fisica"]["indice_cor"], 1)

print("\n--- cor segue a entidade, nao o ranking ---")
DS_INVERTIDO = {**DS, "vendas": DS["vendas"] + [venda("v9", 10, "p2", "loja_fisica", 40, 100.0)]}
inv = {c["canal"]: c for c in k.desempenho_por_canal(DS_INVERTIDO)}
checar("loja_fisica agora lidera o ranking", k.desempenho_por_canal(DS_INVERTIDO)[0]["canal"], "loja_fisica")
checar("mas a cor do ecommerce continua 0", inv["ecommerce"]["indice_cor"], 0)
checar("e a da loja fisica continua 1", inv["loja_fisica"]["indice_cor"], 1)

print("\n--- categoria: soma o CLASSIFICAVEL, nao o total ---")
cats = k.receita_por_categoria(DS, 8)
checar("soma das categorias == receita classificavel", sum(c["receita"] for c in cats), 600.0)
checar("Moda (200+100+100)", next(c["receita"] for c in cats if c["nome"] == "Moda"), 400.0)
checar("Casa (50+150)", next(c["receita"] for c in cats if c["nome"] == "Casa"), 200.0)
checar("participacoes somam 1", sum(c["participacao"] for c in cats), 1.0)

print("\n--- top-N + Outros respeita o teto de 8 matizes ---")
muitas = {
    **DS,
    "produtos": [produto(f"p{i}", f"Produto {i}", f"Cat{i}") for i in range(12)],
    "vendas": [venda(f"m{i}", 2, f"p{i}", "ecommerce", 1, float(100 - i)) for i in range(12)],
}
fatias = k.receita_por_categoria(muitas, 8)
checar("8 categorias + Outros = 9 fatias", len(fatias), 9)
checar("a ultima fatia e Outros", fatias[-1]["nome"], "Outros")
# 12 categorias com receita 100, 99, ..., 89. Top 8 = 100..93; sobram 92, 91, 90, 89.
checar(
    "Outros = soma das 4 menores (92+91+90+89)",
    fatias[-1]["receita"],
    92 + 91 + 90 + 89,
)

print("\n--- atribuicao por canal, em reais ---")
d_ecom = {c["nome"]: c for c in k.delta_categoria_por_canal(DS, "ecommerce")}
checar("Moda no ecommerce: 100 - 200 = -100", d_ecom["Moda"]["delta_absoluto"], -100.0)
checar("ordenado da maior perda para o maior ganho", k.delta_categoria_por_canal(DS, "ecommerce")[0]["nome"], "Moda")

print("\n--- produto e Pareto ---")
top = k.top_produtos(DS, 10)
checar("2 produtos com venda (orfao fora)", len(top), 2)
checar("p1 lidera com 400", top[0]["receita"], 400.0)
checar("preco medio p1 = 400 / 4 unidades", top[0]["preco_medio"], 100.0)
curva = k.curva_pareto(DS)
checar("curva tem um ponto por produto", len(curva), 2)
checar("curva fecha em 100%", curva[-1]["participacao_acumulada"], 1.0)
checar("curva e monotonica", all(a["participacao_acumulada"] <= b["participacao_acumulada"] for a, b in zip(curva, curva[1:])), True)
conc = k.concentracao_top_n(DS, 1)
checar("top 1 = 400/600", conc["participacao"], 400 / 600)
checar("produtos_para(0.8) = 2", k.produtos_para(DS, 0.8), 2)

print("\n--- base vazia: epoch nao vaza para a tela ---")
VAZIO = {"vendas": [], "produtos": [], "clientes": [], "competidores": []}
checar("data_corte e None", k.data_corte(VAZIO), None)
checar("periodo_observado e None", k.periodo_observado(VAZIO), None)
checar("receita zero sem estourar", k.receita_com_delta(VAZIO)["valor"], 0.0)

print("\n--- pureza: nada muta o dataset, duas chamadas concordam ---")
antes = len(DS["vendas"])
k.receita_por_categoria(DS, 8)
k.top_produtos(DS, 5)
checar("dataset intacto", len(DS["vendas"]), antes)
checar("determinismo", k.receita_com_delta(DS)["valor"], k.receita_com_delta(DS)["valor"])

print("\n--- formatadores em pt-BR ---")
checar("fmt_brl", k.fmt_brl(974077.28), "R$ 974.077")
checar("fmt_brl_cents", k.fmt_brl_cents(322.54), "R$ 322,54")
checar("fmt_num", k.fmt_num(3020), "3.020")
checar("fmt_pct", k.fmt_pct(0.7241), "72,4%")
checar("fmt_delta negativo", k.fmt_delta(-0.05), "-5,0%")
checar("fmt_delta positivo", k.fmt_delta(0.217), "+21,7%")
checar("leitura", k.leitura(-0.05), "caiu 5,0%")

print()
if FALHAS:
    print(f"{len(FALHAS)} FALHA(S): {', '.join(FALHAS)}")
    sys.exit(1)
print("todos os checks passaram")
