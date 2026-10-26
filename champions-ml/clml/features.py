"""Construcción de variables (features) partido a partido.

Todo se calcula en orden cronológico y usando SOLO información anterior a
cada partido, para que el modelo nunca vea el futuro (sin "data leakage").

Fuentes de información para cada equipo:
  - Rating Elo calculado con todos los partidos europeos disponibles
    (Champions, Europa League, Conference y fases previas).
  - Forma reciente en Europa (últimos partidos).
  - Fuerza del país: rendimiento de sus clubes en Europa en temporadas previas.
  - Experiencia: partidos de Champions jugados antes.
  - Contexto: fase, campo neutral, ida/vuelta y resultado de la ida.
"""

from __future__ import annotations

import glob
import math
from collections import defaultdict, deque
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from .parse import Match, parse_file
from .teams import canonical, team_id

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

STAGE_ORDER = {"qualifying": 0, "group": 1, "league": 1, "knockout_playoff": 2,
               "round_of_32": 2, "round_of_16": 3, "quarterfinal": 4,
               "semifinal": 5, "final": 6}
KNOCKOUT = {"knockout_playoff", "round_of_32", "round_of_16", "quarterfinal",
            "semifinal", "final"}


@dataclass
class EloParams:
    k: float = 35.0            # velocidad de actualización
    home_adv: float = 80.0     # ventaja de jugar en casa (puntos Elo)
    season_regress: float = 0.0  # cuánto vuelve cada equipo a la media entre temporadas
    base: float = 1500.0
    # Rating inicial de un equipo nuevo según la competición en la que aparece.
    start_offset = {"UCL": 0.0, "UEL": -60.0, "UECL": -120.0}
    quali_offset: float = -80.0
    country_weight: float = 0.6  # peso de la media de su país al iniciar


def load_matches(raw_dir: Path | None = None) -> list[Match]:
    raw_dir = Path(raw_dir or DATA_DIR / "raw")
    matches: list[Match] = []
    for f in sorted(glob.glob(str(raw_dir / "*" / "*.txt"))):
        matches.extend(parse_file(f))
    for m in matches:
        m.home_country, m.home = canonical(m.home_country, m.home)
        m.away_country, m.away = canonical(m.away_country, m.away)
    # Orden cronológico estable: fecha y, en el mismo día, el orden del fichero.
    matches = [m for m in matches if m.played]
    matches.sort(key=lambda m: m.date)
    return matches


def _goal_mult(gd: int) -> float:
    gd = abs(gd)
    if gd <= 1:
        return 1.0
    if gd == 2:
        return 1.5
    return (11 + gd) / 8


def expected_home(r_home: float, r_away: float, neutral: bool, home_adv: float) -> float:
    diff = r_home - r_away + (0.0 if neutral else home_adv)
    return 1.0 / (1.0 + 10 ** (-diff / 400))


class FeatureBuilder:
    """Recorre los partidos en orden y guarda el estado de cada equipo."""

    def __init__(self, params: EloParams | None = None, form_window: int = 6):
        self.p = params or EloParams()
        self.form_window = form_window
        self.rating: dict[str, float] = {}
        self.country_of: dict[str, str] = {}
        self.form: dict[str, deque] = defaultdict(lambda: deque(maxlen=form_window))
        self.ucl_played: dict[str, int] = defaultdict(int)
        self.last_date: dict[str, object] = {}
        # Puntos por partido de cada país, por temporada: {season: {país: [pts, n]}}
        self.country_season: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(lambda: [0.0, 0]))
        self.season_order: list[str] = []
        self.current_season: str | None = None
        self.first_legs: dict[tuple, tuple] = {}

    # ---------- estado ----------
    def _new_season(self, season: str) -> None:
        if self.current_season is not None:
            mean = np.mean(list(self.rating.values())) if self.rating else self.p.base
            for t in self.rating:
                self.rating[t] += self.p.season_regress * (mean - self.rating[t])
        self.current_season = season
        if season not in self.season_order:
            self.season_order.append(season)

    def _init_rating(self, team: str, country: str, m: Match) -> float:
        if team in self.rating:
            return self.rating[team]
        start = self.p.base + self.p.start_offset[m.competition]
        if m.qualifying:
            start += self.p.quali_offset
        peers = [r for t, r in self.rating.items() if self.country_of.get(t) == country]
        if peers:
            start = (1 - self.p.country_weight) * start + self.p.country_weight * float(np.mean(peers))
        self.rating[team] = start
        self.country_of[team] = country
        return start

    def country_strength(self, country: str, n_seasons: int = 3) -> tuple[float, int]:
        """Puntos por partido del país en las n temporadas anteriores (no la actual)."""
        past = [s for s in self.season_order if s != self.current_season][-n_seasons:]
        pts = sum(self.country_season[s][country][0] for s in past)
        n = sum(self.country_season[s][country][1] for s in past)
        # Suavizado hacia 1.35 pts/partido (media aproximada) con 10 partidos ficticios.
        return (pts + 1.35 * 10) / (n + 10), n

    def team_snapshot(self, team: str, country: str) -> dict:
        form = list(self.form[team])
        return {
            "elo": self.rating.get(team, np.nan),
            "form_ppg": np.mean([f[0] for f in form]) if form else np.nan,
            "form_gd": np.mean([f[1] for f in form]) if form else np.nan,
            "form_n": len(form),
            "ucl_exp": math.log1p(self.ucl_played[team]),
            "country_ppg": self.country_strength(country)[0],
        }

    # ---------- bucle principal ----------
    def run(self, matches: list[Match]) -> pd.DataFrame:
        rows = []
        for m in matches:
            if m.season != self.current_season and (
                    self.current_season is None or m.season > self.current_season):
                self._new_season(m.season)
            h = team_id(m.home_country, m.home)
            a = team_id(m.away_country, m.away)
            rh = self._init_rating(h, m.home_country, m)
            ra = self._init_rating(a, m.away_country, m)

            if m.competition == "UCL" and not m.qualifying:
                rows.append(self._row(m, h, a))

            self._update(m, h, a, rh, ra)
        return pd.DataFrame(rows)

    def features_for(self, home: str, away: str, neutral: bool = False,
                     stage: str = "league", first_leg_gd: float | None = None) -> dict:
        """Variables para un partido futuro con el estado actual (tras el último dato)."""
        hc = self.country_of[home]
        ac = self.country_of[away]
        sh = self.team_snapshot(home, hc)
        sa = self.team_snapshot(away, ac)
        return self._combine(sh, sa, neutral, stage, first_leg_gd)

    def _row(self, m: Match, h: str, a: str) -> dict:
        key = (m.competition, m.season, m.stage, frozenset((h, a)))
        first_leg_gd = None
        if m.stage in KNOCKOUT and key in self.first_legs:
            fl_home, fl_hg, fl_ag = self.first_legs[key]
            # Diferencia de goles de la ida desde el punto de vista del local de hoy.
            first_leg_gd = (fl_hg - fl_ag) if fl_home == h else (fl_ag - fl_hg)
        sh = self.team_snapshot(h, m.home_country)
        sa = self.team_snapshot(a, m.away_country)
        row = {
            "date": m.date, "season": m.season, "stage": m.stage,
            "home": h, "away": a,
            "home_goals": m.home_goals, "away_goals": m.away_goals,
            "result": "H" if m.home_goals > m.away_goals else ("A" if m.home_goals < m.away_goals else "D"),
        }
        row.update(self._combine(sh, sa, m.neutral, m.stage, first_leg_gd))
        return row

    def _combine(self, sh: dict, sa: dict, neutral: bool, stage: str,
                 first_leg_gd: float | None) -> dict:
        exp = expected_home(sh["elo"], sa["elo"], neutral, self.p.home_adv)
        return {
            "elo_home": sh["elo"], "elo_away": sa["elo"],
            "elo_diff": sh["elo"] - sa["elo"],
            "elo_exp": exp,
            "neutral": int(neutral),
            "stage_level": STAGE_ORDER.get(stage, 1),
            "knockout": int(stage in KNOCKOUT),
            "second_leg": int(first_leg_gd is not None),
            "first_leg_gd": float(first_leg_gd or 0.0),
            "form_ppg_diff": _nan0(sh["form_ppg"]) - _nan0(sa["form_ppg"]),
            "form_gd_diff": _nan0(sh["form_gd"]) - _nan0(sa["form_gd"]),
            "ucl_exp_home": sh["ucl_exp"], "ucl_exp_away": sa["ucl_exp"],
            "country_ppg_home": sh["country_ppg"], "country_ppg_away": sa["country_ppg"],
        }

    def _update(self, m: Match, h: str, a: str, rh: float, ra: float) -> None:
        exp = expected_home(rh, ra, m.neutral, self.p.home_adv)
        gd = m.home_goals - m.away_goals
        score = 1.0 if gd > 0 else (0.0 if gd < 0 else 0.5)
        delta = self.p.k * _goal_mult(gd) * (score - exp)
        self.rating[h] = rh + delta
        self.rating[a] = ra - delta

        ph = 3 if gd > 0 else (1 if gd == 0 else 0)
        pa = 3 if gd < 0 else (1 if gd == 0 else 0)
        self.form[h].append((ph, gd))
        self.form[a].append((pa, -gd))
        if m.competition == "UCL" and not m.qualifying:
            self.ucl_played[h] += 1
            self.ucl_played[a] += 1
        cs = self.country_season[m.season]
        if m.home_country != m.away_country:
            cs[m.home_country][0] += ph
            cs[m.home_country][1] += 1
            cs[m.away_country][0] += pa
            cs[m.away_country][1] += 1
        if m.stage in KNOCKOUT and m.stage != "final" and not m.neutral:
            key = (m.competition, m.season, m.stage, frozenset((h, a)))
            self.first_legs.setdefault(key, (h, m.home_goals, m.away_goals))


def _nan0(x: float) -> float:
    return 0.0 if x is None or (isinstance(x, float) and math.isnan(x)) else x


FEATURES = ["elo_diff", "elo_exp", "elo_home", "elo_away", "neutral",
            "stage_level", "knockout", "second_leg", "first_leg_gd",
            "form_ppg_diff", "form_gd_diff", "ucl_exp_home", "ucl_exp_away",
            "country_ppg_home", "country_ppg_away"]


def build_dataset(params: EloParams | None = None) -> tuple[pd.DataFrame, FeatureBuilder]:
    fb = FeatureBuilder(params)
    df = fb.run(load_matches())
    return df, fb


def swap_sides(df: pd.DataFrame) -> pd.DataFrame:
    """Intercambia local y visitante en las variables (para partidos en campo neutral)."""
    s = df.copy()
    s["elo_home"], s["elo_away"] = df["elo_away"], df["elo_home"]
    s["elo_diff"] = -df["elo_diff"]
    s["elo_exp"] = 1 - df["elo_exp"]
    s["first_leg_gd"] = -df["first_leg_gd"]
    s["form_ppg_diff"] = -df["form_ppg_diff"]
    s["form_gd_diff"] = -df["form_gd_diff"]
    s["ucl_exp_home"], s["ucl_exp_away"] = df["ucl_exp_away"], df["ucl_exp_home"]
    s["country_ppg_home"], s["country_ppg_away"] = df["country_ppg_away"], df["country_ppg_home"]
    return s
