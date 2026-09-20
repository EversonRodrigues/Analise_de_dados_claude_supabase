"""
Vendas & Receita em Streamlit — espelho da seção `/vendas` do dashboard Next.

Mesmas fórmulas (kpi_vendas.py), mesma paleta, mesma narrativa em quatro
batidas: abertura -> tensão -> explicação -> fechamento. Se um número aqui
divergir do Next, um dos dois está errado.

Rodar:  streamlit run streamlit_vendas/app.py
"""

from __future__ import annotations

import altair as alt
import pandas as pd
import streamlit as st

import dados
import kpi_vendas as k

# --------------------------------------------------------------------------- #
# Paleta — espelho de src/lib/design/tokens.ts (slots em ORDEM FIXA)          #
# --------------------------------------------------------------------------- #
SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"]
SEQUENTIAL_BLUE = [
    "#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5",
    "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b",
]
ORDINAL_MIN_INDEX = 3
DIVERGING_POS = "#2a78d6"
DIVERGING_NEG = "#d03b3b"

st.set_page_config(page_title="Vendas & Receita", page_icon="📈", layout="wide")


def eixo_moeda(campo: str, titulo: str) -> alt.X:
    return alt.X(campo, type="quantitative", title=titulo, axis=alt.Axis(format="~s"))


def _escapar(texto: str) -> str:
    """
    O Markdown do Streamlit lê `$…$` como LaTeX. Em português isso é uma cilada:
    "de R$ 499.527 para R$ 474.550" vira uma fórmula matemática que engole os
    dois cifrões e tudo que estiver entre eles — inclusive o **negrito**.
    Escapar o cifrão é o que mantém a moeda literal na tela.
    """
    return texto.replace("$", r"\$")


def md(texto: str, alvo=None) -> None:
    """st.markdown com moeda segura. `alvo` permite escrever dentro de coluna."""
    (alvo or st).markdown(_escapar(texto))


def cap(texto: str, alvo=None) -> None:
    """st.caption com moeda segura."""
    (alvo or st).caption(_escapar(texto))


# --------------------------------------------------------------------------- #
# Carga — v1 sem cadastro                                                      #
# --------------------------------------------------------------------------- #
@st.cache_data(show_spinner="Lendo as 4 tabelas do Supabase…", ttl=600)
def _carregar() -> dict:
    return dados.carregar_dataset()


with st.sidebar:
    cap("**Vendas & Receita**")
    cap("Espelho em Streamlit da seção /vendas do dashboard Next.")
    if st.button("Recarregar dados"):
        st.cache_data.clear()
        st.rerun()
    st.divider()
    # Registro honesto do que foi trocado por conveniencia nesta versao.
    cap(
        "v1 de estudo: leitura pública, sem cadastro. As 4 tabelas têm policy de SELECT para "
        "`anon`; nenhuma escrita foi liberada."
    )

try:
    ds = _carregar()
except Exception as e:  # rede, credenciais, RLS
    st.error(f"Falha ao carregar os dados: {e}")
    st.stop()


# --------------------------------------------------------------------------- #
# Estado vazio — antes de qualquer número                                      #
# --------------------------------------------------------------------------- #
periodo = k.periodo_observado(ds)
corte = k.data_corte(ds)

if not periodo or not corte:
    st.title("Vendas & Receita")
    st.warning(
        "A consulta não retornou nenhuma venda. Nada é exibido aqui até haver dados: um painel de "
        "zeros seria indistinguível de um negócio parado. Verifique as políticas de RLS da tabela "
        "`vendas` e as credenciais em `.env.local`.",
        icon="⚠️",
    )
    st.stop()


# --------------------------------------------------------------------------- #
# 1. ABERTURA                                                                  #
# --------------------------------------------------------------------------- #
receita = k.receita_com_delta(ds)
pedidos = k.pedidos_com_delta(ds)
ticket = k.ticket_medio_com_delta(ds)
unidades = k.unidades_com_delta(ds)
media_diaria = k.receita_media_diaria(ds)

st.title("Vendas & Receita")
md(
    f"**{k.fmt_num(len(ds['vendas']))} vendas** entre {periodo['inicio']} e {periodo['fim']} — "
    f"30 dias de operação. Sem histórico anterior, toda comparação desta página é "
    f"**últimos 15 dias contra os 15 anteriores**, com o corte em **{corte}**. "
    "Não há base para leitura anual nem sazonal."
)

c1, c2, c3, c4 = st.columns(4)
c1.metric("Receita total", k.fmt_brl(receita["valor"]), k.fmt_delta(receita["delta"]))
cap(f"{k.fmt_brl(media_diaria)} por dia, em média", c1)
c2.metric("Pedidos", k.fmt_num(pedidos["valor"]), k.fmt_delta(pedidos["delta"]))
cap(f"{k.fmt_num(pedidos['recente'])} nos últimos 15 dias", c2)
c3.metric("Ticket médio", k.fmt_brl_cents(ticket["valor"]), k.fmt_delta(ticket["delta"]))
cap(f"{k.fmt_brl_cents(ticket['anterior'])} → {k.fmt_brl_cents(ticket['recente'])}", c3)
c4.metric("Unidades vendidas", k.fmt_num(unidades["valor"]), k.fmt_delta(unidades["delta"]))
cap(f"{unidades['valor'] / max(1, pedidos['valor']):.2f} itens por pedido".replace(".", ","), c4)

st.divider()

# --------------------------------------------------------------------------- #
# 2. TENSÃO — a receita cai sem que o volume caia                              #
# --------------------------------------------------------------------------- #
st.subheader("A receita caiu sem que o volume caísse")
md(
    f"O número de pedidos {k.leitura(pedidos['delta'])} entre os dois períodos — praticamente "
    f"estável, com {k.fmt_num(pedidos['anterior'])} e depois {k.fmt_num(pedidos['recente'])}. "
    f"Ainda assim a receita {k.leitura(receita['delta'])}, de {k.fmt_brl(receita['anterior'])} "
    f"para {k.fmt_brl(receita['recente'])}. A perda de "
    f"{k.fmt_brl(receita['anterior'] - receita['recente'])} não veio de menos clientes comprando: "
    "veio do valor de cada pedido. E as duas linhas abaixo mostram que ela não é uniforme entre "
    "os canais."
)

serie = pd.DataFrame(k.receita_por_dia(ds))
longo = serie.melt(
    id_vars="dia", value_vars=["ecommerce", "loja_fisica"], var_name="canal", value_name="receita"
)
longo["canal"] = longo["canal"].map(k.ROTULO_CANAL)

# Duas séries na MESMA unidade (R$) e portanto no MESMO eixo. Nunca eixo duplo.
linha = (
    alt.Chart(longo)
    .mark_line(strokeWidth=2)
    .encode(
        x=alt.X("dia:T", title=None),
        y=alt.Y("receita:Q", title="Receita (R$)", axis=alt.Axis(format="~s")),
        # Cor pela ENTIDADE (canal), com domínio fixo: o ranking pode inverter,
        # as cores não trocam.
        color=alt.Color(
            "canal:N",
            title=None,
            scale=alt.Scale(
                domain=[k.ROTULO_CANAL["ecommerce"], k.ROTULO_CANAL["loja_fisica"]],
                range=[SERIES[0], SERIES[1]],
            ),
            legend=alt.Legend(orient="top"),
        ),
        tooltip=[
            alt.Tooltip("dia:T", title="Dia"),
            alt.Tooltip("canal:N", title="Canal"),
            alt.Tooltip("receita:Q", title="Receita", format=",.2f"),
        ],
    )
)
regua = (
    alt.Chart(pd.DataFrame({"corte": [pd.to_datetime(corte)]}))
    .mark_rule(strokeDash=[4, 4], color="#8a8a85")
    .encode(x="corte:T")
)
st.altair_chart((linha + regua).properties(height=320), use_container_width=True)

st.divider()

# --------------------------------------------------------------------------- #
# 3. EXPLICAÇÃO — canal                                                        #
# --------------------------------------------------------------------------- #
canais = k.desempenho_por_canal(ds)
online = next((c for c in canais if c["canal"] == "ecommerce"), None)
loja = next((c for c in canais if c["canal"] == "loja_fisica"), None)

st.subheader("Os dois canais foram em direções opostas")

esq, dir_ = st.columns(2)

with esq:
    ticket_longo = pd.DataFrame(
        [
            {"canal": c["rotulo"], "periodo": rotulo, "ticket": c[campo]}
            for c in canais
            for campo, rotulo in (
                ("ticket_anterior", "15 dias anteriores"),
                ("ticket_recente", "últimos 15 dias"),
            )
        ]
    )
    barras = (
        alt.Chart(ticket_longo)
        .mark_bar(cornerRadiusTopLeft=4, cornerRadiusTopRight=4)
        .encode(
            x=alt.X("periodo:N", title=None, axis=None),
            y=alt.Y("ticket:Q", title="Ticket médio (R$)"),
            color=alt.Color(
                "periodo:N",
                title=None,
                scale=alt.Scale(
                    domain=["15 dias anteriores", "últimos 15 dias"],
                    range=[SERIES[2], SERIES[3]],
                ),
                legend=alt.Legend(orient="top"),
            ),
            column=alt.Column("canal:N", title=None),
            tooltip=[
                alt.Tooltip("canal:N", title="Canal"),
                alt.Tooltip("periodo:N", title="Período"),
                alt.Tooltip("ticket:Q", title="Ticket", format=",.2f"),
            ],
        )
        .properties(height=280, width=160)
    )
    st.altair_chart(barras)

    if online and loja:
        virou = loja["ticket_recente"] > online["ticket_recente"]
        md(
            f"O e-commerce, que responde por {k.fmt_pct(online['participacao'])} da receita, viu o "
            f"ticket {k.leitura(online['delta_ticket'])} "
            f"({k.fmt_brl_cents(online['ticket_anterior'])} → "
            f"{k.fmt_brl_cents(online['ticket_recente'])}). A loja física fez o contrário: "
            f"{k.leitura(loja['delta_ticket'])} ({k.fmt_brl_cents(loja['ticket_anterior'])} → "
            f"{k.fmt_brl_cents(loja['ticket_recente'])}). "
            + (
                "O canal físico, que começava a janela abaixo do online, terminou acima dele."
                if virou
                else "O canal online segue à frente, mas a distância encurtou."
            )
        )

with dir_:
    st.dataframe(
        pd.DataFrame(
            [
                {
                    "Canal": c["rotulo"],
                    "Receita": k.fmt_brl(c["receita"]),
                    "Mix": k.fmt_pct(c["participacao"]),
                    "Pedidos": k.fmt_num(c["pedidos"]),
                    "Ticket": k.fmt_brl_cents(c["ticket_medio"]),
                    "Δ receita": k.fmt_delta(c["delta_receita"]),
                    "Δ ticket": k.fmt_delta(c["delta_ticket"]),
                }
                for c in canais
            ]
        ),
        hide_index=True,
        use_container_width=True,
    )
    cap("Canal é atributo da própria venda: as vendas órfãs continuam contadas aqui.")

    if online and loja:
        md(
            f"Em reais, o e-commerce perdeu "
            f"{k.fmt_brl(online['receita_anterior'] - online['receita_recente'])} e a loja física "
            f"ganhou {k.fmt_brl(loja['receita_recente'] - loja['receita_anterior'])}. O físico "
            "recuperou pouco mais da metade do que o online deixou na mesa — o saldo é a queda de "
            f"{k.fmt_pct(abs(receita['delta']))} no consolidado."
        )

st.divider()

# --------------------------------------------------------------------------- #
# 3b. EXPLICAÇÃO — atribuição por categoria (ORFÃS SAEM daqui para baixo)      #
# --------------------------------------------------------------------------- #
nota = k.nota_rodape_orfas(ds)
orfas_peso = k.peso_orfas(ds)
classificavel = k.receita_classificavel(ds)

delta_online = k.delta_categoria_por_canal(ds, "ecommerce")
pior = delta_online[0] if delta_online else None
melhor = delta_online[-1] if delta_online else None

st.subheader("Onde, dentro do e-commerce, o dinheiro sumiu")
texto = (
    "O corte está em reais, não em percentual: triplicar uma categoria de R$ 2 mil não paga a conta."
)
if pior and melhor:
    texto += (
        f" **{pior['nome']}** sozinha responde por {k.fmt_brl(abs(pior['delta_absoluto']))} da "
        f"perda online, enquanto **{melhor['nome']}** foi na direção oposta e somou "
        f"{k.fmt_brl(melhor['delta_absoluto'])}."
    )
md(texto)

df_delta = pd.DataFrame(delta_online)
# Escala divergente em torno de zero; o sinal aparece no rótulo, a cor não
# carrega sozinha o sentido.
df_delta["sentido"] = df_delta["delta_absoluto"].map(
    lambda v: "ganhou receita (+)" if v >= 0 else "perdeu receita (−)"
)
st.altair_chart(
    alt.Chart(df_delta)
    .mark_bar(cornerRadiusTopRight=4, cornerRadiusBottomRight=4)
    .encode(
        x=alt.X("delta_absoluto:Q", title="Variação de receita (R$)", axis=alt.Axis(format="+~s")),
        y=alt.Y("nome:N", sort=alt.SortField("delta_absoluto", order="ascending"), title=None),
        color=alt.Color(
            "sentido:N",
            title=None,
            scale=alt.Scale(
                domain=["ganhou receita (+)", "perdeu receita (−)"],
                range=[DIVERGING_POS, DIVERGING_NEG],
            ),
            legend=alt.Legend(orient="top"),
        ),
        tooltip=[
            alt.Tooltip("nome:N", title="Categoria"),
            alt.Tooltip("delta_absoluto:Q", title="Variação", format="+,.2f"),
            alt.Tooltip("anterior:Q", title="15d anteriores", format=",.2f"),
            alt.Tooltip("recente:Q", title="Últimos 15d", format=",.2f"),
        ],
    )
    .properties(height=360),
    use_container_width=True,
)
if nota:
    cap(nota)

st.divider()

esq2, dir2 = st.columns(2)

with esq2:
    st.subheader("Receita por categoria")
    cap(
        f"{k.fmt_brl(classificavel)} classificáveis em produto — "
        f"{k.fmt_pct(1 - orfas_peso['fracao'])} da receita total"
    )
    categorias = k.receita_por_categoria(ds, 8)
    df_cat = pd.DataFrame(categorias).sort_values("receita", ascending=False).reset_index(drop=True)
    # Magnitude de uma única medida -> UM matiz (sequencial), não codificação
    # categórica. Degraus nunca mais claros que ORDINAL_MIN_INDEX.
    vao = len(SEQUENTIAL_BLUE) - 1 - ORDINAL_MIN_INDEX
    df_cat["cor"] = [
        SEQUENTIAL_BLUE[
            max(
                ORDINAL_MIN_INDEX,
                len(SEQUENTIAL_BLUE) - 1 - round(i / max(1, len(df_cat) - 1) * vao),
            )
        ]
        for i in range(len(df_cat))
    ]
    st.altair_chart(
        alt.Chart(df_cat)
        .mark_bar(cornerRadiusTopRight=4, cornerRadiusBottomRight=4)
        .encode(
            x=eixo_moeda("receita", "Receita (R$)"),
            y=alt.Y("nome:N", sort="-x", title=None),
            color=alt.Color("cor:N", scale=None, legend=None),
            tooltip=[
                alt.Tooltip("nome:N", title="Categoria"),
                alt.Tooltip("receita:Q", title="Receita", format=",.2f"),
                alt.Tooltip("participacao:Q", title="% do classificável", format=".1%"),
            ],
        )
        .properties(height=340),
        use_container_width=True,
    )
    st.dataframe(
        pd.DataFrame(
            [
                {
                    "Categoria": c["nome"],
                    "Receita": k.fmt_brl(c["receita"]),
                    "% do classificável": k.fmt_pct(c["participacao"]),
                    "Δ 15d": k.fmt_delta(c["delta"]),
                }
                for c in categorias
            ]
        ),
        hide_index=True,
        use_container_width=True,
    )
    if nota:
        cap(nota)

with dir2:
    conc = k.concentracao_top_n(ds, 10)
    para80 = k.produtos_para(ds, 0.8)
    st.subheader("A receita está concentrada em poucos SKUs")
    cap(f"{k.fmt_num(conc['produtos_com_venda'])} produtos tiveram venda no período")

    df_pareto = pd.DataFrame(k.curva_pareto(ds))
    # UMA medida no eixo Y. Não é "barras + linha acumulada" — aquilo exige duas
    # escalas e eixo duplo é proibido. O ranking vive na tabela abaixo.
    area = (
        alt.Chart(df_pareto)
        .mark_area(line={"color": SERIES[0], "strokeWidth": 2}, color=SERIES[0], opacity=0.18)
        .encode(
            x=alt.X("rank:Q", title="produtos ordenados por receita"),
            y=alt.Y(
                "participacao_acumulada:Q",
                title="% acumulado da receita",
                axis=alt.Axis(format=".0%"),
                scale=alt.Scale(domain=[0, 1]),
            ),
            tooltip=[
                alt.Tooltip("rank:Q", title="Produtos"),
                alt.Tooltip("participacao_acumulada:Q", title="Acumulado", format=".1%"),
            ],
        )
    )
    alvo = (
        alt.Chart(pd.DataFrame({"y": [0.8]}))
        .mark_rule(strokeDash=[4, 4], color="#8a8a85")
        .encode(y="y:Q")
    )
    marco = (
        alt.Chart(pd.DataFrame({"x": [conc["n"]], "y": [conc["participacao"]]}))
        .mark_point(size=90, filled=True, color=SERIES[0], stroke="white", strokeWidth=2)
        .encode(x="x:Q", y="y:Q")
    )
    st.altair_chart((area + alvo + marco).properties(height=300), use_container_width=True)

    md(
        f"{k.fmt_num(conc['n'])} produtos — {k.fmt_pct(conc['fracao_catalogo'])} dos que venderam — "
        f"concentram {k.fmt_pct(conc['participacao'])} da receita classificável. Para chegar a 80% "
        f"bastam {k.fmt_num(para80)} SKUs. Uma ruptura de estoque no topo dessa curva não é "
        "incidente operacional, é evento de receita."
    )
    st.dataframe(
        pd.DataFrame(
            [
                {
                    "Produto": p["nome"],
                    "Categoria": p["categoria"],
                    "Receita": k.fmt_brl(p["receita"]),
                    "%": k.fmt_pct(p["participacao"]),
                    "Unid.": k.fmt_num(p["unidades"]),
                }
                for p in k.top_produtos(ds, 10)
            ]
        ),
        hide_index=True,
        use_container_width=True,
    )
    if nota:
        cap(nota)

st.divider()

# --------------------------------------------------------------------------- #
# 4. FECHAMENTO                                                                #
# --------------------------------------------------------------------------- #
if online and loja and pior:
    st.subheader("O problema é o valor do carrinho online, não a demanda — e ele tem endereço")
    md(
        f"Com {k.fmt_num(pedidos['valor'])} pedidos e volume estável "
        f"({k.fmt_delta(pedidos['delta'])} entre os períodos), a queda de "
        f"{k.fmt_pct(abs(receita['delta']))} na receita é inteiramente um problema de ticket: "
        f"{k.fmt_brl_cents(ticket['anterior'])} caíram para {k.fmt_brl_cents(ticket['recente'])}. "
        f"Ela está concentrada no e-commerce, que perdeu "
        f"{k.fmt_brl(online['receita_anterior'] - online['receita_recente'])} enquanto a loja "
        f"física ganhou {k.fmt_brl(loja['receita_recente'] - loja['receita_anterior'])} — e dentro "
        f"do online, {pior['nome']} explica {k.fmt_brl(abs(pior['delta_absoluto']))} do buraco."
    )
    md(
        f"**O que fazer:** auditar preço praticado e desconto em {pior['nome']} no e-commerce "
        "antes de qualquer investimento em tráfego — pagar por mais visitas a um carrinho que "
        f"encolheu {k.fmt_pct(abs(online['delta_ticket']))} só multiplica pedidos baratos. Em "
        f"paralelo, proteger o topo da curva: {k.fmt_num(conc['n'])} SKUs carregam "
        f"{k.fmt_pct(conc['participacao'])} da receita, e a loja física — hoje com ticket de "
        f"{k.fmt_brl_cents(loja['ticket_recente'])}, acima do online — mostra que o cliente aceita "
        "cesta maior quando o sortimento certo está na frente dele."
    )
    cap(
        f"Leitura limitada a {periodo['inicio']}–{periodo['fim']}. Sem histórico anterior, nada "
        "aqui distingue mudança estrutural de oscilação de 15 dias; "
        f"{k.fmt_num(orfas_peso['linhas'])} vendas ({k.fmt_brl(orfas_peso['receita'])}, "
        f"{k.fmt_pct(orfas_peso['fracao'])} da receita) não têm produto no catálogo e ficam fora "
        "dos cortes por categoria e SKU."
    )
