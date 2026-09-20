"""
Ponto de entrada do Streamlit Community Cloud.

POR QUE ESTE ARQUIVO EXISTE
---------------------------
O app de verdade e `streamlit_vendas/app.py`. So que a deteccao automatica do
Streamlit Cloud escolheu `streamlit_vendas/kpi_vendas.py` como arquivo
principal — um modulo de funcoes puras, sem nenhuma chamada `st.*`. O script
roda, define as funcoes e termina: a pagina sobe em branco, sem erro nenhum,
porque nada foi desenhado. E o caminho principal nao e editavel depois que o
app e criado.

`streamlit_app.py` na raiz e o nome que o Streamlit Cloud procura primeiro.
Com este arquivo aqui, a deteccao automatica passa a cair no lugar certo.

Ele nao duplica logica: so poe `streamlit_vendas/` no sys.path (porque
`app.py` importa `dados` e `kpi_vendas` como modulos irmaos) e executa o app.
"""

from __future__ import annotations

import runpy
import sys
from pathlib import Path

DIRETORIO_APP = Path(__file__).resolve().parent / "streamlit_vendas"

# `app.py` faz `import dados` / `import kpi_vendas` — imports de modulo irmao.
# Rodando a partir da raiz, o diretorio deles nao esta no path por padrao.
if str(DIRETORIO_APP) not in sys.path:
    sys.path.insert(0, str(DIRETORIO_APP))

# run_name="__main__" para que o app se comporte como se tivesse sido chamado
# diretamente por `streamlit run app.py`.
runpy.run_path(str(DIRETORIO_APP / "app.py"), run_name="__main__")
