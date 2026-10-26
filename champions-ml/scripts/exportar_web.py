"""Exporta el modelo entrenado a la página web (web/index.html).

La página no necesita servidor: lleva dentro los coeficientes del modelo y
el estado de cada equipo (Elo, forma...) y calcula la predicción en el móvil.

Uso (después de actualizar los datos):
    python scripts/exportar_web.py
"""

from __future__ import annotations

import json
import sys
import warnings
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
warnings.filterwarnings("ignore")

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from clml.features import FEATURES, KNOCKOUT, STAGE_ORDER, _nan0, load_all_matches  # noqa: E402
from clml.teams import team_id  # noqa: E402
from clml.models import metrics  # noqa: E402
from clml.predict import Predictor, parse_first_leg  # noqa: E402

WEB = ROOT / "web"
PLACEHOLDER = "/*__MODELO__*/null"
SCRIPT_PLACEHOLDER = "/*__PREDICCION_JS__*/"


def r(x, nd=6):
    return round(float(x), nd)


def export_model(P: Predictor) -> dict:
    assert list(P.model.models[0].features) == FEATURES == P.poisson.features
    logit_pipe = P.model.models[0].est
    sc, lr = logit_pipe[0], logit_pipe[-1]
    pois = P.poisson
    last_season = P.df.season.max()
    current = set(P.df.loc[P.df.season == last_season, "home"]) | set(
        P.df.loc[P.df.season == last_season, "away"])

    teams = {}
    for t in P.teams:
        c = P.fb.country_of[t]
        s = P.fb.team_snapshot(t, c)
        teams[t] = {
            "name": t.rsplit(" (", 1)[0], "country": c,
            "elo": r(s["elo_eu"], 4), "elo_all": r(s["elo"], 4),
            "form_ppg": r(_nan0(s["form_ppg"])), "form_gd": r(_nan0(s["form_gd"])),
            "dom_ppg": r(_nan0(s["dom_ppg"])), "dom_gd": r(_nan0(s["dom_gd"])),
            "ucl_exp": r(s["ucl_exp"]), "country_ppg": r(s["country_ppg"]),
            "recent": s["form_n"], "ucl_matches": P.fb.ucl_played[t], "current": t in current,
        }

    preds = pd.read_csv(ROOT / "reports" / "predicciones_test.csv")
    best = preds[preds.modelo == "Combinado (logística + Poisson)"]
    ev = metrics(best.result, best[["pH", "pD", "pA"]].values)

    return {
        "features": FEATURES,
        "home_adv": P.fb.eu.home_adv,
        "home_adv_all": P.fb.p.home_adv,
        "stage_order": STAGE_ORDER,
        "knockout": sorted(KNOCKOUT),
        "logit": {
            "classes": list(lr.classes_),
            "coef": [[r(v, 10) for v in row] for row in lr.coef_],
            "intercept": [r(v, 10) for v in lr.intercept_],
            "scaler": {"mean": [r(v, 10) for v in sc.mean_], "scale": [r(v, 10) for v in sc.scale_]},
        },
        "poisson": {
            "scaler": {"mean": [r(v, 10) for v in pois.scaler.mean_],
                       "scale": [r(v, 10) for v in pois.scaler.scale_]},
            "home": {"coef": [r(v, 10) for v in pois.mh.coef_], "intercept": r(pois.mh.intercept_, 10)},
            "away": {"coef": [r(v, 10) for v in pois.ma.coef_], "intercept": r(pois.ma.intercept_, 10)},
        },
        "teams": teams,
        "leagues": export_leagues(P, teams),
        "meta": {
            "last_date": P.last_date.isoformat(),
            "data_date": P.data_date.isoformat(),
            "last_season": last_season,
            "train_matches": int((P.df.season >= "2012-13").sum()),
            "test_matches": len(best),
            "test_first": best.season.min(), "test_last": best.season.max(),
            "test_accuracy": r(ev["acierto"], 4),
        },
    }


# Nombre de cada liga: (país, división) -> nombre. Las que no están se llaman "1.ª división".
LEAGUE_NAMES = {
    ("ENG", 1): "Premier League", ("ENG", 2): "Championship", ("ESP", 1): "LaLiga",
    ("ESP", 2): "Segunda División", ("GER", 1): "Bundesliga", ("GER", 2): "2. Bundesliga",
    ("ITA", 1): "Serie A", ("ITA", 2): "Serie B", ("FRA", 1): "Ligue 1", ("FRA", 2): "Ligue 2",
    ("NED", 1): "Eredivisie", ("POR", 1): "Primeira Liga", ("BEL", 1): "Pro League",
    ("TUR", 1): "Süper Lig", ("GRE", 1): "Super League (Grecia)", ("SCO", 1): "Premiership",
    ("AUT", 1): "Bundesliga (Austria)", ("SUI", 1): "Super League (Suiza)", ("DEN", 1): "Superliga",
    ("NOR", 1): "Eliteserien", ("SWE", 1): "Allsvenskan", ("POL", 1): "Ekstraklasa",
    ("ROU", 1): "Liga I", ("RUS", 1): "Liga Premier rusa", ("IRL", 1): "Premier Division (Irlanda)",
    ("FIN", 1): "Veikkausliiga", ("CZE", 1): "Chance Liga", ("CRO", 1): "HNL", ("SRB", 1): "SuperLiga (Serbia)",
    ("UKR", 1): "Liga Premier ucraniana", ("CYP", 1): "Primera División (Chipre)", ("HUN", 1): "NB I",
}


def export_leagues(P: Predictor, teams: dict) -> dict:
    """Equipos de la última temporada disponible de cada liga, con su Elo combinado."""
    seasons: dict[tuple, dict[str, set]] = {}
    last_date: dict[tuple, object] = {}
    for m in load_all_matches():
        if m.competition != "LIGA":
            continue
        key = (m.home_country, m.extra.get("division", 1))
        seasons.setdefault(key, {}).setdefault(m.season, set()).update(
            (team_id(m.home_country, m.home), team_id(m.away_country, m.away)))
        last_date[key] = max(last_date.get(key, m.date), m.date)
    out = {}
    for (country, div), by_season in seasons.items():
        season = max(by_season)
        members = [t for t in by_season[season] if t in P.fb.rating]
        if len(members) < 6:
            continue
        rows = sorted(({"id": t, "name": t.rsplit(" (", 1)[0], "elo": r(P.fb.elo(t), 1),
                        "europe": t in teams} for t in members), key=lambda x: -x["elo"])
        out[f"{country}-{div}"] = {
            "name": LEAGUE_NAMES.get((country, div), "1.ª división" if div == 1 else f"{div}.ª división"),
            "country": country, "division": div, "season": season,
            "last_date": last_date[(country, div)].isoformat(),
            "avg_elo": r(float(np.mean([x["elo"] for x in rows])), 1),
            "teams": rows,
        }
    for key, lg in out.items():
        for row in lg["teams"]:
            if row["europe"]:
                teams[row["id"]]["league"] = key
    return out


def parity_cases(P: Predictor) -> list[dict]:
    cases = [("Real Madrid", "Bayern", False, "league", None),
             ("psg", "arsenal", True, "final", None),
             ("barcelona", "inter", False, "semifinal", "3-1"),
             ("Bodø/Glimt", "man city", False, "league", None),
             ("Kairat", "Liverpool", False, "league", None)]
    out = []
    for h, a, n, st, ida in cases:
        p = P.predict(h, a, neutral=n, stage=st, first_leg_gd=parse_first_leg(ida))
        out.append({"home": p.home, "away": p.away, "neutral": n, "stage": st,
                    "firstLegGd": parse_first_leg(ida),
                    "expected": [p.p_home, p.p_draw, p.p_away, p.xg_home, p.xg_away]})
    return out


def main() -> None:
    P = Predictor()
    model = export_model(P)
    data = json.dumps(model, ensure_ascii=False, separators=(",", ":"))
    tpl = (WEB / "plantilla.html").read_text(encoding="utf-8")
    js = (WEB / "prediccion.js").read_text(encoding="utf-8")
    assert PLACEHOLDER in tpl and SCRIPT_PLACEHOLDER in tpl
    html = tpl.replace(SCRIPT_PLACEHOLDER, js).replace(PLACEHOLDER, data)
    (WEB / "index.html").write_text(html, encoding="utf-8")
    (WEB / "modelo.json").write_text(data, encoding="utf-8")
    (WEB / "paridad.json").write_text(json.dumps(parity_cases(P), ensure_ascii=False, indent=1),
                                      encoding="utf-8")
    print(f"web/index.html: {len(html) // 1024} KB, {len(model['teams'])} equipos, "
          f"datos hasta {model['meta']['last_date']}")


if __name__ == "__main__":
    main()
