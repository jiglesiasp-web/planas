"""Busca los parámetros del Elo (K, ventaja de campo...) con las temporadas 2012-13 a 2016-17.

Se usan solo temporadas ANTERIORES a las de prueba (2017-18 en adelante),
para que la evaluación no esté contaminada.

Uso:
    python scripts/ajustar_elo.py
"""

from __future__ import annotations

import itertools
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from clml.features import EloParams, FeatureBuilder, load_matches  # noqa: E402


def main() -> None:
    ms = load_matches()
    res = []
    grid = itertools.product([20, 30, 35, 40, 50], [50, 70, 80, 90, 110],
                             [0.0, 0.1, 0.2, 0.33], [0.3, 0.6])
    for k, h, r, cw in grid:
        df = FeatureBuilder(EloParams(k=k, home_adv=h, season_regress=r, country_weight=cw)).run(ms)
        d = df[(df.season >= "2012-13") & (df.season <= "2016-17")]
        score = d.result.map({"H": 1.0, "D": 0.5, "A": 0.0})
        res.append((((d.elo_exp - score) ** 2).mean(), k, h, r, cw))
    res.sort()
    print("error   K   ventaja_casa  regresion  peso_pais")
    for e, k, h, r, cw in res[:10]:
        print(f"{e:.5f}  {k:<3} {h:<13} {r:<10} {cw}")


if __name__ == "__main__":
    main()
