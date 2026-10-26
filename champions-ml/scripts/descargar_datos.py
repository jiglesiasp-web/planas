"""Descarga (o actualiza) los datos de openfootball/champions-league.

Los datos ya vienen incluidos en data/raw; este script sirve para
actualizarlos cuando openfootball publique nuevas temporadas o resultados.

Uso:
    python scripts/descargar_datos.py              # temporadas 2011-12 hasta la actual
    python scripts/descargar_datos.py --desde 2024
"""

from __future__ import annotations

import argparse
import datetime as dt
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
BASE = "https://raw.githubusercontent.com/openfootball/champions-league/master"
FILES = ["cl.txt", "clq.txt", "el.txt", "elq.txt", "conf.txt", "confq.txt"]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--desde", type=int, default=2011, help="año de inicio de la primera temporada")
    args = ap.parse_args(argv)
    today = dt.date.today()
    last = today.year if today.month >= 7 else today.year - 1
    found = 0
    for y in range(args.desde, last + 1):
        season = f"{y}-{str(y + 1)[2:]}"
        for name in FILES:
            url = f"{BASE}/{season}/{name}"
            try:
                with urllib.request.urlopen(url, timeout=30) as r:
                    data = r.read()
            except urllib.error.HTTPError as e:
                if e.code != 404:
                    print(f"  {season}/{name}: error {e.code}")
                continue
            out = RAW / season / name
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(data)
            found += 1
            print(f"  {season}/{name}: {len(data) // 1024} KB")
    print(f"{found} ficheros guardados en {RAW}")
    return 0 if found else 1


if __name__ == "__main__":
    sys.exit(main())
