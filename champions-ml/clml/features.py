"""Construcción de variables (features) partido a partido.

Todo se calcula en orden cronológico y usando SOLO información anterior a
cada partido, para que el modelo nunca vea el futuro (sin "data leakage").

Fuentes de información para cada equipo:
  - Rating Elo calculado con TODOS los partidos disponibles: Champions,
    Europa League, Conference, fases previas, ligas nacionales (1.ª y, en
    las cinco grandes, 2.ª división) y copas nacionales.
    El Elo de un equipo = su nivel dentro de su país + el nivel del país.
    Los partidos nacionales mueven solo lo primero; los europeos, ambas
    cosas. Así una liga débil no infla a su campeón.
  - Forma reciente en Europa y forma reciente en su liga.
  - Días de descanso desde su último partido.
  - Fuerza del país: rendimiento de sus clubes en Europa en temporadas previas.
  - Experiencia: partidos de Champions jugados antes.
  - Contexto: fase, campo neutral, ida/vuelta y resultado de la ida.
"""

from __future__ import annotations

import glob
import math
from collections import defaultdict, deque
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

from .parse import Match, parse_file
from .teams import canonical, resolve_domestic_names, team_id

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

STAGE_ORDER = {"qualifying": 0, "group": 1, "league": 1, "knockout_playoff": 2,
               "round_of_32": 2, "round_of_16": 3, "quarterfinal": 4,
               "semifinal": 5, "final": 6}
KNOCKOUT = {"knockout_playoff", "round_of_32", "round_of_16", "quarterfinal",
            "semifinal", "final"}
EUROPEAN = {"UCL", "UEL", "UECL"}


@dataclass
class EloParams:
    # Valores ajustados con las temporadas 2012-13 a 2016-17 (scripts/ajustar_elo.py).
    k: float = 25.0              # velocidad de actualización en Europa
    k_dom: float = 20.0          # velocidad de actualización en ligas y copas
    home_adv: float = 100.0      # ventaja de campo en Europa (puntos Elo)
    home_adv_dom: float = 40.0   # ventaja de campo en ligas y copas
    season_regress: float = 0.0  # cuánto vuelve cada equipo a la media entre temporadas
    base: float = 1500.0
    # Rating inicial de un equipo nuevo según la competición en la que aparece.
    start_offset: dict = field(default_factory=lambda: {
        "UCL": 0.0, "UEL": -60.0, "UECL": -120.0, "LIGA": -100.0, "COPA": -150.0})
    quali_offset: float = -80.0
    country_weight: float = 0.6  # peso de la media de su país al iniciar (equipos europeos)
    newcomer_offset: float = -60.0  # equipo nuevo en una liga (p. ej. recién ascendido)
    div2_gap: float = 150.0      # diferencia inicial entre 1.ª y 2.ª división
    k_league: float = 25.0       # cuánto mueve un partido europeo el nivel de toda la liga del país
    warmup_passes: int = 3       # veces que se repite la temporada 2011-12 al empezar


def load_matches(raw_dir: Path | None = None) -> list[Match]:
    """Solo competiciones europeas (data/raw)."""
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


def load_all_matches(domestic: bool = True) -> list[Match]:
    """Partidos europeos y, si `domestic`, también ligas y copas nacionales."""
    eu = load_matches()
    if not domestic:
        return eu
    from .domestic import FD_DIR, load_football_data, load_openfootball_domestic
    if not list(FD_DIR.glob("*.csv")):
        raise FileNotFoundError(
            "Faltan los datos de ligas nacionales. Descárgalos con: python scripts/descargar_datos.py")
    dom = load_football_data() + load_openfootball_domestic()
    resolve_domestic_names(eu, dom)
    allm = [m for m in eu + dom if m.played and m.home != m.away]
    allm.sort(key=lambda m: m.date)
    return allm


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


class EloEuropa:
    """Elo calculado solo con partidos europeos (el del modelo original)."""

    def __init__(self, k: float = 35.0, home_adv: float = 80.0, base: float = 1500.0,
                 country_weight: float = 0.6, quali_offset: float = -80.0):
        self.k, self.home_adv, self.base = k, home_adv, base
        self.country_weight, self.quali_offset = country_weight, quali_offset
        self.start_offset = {"UCL": 0.0, "UEL": -60.0, "UECL": -120.0}
        self.rating: dict[str, float] = {}
        self.country_of: dict[str, str] = {}

    def ensure(self, team: str, country: str, m: Match) -> float:
        if team not in self.rating:
            start = self.base + self.start_offset[m.competition] + (self.quali_offset if m.qualifying else 0.0)
            peers = [r for t, r in self.rating.items() if self.country_of.get(t) == country]
            if peers:
                start = (1 - self.country_weight) * start + self.country_weight * float(np.mean(peers))
            self.rating[team] = start
            self.country_of[team] = country
        return self.rating[team]

    def update(self, m: Match, h: str, a: str) -> None:
        exp = expected_home(self.rating[h], self.rating[a], m.neutral, self.home_adv)
        gd = m.home_goals - m.away_goals
        score = 1.0 if gd > 0 else (0.0 if gd < 0 else 0.5)
        d = self.k * _goal_mult(gd) * (score - exp)
        self.rating[h] += d
        self.rating[a] -= d


class FeatureBuilder:
    """Recorre los partidos en orden y guarda el estado de cada equipo."""

    def __init__(self, params: EloParams | None = None, form_window: int = 6,
                 emit_competitions: tuple = ("UCL",)):
        self.p = params or EloParams()
        self.emit_competitions = emit_competitions  # de qué competiciones se generan filas
        self.form_window = form_window
        self.eu = EloEuropa()                 # Elo solo con partidos europeos
        self.rating: dict[str, float] = {}   # nivel del equipo dentro de su país
        self.league_off: dict[str, float] = defaultdict(float)  # nivel de cada país
        self.country_of: dict[str, str] = {}
        self.division: dict[str, int] = {}
        self.form: dict[str, deque] = defaultdict(lambda: deque(maxlen=form_window))
        self.dom_form: dict[str, deque] = defaultdict(lambda: deque(maxlen=form_window))
        self.ucl_played: dict[str, int] = defaultdict(int)
        self.last_date: dict[str, object] = {}
        # Puntos por partido de cada país en Europa, por temporada: {season: {país: [pts, n]}}
        self.country_season: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(lambda: [0.0, 0]))
        self.season_order: list[str] = []
        self.current_season: str | None = None
        self.first_legs: dict[tuple, tuple] = {}
        self.last_match_date = None

    # ---------- estado ----------
    def elo(self, team: str) -> float:
        """Elo efectivo: nivel del equipo + nivel de su país."""
        return self.rating[team] + self.league_off[self.country_of[team]]

    def _new_season(self, season: str) -> None:
        if self.current_season is not None and self.p.season_regress:
            mean = np.mean(list(self.rating.values())) if self.rating else self.p.base
            for t in self.rating:
                self.rating[t] += self.p.season_regress * (mean - self.rating[t])
        self.current_season = season
        if season not in self.season_order:
            self.season_order.append(season)

    def _init_rating(self, team: str, country: str, m: Match) -> float:
        if team in self.rating:
            return self.elo(team)
        p = self.p
        if m.competition in EUROPEAN:
            start = (p.base + self.league_off[country] + p.start_offset[m.competition]
                     + (p.quali_offset if m.qualifying else 0.0))
            peers = [self.elo(t) for t in self.rating if self.country_of.get(t) == country]
            if peers:
                start = (1 - p.country_weight) * start + p.country_weight * float(np.mean(peers))
        else:
            div = m.extra.get("division", 1)
            same_div = [self.elo(t) for t in self.rating
                        if self.country_of.get(t) == country and self.division.get(t) == div]
            any_div = [self.elo(t) for t in self.rating if self.country_of.get(t) == country]
            if same_div:
                start = float(np.mean(same_div)) + p.newcomer_offset
            elif any_div:
                start = float(np.mean(any_div)) - p.div2_gap * (div - 1) + p.newcomer_offset
            else:
                start = (p.base + self.league_off[country] + p.start_offset[m.competition]
                         - p.div2_gap * (div - 1))
        # `start` está en Elo efectivo; se guarda el nivel relativo a su país.
        self.country_of[team] = country
        self.rating[team] = start - self.league_off[country]
        return start

    def country_strength(self, country: str, n_seasons: int = 3) -> tuple[float, int]:
        """Puntos por partido del país en Europa en las n temporadas anteriores (no la actual)."""
        past = [s for s in self.season_order if s != self.current_season][-n_seasons:]
        pts = sum(self.country_season[s][country][0] for s in past)
        n = sum(self.country_season[s][country][1] for s in past)
        # Suavizado hacia 1.35 pts/partido (media aproximada) con 10 partidos ficticios.
        return (pts + 1.35 * 10) / (n + 10), n

    def team_snapshot(self, team: str, country: str, date=None) -> dict:
        form = list(self.form[team])
        dform = list(self.dom_form[team])
        last = self.last_date.get(team)
        rest = min((date - last).days, 14) if (date is not None and last is not None) else 7
        return {
            "elo": self.elo(team) if team in self.rating else np.nan,
            "elo_eu": self.eu.rating.get(team, np.nan),
            "form_ppg": np.mean([f[0] for f in form]) if form else np.nan,
            "form_gd": np.mean([f[1] for f in form]) if form else np.nan,
            "form_n": len(form),
            "dom_ppg": np.mean([f[0] for f in dform]) if dform else np.nan,
            "dom_gd": np.mean([f[1] for f in dform]) if dform else np.nan,
            "dom_n": len(dform),
            "rest": rest,
            "ucl_exp": math.log1p(self.ucl_played[team]),
            "country_ppg": self.country_strength(country)[0],
        }

    # ---------- bucle principal ----------
    def warm_up(self, matches: list[Match], until=None, passes: int | None = None) -> None:
        """Repite la primera temporada varias veces para que los niveles de
        equipos y países se asienten antes de empezar (al principio todas las
        ligas parten del mismo nivel). Solo usa partidos anteriores a `until`
        (julio de 2012), que no se usan ni para entrenar ni para evaluar.
        Después se borra todo menos el Elo."""
        import datetime as dt
        until = until or dt.date(2012, 7, 1)
        passes = self.p.warmup_passes if passes is None else passes
        first = [m for m in matches if m.date < until]
        for _ in range(passes):
            self.current_season = None
            self.season_order = []
            for m in first:
                self._step(m, emit=False)
        keep = (self.rating, self.league_off, self.country_of, self.division)
        self.__init__(self.p, self.form_window, self.emit_competitions)
        self.rating, self.league_off, self.country_of, self.division = keep

    def run(self, matches: list[Match]) -> pd.DataFrame:
        if self.p.warmup_passes and not self.rating:
            self.warm_up(matches)
        rows = []
        for m in matches:
            row = self._step(m, emit=True)
            if row is not None:
                rows.append(row)
        return pd.DataFrame(rows)

    def _step(self, m: Match, emit: bool):
        if True:
            if m.season != self.current_season and (
                    self.current_season is None or m.season > self.current_season):
                self._new_season(m.season)
            h = team_id(m.home_country, m.home)
            a = team_id(m.away_country, m.away)
            # Copas: solo partidos entre equipos ya conocidos (fuera amateurs sin historial).
            if m.competition == "COPA" and (h not in self.rating or a not in self.rating):
                return None
            rh = self._init_rating(h, m.home_country, m)
            ra = self._init_rating(a, m.away_country, m)
            if m.competition in EUROPEAN:
                self.eu.ensure(h, m.home_country, m)
                self.eu.ensure(a, m.away_country, m)
            row = None
            if emit and m.competition in self.emit_competitions and not m.qualifying:
                row = self._row(m, h, a)
            self._update(m, h, a, rh, ra)
            if m.competition in EUROPEAN:
                self.eu.update(m, h, a)
            self.last_match_date = m.date
            return row

    def features_for(self, home: str, away: str, neutral: bool = False,
                     stage: str = "league", first_leg_gd: float | None = None) -> dict:
        """Variables para un partido futuro con el estado actual (tras el último dato).

        Los días de descanso no se conocen de antemano: se suponen iguales.
        """
        sh = self.team_snapshot(home, self.country_of[home])
        sa = self.team_snapshot(away, self.country_of[away])
        return self._combine(sh, sa, neutral, stage, first_leg_gd)

    def _row(self, m: Match, h: str, a: str) -> dict:
        key = (m.competition, m.season, m.stage, frozenset((h, a)))
        first_leg_gd = None
        if m.stage in KNOCKOUT and key in self.first_legs:
            fl_home, fl_hg, fl_ag = self.first_legs[key]
            # Diferencia de goles de la ida desde el punto de vista del local de hoy.
            first_leg_gd = (fl_hg - fl_ag) if fl_home == h else (fl_ag - fl_hg)
        sh = self.team_snapshot(h, m.home_country, m.date)
        sa = self.team_snapshot(a, m.away_country, m.date)
        row = {
            "date": m.date, "season": m.season, "stage": m.stage, "competition": m.competition,
            "home": h, "away": a,
            "home_goals": m.home_goals, "away_goals": m.away_goals,
            "result": "H" if m.home_goals > m.away_goals else ("A" if m.home_goals < m.away_goals else "D"),
        }
        row.update(self._combine(sh, sa, m.neutral, m.stage, first_leg_gd))
        return row

    def _combine(self, sh: dict, sa: dict, neutral: bool, stage: str,
                 first_leg_gd: float | None) -> dict:
        exp = expected_home(sh["elo_eu"], sa["elo_eu"], neutral, self.eu.home_adv)
        exp_all = expected_home(sh["elo"], sa["elo"], neutral, self.p.home_adv)
        return {
            "elo_home": sh["elo_eu"], "elo_away": sa["elo_eu"],
            "elo_diff": sh["elo_eu"] - sa["elo_eu"],
            "elo_exp": exp,
            "elo_all_diff": sh["elo"] - sa["elo"],
            "elo_all_exp": exp_all,
            "neutral": int(neutral),
            "stage_level": STAGE_ORDER.get(stage, 1),
            "knockout": int(stage in KNOCKOUT),
            "second_leg": int(first_leg_gd is not None),
            "first_leg_gd": float(first_leg_gd or 0.0),
            "form_ppg_diff": _nan0(sh["form_ppg"]) - _nan0(sa["form_ppg"]),
            "form_gd_diff": _nan0(sh["form_gd"]) - _nan0(sa["form_gd"]),
            "dom_ppg_diff": _nan0(sh["dom_ppg"]) - _nan0(sa["dom_ppg"]),
            "dom_gd_diff": _nan0(sh["dom_gd"]) - _nan0(sa["dom_gd"]),
            "rest_diff": float(sh["rest"] - sa["rest"]),
            "ucl_exp_home": sh["ucl_exp"], "ucl_exp_away": sa["ucl_exp"],
            "country_ppg_home": sh["country_ppg"], "country_ppg_away": sa["country_ppg"],
        }

    def _update(self, m: Match, h: str, a: str, rh: float, ra: float) -> None:
        european = m.competition in EUROPEAN
        k = self.p.k if european else self.p.k_dom
        adv = self.p.home_adv if european else self.p.home_adv_dom
        exp = expected_home(rh, ra, m.neutral, adv)
        gd = m.home_goals - m.away_goals
        score = 1.0 if gd > 0 else (0.0 if gd < 0 else 0.5)
        surprise = _goal_mult(gd) * (score - exp)
        self.rating[h] += k * surprise
        self.rating[a] -= k * surprise
        if european and m.home_country != m.away_country:
            self.league_off[m.home_country] += self.p.k_league * surprise
            self.league_off[m.away_country] -= self.p.k_league * surprise
        self.last_date[h] = m.date
        self.last_date[a] = m.date

        ph = 3 if gd > 0 else (1 if gd == 0 else 0)
        pa = 3 if gd < 0 else (1 if gd == 0 else 0)
        if european:
            self.form[h].append((ph, gd))
            self.form[a].append((pa, -gd))
        elif m.competition == "LIGA":
            self.dom_form[h].append((ph, gd))
            self.dom_form[a].append((pa, -gd))
            div = m.extra.get("division", 1)
            self.division[h] = div
            self.division[a] = div
        if m.competition == "UCL" and not m.qualifying:
            self.ucl_played[h] += 1
            self.ucl_played[a] += 1
        if european and m.home_country != m.away_country:
            cs = self.country_season[m.season]
            cs[m.home_country][0] += ph
            cs[m.home_country][1] += 1
            cs[m.away_country][0] += pa
            cs[m.away_country][1] += 1
        if european and m.stage in KNOCKOUT and m.stage != "final" and not m.neutral:
            key = (m.competition, m.season, m.stage, frozenset((h, a)))
            self.first_legs.setdefault(key, (h, m.home_goals, m.away_goals))


def _nan0(x: float) -> float:
    return 0.0 if x is None or (isinstance(x, float) and math.isnan(x)) else x


# Variables del modelo solo con datos europeos (versión anterior, para comparar).
FEATURES_EU = ["elo_diff", "elo_exp", "elo_home", "elo_away", "neutral",
               "stage_level", "knockout", "second_leg", "first_leg_gd",
               "form_ppg_diff", "form_gd_diff", "ucl_exp_home", "ucl_exp_away",
               "country_ppg_home", "country_ppg_away"]
# Variables del modelo con ligas y copas nacionales.
FEATURES = FEATURES_EU + ["elo_all_diff", "elo_all_exp", "dom_ppg_diff", "dom_gd_diff", "rest_diff"]


def build_dataset(params: EloParams | None = None, domestic: bool = True
                  ) -> tuple[pd.DataFrame, FeatureBuilder]:
    fb = FeatureBuilder(params)
    df = fb.run(load_all_matches(domestic))
    return df, fb


def swap_sides(df: pd.DataFrame) -> pd.DataFrame:
    """Intercambia local y visitante en las variables (para partidos en campo neutral)."""
    s = df.copy()
    s["elo_home"], s["elo_away"] = df["elo_away"], df["elo_home"]
    s["elo_diff"] = -df["elo_diff"]
    s["elo_exp"] = 1 - df["elo_exp"]
    if "elo_all_diff" in df:
        s["elo_all_diff"] = -df["elo_all_diff"]
        s["elo_all_exp"] = 1 - df["elo_all_exp"]
    s["first_leg_gd"] = -df["first_leg_gd"]
    for c in ("form_ppg_diff", "form_gd_diff", "dom_ppg_diff", "dom_gd_diff", "rest_diff"):
        if c in df:
            s[c] = -df[c]
    s["ucl_exp_home"], s["ucl_exp_away"] = df["ucl_exp_away"], df["ucl_exp_home"]
    s["country_ppg_home"], s["country_ppg_away"] = df["country_ppg_away"], df["country_ppg_home"]
    return s
