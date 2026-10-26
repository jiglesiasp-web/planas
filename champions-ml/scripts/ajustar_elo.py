"""Ajusta los parámetros del Elo con las temporadas 2012-13 a 2016-17.

Se usan solo temporadas ANTERIORES a las de prueba (2017-18 en adelante),
para que la evaluación no esté contaminada. Criterio: error cuadrático
entre la probabilidad Elo y el resultado (1 / 0,5 / 0) en la Champions.

Uso:
    python scripts/ajustar_elo.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from clml.features import EloParams, FeatureBuilder, load_all_matches  # noqa: E402

GRID = {"k": [25, 35, 45], "k_dom": [12, 20, 28], "home_adv": [60, 80, 100],
        "home_adv_dom": [40, 60, 80], "k_league": [8, 15, 25, 40]}


def main() -> None:
    ms = load_all_matches()

    def error(params: dict) -> float:
        df = FeatureBuilder(EloParams(**params)).run(ms)
        d = df[(df.season >= "2012-13") & (df.season <= "2016-17")]
        score = d.result.map({"H": 1.0, "D": 0.5, "A": 0.0})
        return float(((d.elo_all_exp - score) ** 2).mean())

    # Búsqueda por coordenadas: se ajusta un parámetro cada vez, dos vueltas.
    cur = {"k": 35, "k_dom": 20, "home_adv": 80, "home_adv_dom": 60, "k_league": 8}
    for vuelta in range(2):
        for name, values in GRID.items():
            res = sorted((error({**cur, name: v}), v) for v in values)
            cur[name] = res[0][1]
            print(f"vuelta {vuelta + 1}  {name:13s}", "  ".join(f"{v}: {e:.5f}" for e, v in res))
    print("Mejores parámetros:", cur, f"error {error(cur):.5f}")


if __name__ == "__main__":
    main()
