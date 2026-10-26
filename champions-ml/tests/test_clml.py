import datetime as dt
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from clml.domestic import FD_DIR, parse_openfootball_domestic  # noqa: E402
from clml.features import (FEATURES, FEATURES_EU, FeatureBuilder, load_all_matches,  # noqa: E402
                           load_matches, swap_sides)
from clml.similitud import strict_match  # noqa: E402
from clml.models import metrics  # noqa: E402
from clml.parse import parse_file, parse_score  # noqa: E402
from clml.predict import parse_first_leg  # noqa: E402
from clml.teams import find_team, team_id  # noqa: E402

SAMPLE = """= UEFA Champions League 2013/14

▪ Group A
  Tue Sep 17 2013
    20:45  Manchester United (ENG) v Bayer Leverkusen (GER)   4-2 (1-0)
  Tue Dec 10
    20:45  Real Sociedad (ESP)     v Bayer Leverkusen (GER)   0-1 (0-0)

▪ Group B
  Tue Sep 17
    20:45  Galatasaray (TUR)       v Real Madrid (ESP)        1-6 (0-1)

▪ Final
  Sat May 24
    20:45  Real Madrid (ESP)       v Atlético Madrid (ESP)    4-1 a.e.t. (1-1, 0-1)
"""


def test_parse_score_variants():
    assert parse_score("4-2 (1-0)") == (4, 2, False, None)
    assert parse_score("0-0") == (0, 0, False, None)
    # Prórroga: cuenta el resultado a los 90 minutos.
    assert parse_score("4-1 a.e.t. (1-1, 0-1)") == (1, 1, True, None)
    assert parse_score("4-3 pen. 1-0 a.e.t. (1-0, 1-0)") == (1, 0, True, (4, 3))
    assert parse_score("9-10 pen. (2-2, 0-1)") == (2, 2, False, (9, 10))
    assert parse_score("4-3 pen.") == (None, None, False, None)  # sin resultado a los 90'
    assert parse_score("[cancelled]") == (None, None, False, None)


def test_parse_file_dates_and_stages(tmp_path):
    f = tmp_path / "cl.txt"
    f.write_text(SAMPLE, encoding="utf-8")
    ms = parse_file(f)
    assert [m.date for m in ms] == [dt.date(2013, 9, 17), dt.date(2013, 12, 10),
                                   dt.date(2013, 9, 17), dt.date(2014, 5, 24)]
    assert [m.stage for m in ms] == ["group", "group", "group", "final"]
    final = ms[-1]
    assert final.neutral and final.extra_time
    assert (final.home_goals, final.away_goals) == (1, 1)


def test_all_raw_files_parse():
    ms = load_matches()
    ucl = [m for m in ms if m.competition == "UCL" and not m.qualifying]
    assert len(ucl) > 1900
    assert all(m.home != m.away for m in ms)


def test_team_aliases_and_search():
    assert team_id("ESP", "Real Madrid CF") == team_id("ESP", "Real Madrid")
    assert team_id("MCO", "AS Monaco FC") == "AS Monaco (FRA)"
    known = ["Real Madrid (ESP)", "Atlético Madrid (ESP)", "Bayern München (GER)",
             "Paris Saint-Germain (FRA)"]
    assert find_team("bayern", known) == "Bayern München (GER)"
    assert find_team("atletico madrid", known) == "Atlético Madrid (ESP)"
    assert find_team("PSG", known) == "Paris Saint-Germain (FRA)"
    with pytest.raises(ValueError):
        find_team("madrid", known)


needs_leagues = pytest.mark.skipif(not list(FD_DIR.glob("*.csv")),
                                   reason="faltan datos de ligas (python scripts/descargar_datos.py)")


def _no_future(ms, features):
    cut = dt.date(2019, 1, 1)
    full = FeatureBuilder().run(ms)
    past = FeatureBuilder().run([m for m in ms if m.date < cut])
    a = full[full.date < cut].reset_index(drop=True)
    assert len(a) == len(past)
    np.testing.assert_allclose(a[features].values, past[features].values)


def test_features_do_not_use_future_matches():
    """Las variables de un partido no deben cambiar si se borran los partidos posteriores."""
    _no_future(load_matches(), FEATURES_EU)


@needs_leagues
def test_features_do_not_use_future_matches_with_leagues():
    _no_future(load_all_matches(), FEATURES)


def test_strict_name_matching():
    fd = {"Man City", "Man United", "Ath Madrid", "Real Madrid", "Mainz", "Oxford", "PSV Eindhoven"}
    assert strict_match("Manchester City", fd) == "Man City"
    assert strict_match("Manchester United", fd) == "Man United"
    assert strict_match("1. FSV Mainz 05", fd) == "Mainz"
    # Clubes distintos con nombre parecido: no se unen.
    assert strict_match("TSV Schott Mainz", fd) is None
    assert strict_match("FC Eindhoven", fd) is None
    assert strict_match("Real Madrid B", fd) is None


@needs_leagues
def test_domestic_names_resolved_to_european_names():
    ms = load_all_matches()
    esp = {m.home for m in ms if m.home_country == "ESP" and m.competition == "LIGA"}
    assert {"Atlético Madrid", "Real Madrid", "FC Barcelona", "Athletic Club"} <= esp
    assert "Ath Madrid" not in esp
    eng = {m.home for m in ms if m.home_country == "ENG"}
    # "Oxford City" (amateur) no debe fusionarse con el Oxford United de la liga.
    assert "Oxford City" in eng and "Oxford United" not in eng


def test_parse_domestic_cup_formats(tmp_path):
    f = tmp_path / "cup.txt"
    f.write_text("""= Copa del Rey 2023/24

▪ Round 1
Tue Oct 31
  20:00  CD Mensajero             0-2 (0-2)  Espanyol Barcelona
  20:45  CP Cacereño              2-3 a.e.t. (2-2, 1-0)  CD Castellón
    19:30  Crawley Town            v Gillingham FC            9-10 pen. (2-2, 0-1)

▪ Final
Sat Apr 6
  21:00  Athletic Club            4-2 pen. 1-1 a.e.t. (1-1, 0-0)  RCD Mallorca
""", encoding="utf-8")
    ms = parse_openfootball_domestic(f, "ESP")
    got = [(m.home, m.away, m.home_goals, m.away_goals, m.neutral) for m in ms]
    assert got == [("CD Mensajero", "Espanyol Barcelona", 0, 2, False),
                   ("CP Cacereño", "CD Castellón", 2, 2, False),
                   ("Crawley Town", "Gillingham FC", 2, 2, False),
                   ("Athletic Club", "RCD Mallorca", 1, 1, True)]
    assert ms[0].date == dt.date(2023, 10, 31) and ms[-1].date == dt.date(2024, 4, 6)


def test_swap_sides_is_involution():
    df = FeatureBuilder().run(load_matches()[:400])
    assert set(FEATURES_EU) <= set(df.columns)
    back = swap_sides(swap_sides(df))
    np.testing.assert_allclose(back[FEATURES].values, df[FEATURES].values, equal_nan=True)


def test_metrics_perfect_and_uniform():
    y = ["H", "D", "A"]
    perfect = metrics(y, np.eye(3))
    assert perfect["acierto"] == 1.0 and perfect["log_loss"] < 1e-6
    uniform = metrics(y, np.full((3, 3), 1 / 3))
    assert abs(uniform["log_loss"] - np.log(3)) < 1e-9


def test_parse_first_leg():
    # Ida 2-1 para el visitante de hoy: el local de hoy va perdiendo por 1.
    assert parse_first_leg("2-1") == -1
    assert parse_first_leg("0-3") == 3
    assert parse_first_leg(None) is None


@needs_leagues
def test_no_two_clubs_merged_into_one():
    """Dos nombres que juegan la misma temporada y competición no pueden ser el mismo club."""
    from collections import defaultdict

    from clml.domestic import load_football_data, load_openfootball_domestic
    from clml.teams import resolve_domestic_names

    dom = load_football_data() + load_openfootball_domestic()
    original = [(m.home, m.away) for m in dom]
    resolve_domestic_names(load_matches(), dom)
    groups = defaultdict(lambda: defaultdict(set))
    for m, (oh, oa) in zip(dom, original):
        key = (m.extra["source"], m.home_country, m.season, m.competition)
        groups[key][m.home].add(oh)
        groups[key][m.away].add(oa)
    # Única excepción: el Craiova cambió de nombre a mitad de la temporada 2020-21.
    allowed = {("U Craiova", "Univ. Craiova")}
    merged = [(k, c, tuple(sorted(n))) for k, d in groups.items() for c, n in d.items()
              if len(n) > 1 and tuple(sorted(n)) not in allowed]
    assert merged == []
