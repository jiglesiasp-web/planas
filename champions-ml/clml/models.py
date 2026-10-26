"""Modelos de predicción 1X2 (local / empate / visitante) y métricas."""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.stats import poisson
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression, PoissonRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from .features import FEATURES, FEATURES_EU, swap_sides

CLASSES = ["H", "D", "A"]  # orden de las columnas de probabilidad


# ---------------------------------------------------------------- métricas
def _onehot(y) -> np.ndarray:
    y = np.asarray(y)
    return np.stack([(y == c).astype(float) for c in CLASSES], axis=1)


def metrics(y_true, proba: np.ndarray) -> dict:
    """Acierto, log loss, Brier y RPS (cuanto más bajos los tres últimos, mejor)."""
    p = np.clip(proba, 1e-12, 1)
    p = p / p.sum(axis=1, keepdims=True)
    o = _onehot(y_true)
    pred = np.array(CLASSES)[p.argmax(axis=1)]
    # RPS: tiene en cuenta el orden H > D > A (fallar por poco cuesta menos).
    cp, co = np.cumsum(p, axis=1)[:, :2], np.cumsum(o, axis=1)[:, :2]
    return {
        "acierto": float((pred == np.asarray(y_true)).mean()),
        "log_loss": float(-(o * np.log(p)).sum(axis=1).mean()),
        "brier": float(((p - o) ** 2).sum(axis=1).mean()),
        "rps": float(((cp - co) ** 2).sum(axis=1).mean() / 2),
    }


# ---------------------------------------------------------------- modelos
class PriorModel:
    """Referencia: siempre predice las frecuencias históricas de H/D/A."""
    name = "Frecuencias históricas"

    def fit(self, df):
        self.p = _onehot(df["result"]).mean(axis=0)
        return self

    def predict_proba(self, df):
        return np.tile(self.p, (len(df), 1))


class SklearnModel:
    def __init__(self, name, estimator, features):
        self.name, self.est, self.features = name, estimator, features

    def fit(self, df):
        self.est.fit(df[self.features].values, df["result"].values)
        return self

    def predict_proba(self, df):
        proba = self.est.predict_proba(df[self.features].values)
        order = [list(self.est.classes_).index(c) for c in CLASSES]
        return proba[:, order]


def elo_logit():
    return SklearnModel("Elo + regresión logística",
                        make_pipeline(StandardScaler(), LogisticRegression(C=1.0, max_iter=1000)),
                        ["elo_diff", "neutral"])


def full_logit(C: float = 0.1, features=None):
    return SklearnModel("Regresión logística (todas las variables)",
                        make_pipeline(StandardScaler(), LogisticRegression(C=C, max_iter=2000)),
                        list(features or FEATURES))


def gradient_boosting(features=None):
    return SklearnModel("Gradient boosting",
                        HistGradientBoostingClassifier(max_depth=3, learning_rate=0.03, max_iter=200,
                                                       min_samples_leaf=40, l2_regularization=1.0,
                                                       random_state=0),
                        list(features or FEATURES))


class PoissonGoals:
    """Predice los goles de cada equipo con una regresión de Poisson.

    Con las dos medias se calcula la probabilidad de cada marcador (0-0, 1-0,
    ...) y de ahí la de victoria local, empate y victoria visitante.
    """
    name = "Poisson (goles)"
    MAX_GOALS = 10

    def __init__(self, alpha: float = 1.0, features=None):
        self.alpha = alpha
        self.features = list(features or FEATURES)

    def fit(self, df):
        self.scaler = StandardScaler().fit(df[self.features].values)
        X = self.scaler.transform(df[self.features].values)
        self.mh = PoissonRegressor(alpha=self.alpha, max_iter=1000).fit(X, df["home_goals"])
        self.ma = PoissonRegressor(alpha=self.alpha, max_iter=1000).fit(X, df["away_goals"])
        return self

    def expected_goals(self, df):
        X = self.scaler.transform(df[self.features].values)
        return self.mh.predict(X), self.ma.predict(X)

    def score_matrix(self, lam_h: float, lam_a: float) -> np.ndarray:
        g = np.arange(self.MAX_GOALS + 1)
        return np.outer(poisson.pmf(g, lam_h), poisson.pmf(g, lam_a))

    def predict_proba(self, df):
        out = []
        for lh, la in zip(*self.expected_goals(df)):
            m = self.score_matrix(lh, la)
            out.append([np.tril(m, -1).sum(), np.trace(m), np.triu(m, 1).sum()])
        return np.array(out)


class Ensemble:
    """Media de las probabilidades de varios modelos."""
    name = "Combinado (logística + Poisson)"

    def __init__(self, models, name: str | None = None):
        self.models = models
        if name:
            self.name = name

    def fit(self, df):
        for m in self.models:
            m.fit(df)
        return self

    def predict_proba(self, df):
        return np.mean([m.predict_proba(df) for m in self.models], axis=0)


def all_models(features=None):
    return [PriorModel(), elo_logit(), full_logit(features=features), gradient_boosting(features),
            PoissonGoals(features=features), combined(features)]


def combined(features=None):
    """El modelo final: media de la regresión logística y el modelo de goles."""
    return Ensemble([full_logit(features=features), PoissonGoals(features=features)])


def combined_europe_only():
    """El modelo final de la versión anterior (sin ligas ni copas), para comparar."""
    return Ensemble([full_logit(features=FEATURES_EU), PoissonGoals(features=FEATURES_EU)],
                    name="Combinado, solo datos europeos (versión anterior)")


class AlwaysHome:
    name = "Siempre gana el local"

    def fit(self, df):
        return self

    def predict_proba(self, df):
        return np.tile([0.999, 0.0005, 0.0005], (len(df), 1))


def predict_proba(model, df: pd.DataFrame) -> np.ndarray:
    """Probabilidades H/D/A. En campo neutral, "local" y "visitante" son solo
    etiquetas, así que se promedia la predicción con la de los equipos
    intercambiados para que el orden no influya."""
    proba = np.asarray(model.predict_proba(df), dtype=float)
    neutral = df["neutral"].values == 1
    if neutral.any():
        sub = df[neutral]
        swapped = np.asarray(model.predict_proba(swap_sides(sub)), dtype=float)[:, ::-1]
        proba[neutral] = (proba[neutral] + swapped) / 2
    return proba


def walk_forward(df: pd.DataFrame, test_seasons: list[str], first_train: str = "2012-13",
                 make_models=all_models) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Para cada temporada de prueba, entrena con todas las anteriores y predice esa.

    Devuelve (métricas por modelo y temporada, predicciones de cada partido).
    """
    rows, preds = [], []
    for season in test_seasons:
        train = df[(df.season >= first_train) & (df.season < season)]
        test = df[df.season == season]
        for model in make_models():
            model.fit(train)
            proba = predict_proba(model, test)
            r = metrics(test["result"], proba)
            r.update(modelo=model.name, temporada=season, partidos=len(test))
            rows.append(r)
            p = test[["date", "season", "stage", "home", "away", "result"]].copy()
            p["modelo"] = model.name
            p[["pH", "pD", "pA"]] = proba
            preds.append(p)
    return pd.DataFrame(rows), pd.concat(preds, ignore_index=True)
