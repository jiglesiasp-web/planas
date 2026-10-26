"""Simula la Champions en curso y escribe el pronóstico.

1. (Opcional) Actualiza calendario y resultados desde Wikipedia.
2. Entrena el modelo con todos los datos hasta hoy.
3. Juega 20.000 veces lo que queda de temporada.
4. Escribe reports/simulacion_2026_27.md y web/simulacion.json.

Uso:
    python scripts/simular_champions.py               # con los datos guardados
    python scripts/simular_champions.py --actualizar  # descarga antes los últimos resultados
    python scripts/simular_champions.py --n 5000
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
import warnings
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
warnings.filterwarnings("ignore")

from clml.features import load_current_season, load_matches  # noqa: E402
from clml.predict import Predictor  # noqa: E402
from clml.simulacion import ChampionsSimulator  # noqa: E402
from clml.teams import team_id  # noqa: E402
from clml.wikipedia import WIKI_URL, parse_wikitext, save_csv  # noqa: E402

REPORT = ROOT / "reports" / "simulacion_2026_27.md"
WEB_JSON = ROOT / "web" / "simulacion.json"


def pct(x: float) -> str:
    if x == 0:
        return "0 %"
    if x < 0.001:
        return "<0,1 %"
    return f"{x * 100:.1f} %".replace(".", ",")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=20000, help="número de simulaciones")
    ap.add_argument("--actualizar", action="store_true", help="descargar resultados de Wikipedia")
    args = ap.parse_args(argv)

    if args.actualizar:
        req = urllib.request.Request(WIKI_URL, headers={"User-Agent": "champions-ml/1.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            rows = parse_wikitext(r.read().decode("utf-8"))
        save_csv(rows)
        print(f"Calendario actualizado: {len(rows)} partidos")

    P = Predictor()
    played, pending = load_current_season(load_matches())
    if not pending:
        print("No quedan partidos de fase de liga por jugar.")
    sim = ChampionsSimulator(P, played, pending, seed=2026)
    table = sim.current_table()
    res = sim.run(args.n)

    # Próxima jornada: partidos pendientes de las dos primeras fechas.
    dates = sorted({m.date for m in pending})
    next_dates = set(dates[:2])
    upcoming = []
    for m in pending:
        h, a = team_id(m.home_country, m.home), team_id(m.away_country, m.away)
        mm = sim.model(h, a, False, "league", None)
        upcoming.append({"fecha": m.date.isoformat(), "local": h, "visitante": a,
                         "p": [round(float(x), 4) for x in mm.probs],
                         "xg": [round(float(x), 2) for x in mm.xg],
                         "proxima": m.date in next_dates})

    name = lambda t: t.rsplit(" (", 1)[0]  # noqa: E731
    out = {
        "n_sim": args.n,
        "jugados": len(played), "pendientes": len(pending),
        "ultimo_jugado": max(m.date for m in played).isoformat() if played else None,
        "datos_hasta": P.data_date.isoformat(),
        "clasificacion": [{"equipo": r["equipo"], "pj": int(r["pj"]), "pts": int(r["pts"]),
                           "dg": int(r["dg"]), "gf": int(r["gf"])} for r in table.to_dict("records")],
        "simulacion": [{k: (round(float(v), 4) if k != "equipo" else v) for k, v in r.items()}
                       for r in res.to_dict("records")],
        "partidos": upcoming,
    }
    WEB_JSON.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    md = [
        "# Champions 2026-27: pronóstico del modelo",
        "",
        f"Simulación de lo que queda de temporada ({args.n:,} veces) con los partidos jugados hasta el "
        f"{out['ultimo_jugado']} ({len(played)} de 144 de la fase de liga) y las ligas nacionales hasta el "
        f"{out['datos_hasta']}.".replace(",", "."),
        "",
        "Calendario y resultados de 2026-27: Wikipedia (fase de liga). Las eliminatorias siguen el "
        "formato de la UEFA desde 2024-25, con los sorteos simulados al azar. La fuerza de cada "
        "equipo se mantiene fija durante la simulación.",
        "",
        "## Probabilidad de cada equipo",
        "",
        "| # | Equipo | Pts ahora | Pts esperados | Top 8 | Octavos | Cuartos | Semis | Final | Campeón |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    now = {r["equipo"]: r for r in out["clasificacion"]}
    for i, r in enumerate(res.to_dict("records"), 1):
        md.append(f"| {i} | {name(r['equipo'])} | {now[r['equipo']]['pts']} | {str(round(r['puntos_esperados'], 1)).replace('.', ',')} | "
                  f"{pct(r['top8'])} | {pct(r['octavos'])} | {pct(r['cuartos'])} | {pct(r['semis'])} | "
                  f"{pct(r['final'])} | {pct(r['campeon'])} |")
    md += ["", "## Próxima jornada", "", "| Fecha | Partido | 1 | X | 2 |", "|---|---|---|---|---|"]
    for u in upcoming:
        if u["proxima"]:
            md.append(f"| {u['fecha']} | {name(u['local'])} – {name(u['visitante'])} | "
                      f"{pct(u['p'][0])} | {pct(u['p'][1])} | {pct(u['p'][2])} |")
    REPORT.write_text("\n".join(md) + "\n", encoding="utf-8")

    print(res.head(16)[["equipo", "top8", "octavos", "cuartos", "semis", "final", "campeon"]]
          .round(3).to_string())
    print(f"\nInforme: {REPORT}\nDatos web: {WEB_JSON}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
