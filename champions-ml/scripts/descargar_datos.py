"""Descarga (o actualiza) los datos.

1. Competiciones europeas: openfootball/champions-league (dominio público).
   Ya vienen incluidas en data/raw; se descargan de nuevo para actualizarlas.
2. Ligas nacionales: football-data.co.uk (resultados y cuotas). NO se
   incluyen en el repositorio: hay que descargarlas con este script.

Las copas y ligas de openfootball de data/openfootball_nacional ya vienen
incluidas (dominio público).

Uso:
    python scripts/descargar_datos.py               # todo
    python scripts/descargar_datos.py --solo-ligas
    python scripts/descargar_datos.py --desde 2025  # solo temporadas recientes
"""

from __future__ import annotations

import argparse
import datetime as dt
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from clml.domestic import FD_DIR, FD_EXTRA, FD_MAIN  # noqa: E402

RAW = ROOT / "data" / "raw"
OF_BASE = "https://raw.githubusercontent.com/openfootball/champions-league/master"
OF_FILES = ["cl.txt", "clq.txt", "el.txt", "elq.txt", "conf.txt", "confq.txt"]
FD_BASE = "https://www.football-data.co.uk"


def fetch(url: str) -> bytes | None:
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            print(f"  {url}: error {e.code}")
        except urllib.error.URLError as e:
            print(f"  {url}: {e.reason}")
        time.sleep(2 ** attempt)
    return None


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--desde", type=int, default=2011, help="año de inicio de la primera temporada")
    ap.add_argument("--solo-ligas", action="store_true")
    args = ap.parse_args(argv)
    today = dt.date.today()
    last = today.year if today.month >= 7 else today.year - 1
    n = 0

    if not args.solo_ligas:
        print("Competiciones europeas (openfootball)...")
        for y in range(args.desde, last + 1):
            season = f"{y}-{str(y + 1)[2:]}"
            for name in OF_FILES:
                data = fetch(f"{OF_BASE}/{season}/{name}")
                if data:
                    out = RAW / season / name
                    out.parent.mkdir(parents=True, exist_ok=True)
                    out.write_bytes(data)
                    n += 1

    print("Ligas nacionales (football-data.co.uk)...")
    FD_DIR.mkdir(parents=True, exist_ok=True)
    for y in range(max(args.desde, 2011), last + 1):
        code = f"{y % 100:02d}{(y + 1) % 100:02d}"
        for div in FD_MAIN:
            data = fetch(f"{FD_BASE}/mmz4281/{code}/{div}.csv")
            if data:
                (FD_DIR / f"{code}_{div}.csv").write_bytes(data)
                n += 1
    for c in FD_EXTRA:
        data = fetch(f"{FD_BASE}/new/{c}.csv")
        if data:
            (FD_DIR / f"new_{c}.csv").write_bytes(data)
            n += 1
    print(f"{n} ficheros descargados")
    return 0 if n else 1


if __name__ == "__main__":
    sys.exit(main())
