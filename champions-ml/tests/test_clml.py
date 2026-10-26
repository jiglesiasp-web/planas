import datetime as dt
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from clml.features import FEATURES, FeatureBuilder, load_matches, swap_sides  # noqa: E402
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


def test_features_do_not_use_future_matches():
    """Las variables de un partido no deben cambiar si se borran los partidos posteriores."""
    ms = load_matches()
    cut = dt.date(2019, 1, 1)
    full = FeatureBuilder().run(ms)
    past = FeatureBuilder().run([m for m in ms if m.date < cut])
    a = full[full.date < cut].reset_index(drop=True)
    assert len(a) == len(past)
    np.testing.assert_allclose(a[FEATURES].values, past[FEATURES].values)


def test_swap_sides_is_involution():
    df = FeatureBuilder().run(load_matches()[:400])
    back = swap_sides(swap_sides(df))
    np.testing.assert_allclose(back[FEATURES].values, df[FEATURES].values)


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
