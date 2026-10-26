// Reproduce en JavaScript el modelo combinado (regresión logística + Poisson)
// de clml/. Los coeficientes vienen de scripts/exportar_web.py.
// Sin dependencias: funciona en el navegador y en Node (para el test de paridad).
(function (root) {
  "use strict";

  var FEATURES = ["elo_diff", "elo_exp", "elo_home", "elo_away", "neutral",
    "stage_level", "knockout", "second_leg", "first_leg_gd",
    "form_ppg_diff", "form_gd_diff", "ucl_exp_home", "ucl_exp_away",
    "country_ppg_home", "country_ppg_away"];
  var MAX_GOALS = 10;

  function features(M, h, a, neutral, stage, firstLegGd) {
    var exp = 1 / (1 + Math.pow(10, -((h.elo - a.elo) + (neutral ? 0 : M.home_adv)) / 400));
    var hasLeg = firstLegGd !== null && firstLegGd !== undefined;
    return {
      elo_diff: h.elo - a.elo, elo_exp: exp, elo_home: h.elo, elo_away: a.elo,
      neutral: neutral ? 1 : 0,
      stage_level: M.stage_order[stage] !== undefined ? M.stage_order[stage] : 1,
      knockout: M.knockout.indexOf(stage) >= 0 ? 1 : 0,
      second_leg: hasLeg ? 1 : 0,
      first_leg_gd: hasLeg ? firstLegGd : 0,
      form_ppg_diff: h.form_ppg - a.form_ppg, form_gd_diff: h.form_gd - a.form_gd,
      ucl_exp_home: h.ucl_exp, ucl_exp_away: a.ucl_exp,
      country_ppg_home: h.country_ppg, country_ppg_away: a.country_ppg
    };
  }

  function swap(f) {
    return {
      elo_diff: -f.elo_diff, elo_exp: 1 - f.elo_exp, elo_home: f.elo_away, elo_away: f.elo_home,
      neutral: f.neutral, stage_level: f.stage_level, knockout: f.knockout,
      second_leg: f.second_leg, first_leg_gd: -f.first_leg_gd,
      form_ppg_diff: -f.form_ppg_diff, form_gd_diff: -f.form_gd_diff,
      ucl_exp_home: f.ucl_exp_away, ucl_exp_away: f.ucl_exp_home,
      country_ppg_home: f.country_ppg_away, country_ppg_away: f.country_ppg_home
    };
  }

  function scaled(f, sc) {
    return FEATURES.map(function (k, i) { return (f[k] - sc.mean[i]) / sc.scale[i]; });
  }

  function dot(w, x) { var s = 0; for (var i = 0; i < x.length; i++) s += w[i] * x[i]; return s; }

  function logitProba(L, f) {
    var z = scaled(f, L.scaler);
    var s = L.coef.map(function (w, k) { return dot(w, z) + L.intercept[k]; });
    var mx = Math.max.apply(null, s);
    var e = s.map(function (v) { return Math.exp(v - mx); });
    var t = e[0] + e[1] + e[2];
    var by = {};
    L.classes.forEach(function (c, k) { by[c] = e[k] / t; });
    return [by.H, by.D, by.A];
  }

  function poissonPmf(lam) {
    var p = [Math.exp(-lam)];
    for (var g = 1; g <= MAX_GOALS; g++) p.push(p[g - 1] * lam / g);
    return p;
  }

  function goals(P, f) {
    var z = scaled(f, P.scaler);
    return [Math.exp(dot(P.home.coef, z) + P.home.intercept),
            Math.exp(dot(P.away.coef, z) + P.away.intercept)];
  }

  function matrix(lh, la) {
    var ph = poissonPmf(lh), pa = poissonPmf(la), m = [];
    for (var i = 0; i <= MAX_GOALS; i++) {
      m.push([]);
      for (var j = 0; j <= MAX_GOALS; j++) m[i].push(ph[i] * pa[j]);
    }
    return m;
  }

  function outcome(m) {
    var h = 0, d = 0, a = 0;
    for (var i = 0; i < m.length; i++) for (var j = 0; j < m.length; j++) {
      if (i > j) h += m[i][j]; else if (i === j) d += m[i][j]; else a += m[i][j];
    }
    return [h, d, a];
  }

  function rawProba(M, f) {
    var l = logitProba(M.logit, f);
    var g = goals(M.poisson, f);
    var p = outcome(matrix(g[0], g[1]));
    return [(l[0] + p[0]) / 2, (l[1] + p[1]) / 2, (l[2] + p[2]) / 2];
  }

  // Igual que clml.predict.Predictor.predict
  function predict(M, home, away, opts) {
    opts = opts || {};
    var h = M.teams[home], a = M.teams[away];
    var stage = opts.stage || "league";
    var f = features(M, h, a, !!opts.neutral, stage, opts.firstLegGd);
    var p = rawProba(M, f);
    var g = goals(M.poisson, f);
    if (opts.neutral) {
      var fs = swap(f);
      var q = rawProba(M, fs);
      p = [(p[0] + q[2]) / 2, (p[1] + q[1]) / 2, (p[2] + q[0]) / 2];
      var gs = goals(M.poisson, fs);
      g = [(g[0] + gs[1]) / 2, (g[1] + gs[0]) / 2];
    }
    var m = matrix(g[0], g[1]);
    var scores = [];
    for (var i = 0; i < 6; i++) for (var j = 0; j < 6; j++) scores.push({ s: i + "-" + j, p: m[i][j], h: i, a: j });
    scores.sort(function (x, y) { return y.p - x.p; });
    return { home: p[0], draw: p[1], away: p[2], xgHome: g[0], xgAway: g[1],
             matrix: m, top: scores.slice(0, 5), eloHome: h.elo, eloAway: a.elo };
  }

  var api = { predict: predict, FEATURES: FEATURES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CLPredict = api;
})(this);
