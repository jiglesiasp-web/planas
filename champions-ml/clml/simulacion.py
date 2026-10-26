"""Simulación Monte Carlo de la Champions en curso.

Se juega muchas veces lo que queda de temporada con las probabilidades del
modelo y se cuenta cuántas veces cada equipo pasa cada ronda.

Formato (UEFA, desde 2024-25):
  - Fase de liga: 36 equipos, 8 partidos cada uno, una sola clasificación.
    Desempate: puntos, diferencia de goles, goles a favor, goles fuera,
    victorias y, si sigue igual, sorteo (simplificación de las reglas).
  - Puestos 1-8: directos a octavos. Puestos 9-24: playoff a ida y vuelta
    (9/10 contra 23/24, 11/12 contra 21/22, 13/14 contra 19/20, 15/16 contra 17/18).
  - Octavos: 1/2 contra los que vengan del cruce 15-18, 3/4 del 13-20, 5/6 del
    11-22 y 7/8 del 9-24. Cuartos: lado 1/2 contra lado 7/8 y lado 3/4 contra
    lado 5/6; 1 y 2 van a mitades distintas del cuadro. Los sorteos se hacen al azar.
  - En las eliminatorias juega la vuelta en casa el mejor clasificado en la fase
    de liga. Final a partido único en campo neutral.
  - Empate global: prórroga y penaltis, con un pequeño favoritismo para el
    equipo con más probabilidad de ganar a 90 minutos.

Simplificación: la fuerza de cada equipo se mantiene fija durante la simulación
(no se actualiza el Elo con los resultados simulados).
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

import numpy as np
import pandas as pd

from .features import swap_sides
from .models import predict_proba
from .predict import Predictor
from .teams import team_id

MAX_G = 10
ROUNDS = ["top8", "top24", "octavos", "cuartos", "semis", "final", "campeon"]


@dataclass
class MatchModel:
    """Probabilidades de un partido concreto y cómo sortear su marcador."""
    probs: np.ndarray        # [H, D, A]
    cdfs: np.ndarray         # 3 x 121: distribución del marcador dentro de cada resultado
    xg: tuple[float, float]


class ChampionsSimulator:
    def __init__(self, predictor: Predictor, played, pending, seed: int = 0):
        self.P = predictor
        self.fb = predictor.fb
        self.rng = np.random.default_rng(seed)
        self.played = played
        self.pending = pending
        self.teams = sorted({team_id(m.home_country, m.home) for m in played + pending} |
                            {team_id(m.away_country, m.away) for m in played + pending})
        self._snap = {t: self.fb.team_snapshot(t, self.fb.country_of[t]) for t in self.teams}
        self._cache: dict[tuple, MatchModel] = {}

    # ------------------------------------------------------------ modelo
    def _features(self, h, a, neutral, stage, gd):
        return self.fb._combine(self._snap[h], self._snap[a], neutral, stage, gd)

    def precompute(self, keys: list[tuple]) -> None:
        """Calcula de golpe (más rápido) los partidos (local, visitante, neutral, fase, ventaja_ida)."""
        keys = [k for k in dict.fromkeys(keys) if k not in self._cache]
        if not keys:
            return
        df = pd.DataFrame([self._features(*k) for k in keys])
        probs = predict_proba(self.P.model, df)
        lh, la = self.P.poisson.expected_goals(df)
        neutral = df["neutral"].values == 1
        if neutral.any():
            sa, sh = self.P.poisson.expected_goals(swap_sides(df[neutral]))
            lh[neutral] = (lh[neutral] + sh) / 2
            la[neutral] = (la[neutral] + sa) / 2
        g = np.arange(MAX_G + 1)
        i, j = np.meshgrid(g, g, indexing="ij")
        masks = [(i > j).ravel(), (i == j).ravel(), (i < j).ravel()]
        from scipy.stats import poisson
        for n, k in enumerate(keys):
            mat = np.outer(poisson.pmf(g, lh[n]), poisson.pmf(g, la[n])).ravel()
            cdfs = []
            for msk in masks:
                w = np.where(msk, mat, 0.0)
                cdfs.append(np.cumsum(w / w.sum()))
            self._cache[k] = MatchModel(probs[n] / probs[n].sum(), np.array(cdfs), (lh[n], la[n]))

    def model(self, h, a, neutral=False, stage="league", gd=None) -> MatchModel:
        k = (h, a, neutral, stage, gd)
        if k not in self._cache:
            self.precompute([k])
        return self._cache[k]

    def _score(self, mm: MatchModel, u1: float, u2: float) -> tuple[int, int, int]:
        """Sortea un resultado (0 local, 1 empate, 2 visitante) y un marcador coherente."""
        o = 0 if u1 < mm.probs[0] else (1 if u1 < mm.probs[0] + mm.probs[1] else 2)
        cell = int(np.searchsorted(mm.cdfs[o], u2, side="right"))
        cell = min(cell, (MAX_G + 1) ** 2 - 1)
        return o, cell // (MAX_G + 1), cell % (MAX_G + 1)

    # ------------------------------------------------------------ fase de liga
    def current_table(self) -> pd.DataFrame:
        tab = {t: dict(equipo=t, pj=0, pts=0, gf=0, gc=0, gf_fuera=0, v=0) for t in self.teams}
        for m in self.played:
            self._add(tab, team_id(m.home_country, m.home), team_id(m.away_country, m.away),
                      m.home_goals, m.away_goals)
        return self._sorted(tab, self.rng)

    @staticmethod
    def _add(tab, h, a, hg, ag):
        for t, f, c, away in ((h, hg, ag, False), (a, ag, hg, True)):
            r = tab[t]
            r["pj"] += 1
            r["gf"] += f
            r["gc"] += c
            r["gf_fuera"] += f if away else 0
            r["pts"] += 3 if f > c else (1 if f == c else 0)
            r["v"] += 1 if f > c else 0

    @staticmethod
    def _sorted(tab, rng) -> pd.DataFrame:
        df = pd.DataFrame(tab.values())
        df["dg"] = df.gf - df.gc
        df["sorteo"] = rng.random(len(df))
        return df.sort_values(["pts", "dg", "gf", "gf_fuera", "v", "sorteo"],
                              ascending=False).reset_index(drop=True)

    # ------------------------------------------------------------ eliminatorias
    def _tie(self, low, high, stage) -> str:
        """Eliminatoria a ida y vuelta; `high` (mejor clasificado) juega la vuelta en casa."""
        r = self.rng.random(5)
        _, g1l, g1h = self._score(self.model(low, high, False, stage, None), r[0], r[1])
        gd = float(g1h - g1l)  # ventaja del local de la vuelta (high)
        mm2 = self.model(high, low, False, stage, gd)
        _, g2h, g2l = self._score(mm2, r[2], r[3])
        agg_h, agg_l = g1h + g2h, g1l + g2l
        if agg_h != agg_l:
            return high if agg_h > agg_l else low
        p_high = 0.5 + 0.25 * (mm2.probs[0] - mm2.probs[2])
        return high if r[4] < p_high else low

    def _final(self, a, b) -> str:
        r = self.rng.random(3)
        mm = self.model(a, b, True, "final", None)
        o, _, _ = self._score(mm, r[0], r[1])
        if o == 0:
            return a
        if o == 2:
            return b
        return a if r[2] < 0.5 + 0.25 * (mm.probs[0] - mm.probs[2]) else b

    # ------------------------------------------------------------ simulación completa
    def run(self, n: int = 10000) -> pd.DataFrame:
        pend = [(team_id(m.home_country, m.home), team_id(m.away_country, m.away)) for m in self.pending]
        self.precompute([(h, a, False, "league", None) for h, a in pend])
        # Todos los cruces posibles de eliminatoria (ida sin ventaja previa) de una vez.
        pairs = [(x, y) for x in self.teams for y in self.teams if x != y]
        self.precompute([(x, y, False, st, gd) for x, y in pairs
                         for st in ("knockout_playoff", "round_of_16", "quarterfinal", "semifinal")
                         for gd in [None] + [float(v) for v in range(-4, 5)]])

        count = defaultdict(lambda: defaultdict(int))
        pts_sum = defaultdict(float)
        pos_sum = defaultdict(float)
        base = {r["equipo"]: {k: int(r[k]) for k in ("pj", "pts", "gf", "gc", "gf_fuera", "v")}
                for r in self.current_table().to_dict("records")}
        league_models = [self._cache[(h, a, False, "league", None)] for h, a in pend]
        for _ in range(n):
            tab = {t: dict(base[t]) for t in self.teams}
            u = self.rng.random((len(pend), 2))
            for (h, a), mm, (u1, u2) in zip(pend, league_models, u):
                _, hg, ag = self._score(mm, u1, u2)
                self._add(tab, h, a, hg, ag)
            noise = self.rng.random(len(self.teams))
            order = sorted(self.teams, key=lambda t, z=dict(zip(self.teams, noise)): (
                tab[t]["pts"], tab[t]["gf"] - tab[t]["gc"], tab[t]["gf"], tab[t]["gf_fuera"],
                tab[t]["v"], z[t]), reverse=True)
            for i, t in enumerate(order):
                pts_sum[t] += tab[t]["pts"]
                pos_sum[t] += i + 1
                if i < 8:
                    count[t]["top8"] += 1
                if i < 24:
                    count[t]["top24"] += 1
            self._knockout(order, count)
        rows = []
        for t in self.teams:
            r = {"equipo": t, "puntos_esperados": pts_sum[t] / n, "puesto_medio": pos_sum[t] / n}
            for k in ROUNDS:
                r[k] = count[t][k] / n
            rows.append(r)
        return pd.DataFrame(rows).sort_values(["campeon", "final", "semis"], ascending=False).reset_index(drop=True)

    def _knockout(self, order, count) -> None:
        seed = {t: i + 1 for i, t in enumerate(order)}
        pick = lambda pair: list(self.rng.permutation(pair))  # noqa: E731

        def by_seed(a, b):
            return (a, b) if seed[a] > seed[b] else (b, a)  # (peor, mejor)

        # Playoff: 9/10-23/24, 11/12-21/22, 13/14-19/20, 15/16-17/18 (se sortea dentro de cada pareja).
        po_winners = {}
        for top, bottom in (((9, 10), (23, 24)), ((11, 12), (21, 22)), ((13, 14), (19, 20)), ((15, 16), (17, 18))):
            t_ = pick([order[top[0] - 1], order[top[1] - 1]])
            b_ = pick([order[bottom[0] - 1], order[bottom[1] - 1]])
            po_winners[top] = [self._tie(b_[k], t_[k], "knockout_playoff") for k in range(2)]
        # Octavos: 1/2 vs cruce 15-18, 3/4 vs 13-20, 5/6 vs 11-22, 7/8 vs 9-24.
        r16 = {}
        for seeds, src in (((1, 2), (15, 16)), ((3, 4), (13, 14)), ((5, 6), (11, 12)), ((7, 8), (9, 10))):
            s_ = pick([order[seeds[0] - 1], order[seeds[1] - 1]])
            w_ = pick(po_winners[src])
            r16[seeds] = [self._tie(*by_seed(s_[k], w_[k]), "round_of_16") for k in range(2)]
        for t in order[:8] + [w for ws in po_winners.values() for w in ws]:
            count[t]["octavos"] += 1
        # Cuartos: lado 1/2 contra lado 7/8; lado 3/4 contra lado 5/6.
        a12, a78, a34, a56 = pick(r16[(1, 2)]), pick(r16[(7, 8)]), pick(r16[(3, 4)]), pick(r16[(5, 6)])
        qf = [(a12[0], a78[0]), (a34[0], a56[0]), (a12[1], a78[1]), (a34[1], a56[1])]
        for pair in qf:
            for t in pair:
                count[t]["cuartos"] += 1
        qf_w = [self._tie(*by_seed(x, y), "quarterfinal") for x, y in qf]
        # Semis: mitad A (cuartos 0 y 1) y mitad B (cuartos 2 y 3): 1 y 2 nunca se cruzan antes de la final.
        sf = [(qf_w[0], qf_w[1]), (qf_w[2], qf_w[3])]
        for pair in sf:
            for t in pair:
                count[t]["semis"] += 1
        finalists = [self._tie(*by_seed(x, y), "semifinal") for x, y in sf]
        for t in finalists:
            count[t]["final"] += 1
        count[self._final(*finalists)]["campeon"] += 1
