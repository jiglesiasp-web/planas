"""Predicción de partidos futuros con el estado más reciente de los datos."""

from __future__ import annotations

import warnings
from dataclasses import dataclass

import pandas as pd

from .features import build_dataset, swap_sides
from .models import combined, predict_proba
from .teams import find_team


@dataclass
class Prediction:
    home: str
    away: str
    p_home: float
    p_draw: float
    p_away: float
    xg_home: float
    xg_away: float
    top_scores: list[tuple[str, float]]
    elo_home: float
    elo_away: float


class Predictor:
    """Entrena el modelo combinado con todas las temporadas y predice partidos nuevos.

    Tarda un par de segundos: lee los datos, calcula el Elo y entrena desde cero.
    Así no hace falta guardar modelos en disco.
    """

    def __init__(self, first_train: str = "2012-13"):
        warnings.filterwarnings("ignore", category=RuntimeWarning)
        self.df, self.fb = build_dataset()
        train = self.df[self.df.season >= first_train]
        self.model = combined().fit(train)
        self.poisson = self.model.models[1]
        self.last_date = self.df["date"].max()          # último partido de Champions
        self.data_date = self.fb.last_match_date        # último partido de cualquier competición
        # Solo se pueden elegir equipos con historial europeo (el modelo usa su Elo europeo).
        self.teams = sorted(self.fb.eu.rating)

    def team(self, query: str) -> str:
        return find_team(query, self.teams)

    def predict(self, home: str, away: str, neutral: bool = False, stage: str = "league",
                first_leg_gd: float | None = None) -> Prediction:
        h, a = self.team(home), self.team(away)
        if h == a:
            raise ValueError("El local y el visitante son el mismo equipo.")
        feats = self.fb.features_for(h, a, neutral=neutral, stage=stage, first_leg_gd=first_leg_gd)
        row = pd.DataFrame([feats])
        ph, pd_, pa = predict_proba(self.model, row)[0]
        lh, la = (float(x[0]) for x in self.poisson.expected_goals(row))
        if neutral:  # mismo criterio: promediar con los equipos intercambiados
            sa, sh = (float(x[0]) for x in self.poisson.expected_goals(swap_sides(row)))
            lh, la = (lh + sh) / 2, (la + sa) / 2
        mat = self.poisson.score_matrix(lh, la)
        flat = [(f"{i}-{j}", float(mat[i, j])) for i in range(6) for j in range(6)]
        flat.sort(key=lambda x: -x[1])
        return Prediction(h, a, float(ph), float(pd_), float(pa), lh, la, flat[:5],
                          self.fb.elo(h), self.fb.elo(a))

    def ranking(self, n: int = 20, min_matches: int = 6) -> pd.DataFrame:
        """Ranking Elo (Europa + ligas) de equipos con al menos `min_matches` partidos europeos recientes."""
        rows = [(t, self.fb.elo(t), len(self.fb.form[t])) for t in self.fb.eu.rating]
        df = pd.DataFrame(rows, columns=["equipo", "elo", "partidos_recientes"])
        df = df[df.partidos_recientes >= min_matches].sort_values("elo", ascending=False)
        df["elo"] = df["elo"].round().astype(int)
        return df.head(n).reset_index(drop=True)[["equipo", "elo"]]


def format_prediction(p: Prediction) -> str:
    bar = lambda x: "█" * round(x * 30)
    lines = [
        f"{p.home}  vs  {p.away}",
        f"  Elo (Europa + ligas): {p.elo_home:.0f} vs {p.elo_away:.0f}",
        "",
        f"  Gana local     {p.p_home:6.1%}  {bar(p.p_home)}",
        f"  Empate         {p.p_draw:6.1%}  {bar(p.p_draw)}",
        f"  Gana visitante {p.p_away:6.1%}  {bar(p.p_away)}",
        "",
        f"  Goles esperados: {p.xg_home:.2f} - {p.xg_away:.2f}",
        "  Marcadores más probables: " + ", ".join(f"{s} ({q:.0%})" for s, q in p.top_scores),
    ]
    return "\n".join(lines)


def parse_first_leg(text: str | None) -> float | None:
    """'2-1' (resultado de la ida, con el local de la ida primero) -> ventaja del local de hoy.

    En la ida jugó en casa el visitante de hoy, así que 2-1 significa que el
    local de hoy perdió la ida por 1 gol: devuelve -1.
    """
    if not text:
        return None
    a, b = (int(x) for x in text.replace(":", "-").split("-"))
    return float(b - a)


def probabilities_table(preds: list[Prediction]) -> pd.DataFrame:
    return pd.DataFrame([{
        "local": p.home, "visitante": p.away,
        "1": round(p.p_home, 3), "X": round(p.p_draw, 3), "2": round(p.p_away, 3),
        "goles_local": round(p.xg_home, 2), "goles_visitante": round(p.xg_away, 2),
        "marcador_mas_probable": p.top_scores[0][0],
    } for p in preds])

