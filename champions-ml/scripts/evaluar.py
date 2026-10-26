"""Evalúa los modelos temporada a temporada y escribe un informe.

Para cada temporada de prueba (2017-18 a la última) se entrena SOLO con las
temporadas anteriores y se predice esa temporada, como si fuera en directo.

Uso:
    python scripts/evaluar.py
"""

from __future__ import annotations

import sys
import warnings
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
warnings.filterwarnings("ignore")

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from clml.features import build_dataset  # noqa: E402
from clml.models import (AlwaysHome, all_models, combined_europe_only, metrics,  # noqa: E402
                         walk_forward)

REPORTS = ROOT / "reports"


def main() -> None:
    df, _ = build_dataset()
    # Solo temporadas completas: la temporada en curso (Wikipedia) no entra en la prueba.
    from clml.wikipedia import SEASON as CURRENT
    seasons = sorted(s for s in df.season.unique() if "2017-18" <= s < CURRENT)
    res, preds = walk_forward(df, seasons,
                              make_models=lambda: [AlwaysHome(), combined_europe_only()] + all_models())

    total = (preds.groupby("modelo")
             .apply(lambda g: pd.Series(metrics(g.result, g[["pH", "pD", "pA"]].values)))
             .sort_values("log_loss"))
    best = "Combinado (logística + Poisson)"  # el modelo que usa la app
    by_season = res.pivot(index="temporada", columns="modelo", values="acierto")

    bp = preds[preds.modelo == best].copy()
    bp["pmax"] = bp[["pH", "pD", "pA"]].max(axis=1)
    bp["pred"] = np.array(["H", "D", "A"])[bp[["pH", "pD", "pA"]].values.argmax(axis=1)]
    bp["ok"] = bp.pred == bp.result
    bins = pd.cut(bp.pmax, [0, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0])
    calib = bp.groupby(bins, observed=True).agg(partidos=("ok", "size"),
                                                prob_media=("pmax", "mean"),
                                                acierto_real=("ok", "mean"))

    # Calibración por resultado: probabilidad media predicha frente a frecuencia real.
    freq = pd.DataFrame({
        "prob_media_predicha": bp[["pH", "pD", "pA"]].mean().values,
        "frecuencia_real": [(bp.result == c).mean() for c in "HDA"],
    }, index=["Gana local", "Empate", "Gana visitante"])

    REPORTS.mkdir(exist_ok=True)
    preds.to_csv(REPORTS / "predicciones_test.csv", index=False)

    n = int(res[res.modelo == best].partidos.sum())
    md = [
        "# Evaluación de los modelos",
        "",
        f"Prueba: {n} partidos de Champions de {seasons[0]} a {seasons[-1]}. Cada temporada se "
        "predice con un modelo entrenado solo con las temporadas anteriores.",
        "",
        "Métricas: **acierto** (más alto, mejor); **log loss**, **Brier** y **RPS** miden la calidad "
        "de las probabilidades (más bajo, mejor).",
        "",
        "Todos los modelos usan Europa + ligas + copas salvo el marcado como \"versión anterior\".",
        "",
        "## Resultado global",
        "",
        _md_table(total, pct=["acierto"]),
        "",
        f"## Acierto por temporada",
        "",
        _md_table(by_season[[c for c in total.index if c in by_season.columns]], pct=list(by_season.columns)),
        "",
        f"## ¿Son fiables las probabilidades? (modelo: {best})",
        "",
        "Partidos agrupados según la probabilidad del resultado favorito. Si el modelo está bien "
        "calibrado, `prob_media` y `acierto_real` deben parecerse.",
        "",
        _md_table(calib, pct=["prob_media", "acierto_real"]),
        "",
        _md_table(freq, pct=list(freq.columns)),
        "",
        f"El modelo eligió el empate como resultado más probable en {int((bp.pred == 'D').sum())} "
        f"de {len(bp)} partidos; hubo {int((bp.result == 'D').sum())} empates.",
        "",
    ]
    (REPORTS / "evaluacion.md").write_text("\n".join(md), encoding="utf-8")

    pd.set_option("display.width", 140)
    print(total.round(4).to_string())
    print()
    print(calib.round(3).to_string())
    print(f"\nInforme: {REPORTS / 'evaluacion.md'}")


def _md_table(df: pd.DataFrame, pct: list[str] = ()) -> str:
    df = df.copy()
    for c in df.columns:
        if c in pct:
            df[c] = df[c].map(lambda x: f"{x:.1%}")
        elif pd.api.types.is_float_dtype(df[c]):
            df[c] = df[c].map(lambda x: f"{x:.4f}")
    cols = [df.index.name or ""] + [str(c) for c in df.columns]
    lines = ["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
    for idx, row in df.iterrows():
        lines.append("| " + " | ".join([str(idx)] + [str(v) for v in row.values]) + " |")
    return "\n".join(lines)


if __name__ == "__main__":
    main()
