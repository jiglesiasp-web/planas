"""Predice partidos de Champions.

Ejemplos:
    python scripts/predecir.py "Real Madrid" "Bayern"
    python scripts/predecir.py psg arsenal --neutral --fase final
    python scripts/predecir.py barcelona inter --fase semifinal --ida 3-1
    python scripts/predecir.py --partidos jornada.csv      # CSV con columnas local,visitante
    python scripts/predecir.py --ranking

--ida: resultado del partido de ida tal como se escribe (el local de la ida
primero). En la ida jugaba en casa el visitante de hoy.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import pandas as pd  # noqa: E402

from clml.predict import (Predictor, format_prediction, parse_first_leg,  # noqa: E402
                          probabilities_table)

STAGES = ["league", "group", "knockout_playoff", "round_of_16", "quarterfinal", "semifinal", "final"]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Predicción de partidos de la Champions League")
    ap.add_argument("local", nargs="?")
    ap.add_argument("visitante", nargs="?")
    ap.add_argument("--neutral", action="store_true", help="campo neutral (p. ej. la final)")
    ap.add_argument("--fase", default="league", choices=STAGES)
    ap.add_argument("--ida", help="resultado de la ida, p. ej. 2-1 (local de la ida primero)")
    ap.add_argument("--partidos", help="CSV con columnas local,visitante[,neutral,fase,ida]")
    ap.add_argument("--ranking", action="store_true", help="muestra el ranking Elo actual")
    args = ap.parse_args(argv)

    P = Predictor()
    print(f"(Champions hasta {P.last_date:%d/%m/%Y}; ligas y copas hasta {P.data_date:%d/%m/%Y})\n")

    if args.ranking:
        print(P.ranking(25).to_string())
        return 0

    try:
        if args.partidos:
            fx = pd.read_csv(args.partidos, dtype=str, keep_default_na=False)
            preds = []
            for d in fx.to_dict("records"):
                neutral = d.get("neutral", "").strip().lower() in {"1", "true", "si", "sí", "yes"}
                stage = d.get("fase", "").strip() or "league"
                if stage not in STAGES:
                    raise ValueError(f"Fase desconocida '{stage}'. Opciones: {', '.join(STAGES)}")
                preds.append(P.predict(d["local"], d["visitante"], neutral=neutral, stage=stage,
                                       first_leg_gd=parse_first_leg(d.get("ida", "").strip() or None)))
            print(probabilities_table(preds).to_string(index=False))
            return 0
        if not (args.local and args.visitante):
            ap.error("indica local y visitante, --partidos o --ranking")
        p = P.predict(args.local, args.visitante, neutral=args.neutral, stage=args.fase,
                      first_leg_gd=parse_first_leg(args.ida))
    except ValueError as e:
        print(f"Error: {e}")
        return 1
    print(format_prediction(p))
    return 0


if __name__ == "__main__":
    sys.exit(main())
