"""Partidos nacionales: ligas (football-data.co.uk) y copas/ligas (openfootball).

Todos se devuelven como `Match` (el mismo tipo que los partidos europeos)
con competition = "LIGA" o "COPA" y el país en home_country/away_country.
"""

from __future__ import annotations

import datetime as dt
import glob
import re
from pathlib import Path

import pandas as pd

from .parse import (DATE_RE, HEADER_RE, STAGE_RE, Match, _infer_date,
                    normalize_stage, parse_score)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
FD_DIR = DATA_DIR / "ligas"                    # football-data.co.uk (se descarga)
OF_DIR = DATA_DIR / "openfootball_nacional"    # openfootball (incluido, dominio público)

# Código de división de football-data -> (país, división)
FD_MAIN = {"E0": ("ENG", 1), "E1": ("ENG", 2), "SC0": ("SCO", 1), "D1": ("GER", 1),
           "D2": ("GER", 2), "I1": ("ITA", 1), "I2": ("ITA", 2), "SP1": ("ESP", 1),
           "SP2": ("ESP", 2), "F1": ("FRA", 1), "F2": ("FRA", 2), "N1": ("NED", 1),
           "B1": ("BEL", 1), "P1": ("POR", 1), "T1": ("TUR", 1), "G1": ("GRE", 1)}
FD_EXTRA = {"AUT": "AUT", "SWZ": "SUI", "DNK": "DEN", "NOR": "NOR", "SWE": "SWE",
            "POL": "POL", "ROU": "ROU", "RUS": "RUS", "IRL": "IRL", "FIN": "FIN"}

OF_COUNTRY = {
    "england": "ENG", "espana": "ESP", "deutschland": "GER", "italy": "ITA",
    "albania": "ALB", "andorra": "AND", "armenia": "ARM", "azerbaijan": "AZE",
    "belarus": "BLR", "bosnia-herzegovina": "BIH", "bulgaria": "BUL", "croatia": "CRO",
    "cyprus": "CYP", "czech-republic": "CZE", "denmark": "DEN", "estonia": "EST",
    "faroe-islands": "FRO", "france": "FRA", "georgia": "GEO", "gibraltar": "GIB",
    "hungary": "HUN", "iceland": "ISL", "kosovo": "KOS", "latvia": "LVA",
    "liechtenstein": "LIE", "lithuania": "LTU", "luxembourg": "LUX", "malta": "MLT",
    "moldova": "MDA", "montenegro": "MNE", "netherlands": "NED", "north-macedonia": "MKD",
    "northern-ireland": "NIR", "norway": "NOR", "portugal": "POR", "romania": "ROU",
    "san-marino": "SMR", "serbia": "SRB", "slovakia": "SVK", "slovenia": "SVN",
    "switzerland": "SUI", "turkey": "TUR", "ukraine": "UKR", "wales": "WAL",
}


def season_of(d: dt.date) -> str:
    """Temporada europea (julio-junio) de una fecha: 2024-03-01 -> '2023-24'."""
    y = d.year if d.month >= 7 else d.year - 1
    return f"{y}-{str(y + 1)[2:]}"


# ------------------------------------------------------------ football-data
def _read_csv(path: str) -> pd.DataFrame:
    for enc in ("utf-8-sig", "latin-1"):
        try:
            return pd.read_csv(path, encoding=enc, on_bad_lines="skip", low_memory=False)
        except UnicodeDecodeError:
            continue
    raise ValueError(f"No se puede leer {path}")


def _mk(country, division, date, home, away, hg, ag, source, competition="LIGA",
        stage="liga", neutral=False, extra=None) -> Match:
    m = Match(competition=competition, qualifying=False, season=season_of(date), stage=stage,
              stage_raw=stage, date=date, home=home, home_country=country, away=away,
              away_country=country, home_goals=hg, away_goals=ag, neutral=neutral)
    m.extra = {"division": division, "source": source, **(extra or {})}
    return m


def load_football_data(fd_dir: Path | None = None, since: dt.date = dt.date(2011, 7, 1)) -> list[Match]:
    fd_dir = Path(fd_dir or FD_DIR)
    out: list[Match] = []
    for f in sorted(glob.glob(str(fd_dir / "*.csv"))):
        name = Path(f).stem
        df = _read_csv(f)
        if name.startswith("new_"):
            country = FD_EXTRA[name[4:]]
            cols = ("Home", "Away", "HG", "AG")
            division = 1
        else:
            code = name.split("_", 1)[1]
            country, division = FD_MAIN[code]
            cols = ("HomeTeam", "AwayTeam", "FTHG", "FTAG")
        df = df.dropna(subset=list(cols) + ["Date"])
        dates = pd.to_datetime(df["Date"], dayfirst=True, format="mixed", errors="coerce")
        odds = [c for c in ("AvgCH", "AvgCD", "AvgCA") if c in df.columns]
        if len(odds) < 3:
            odds = [c for c in ("AvgH", "AvgD", "AvgA") if c in df.columns]
        for i, (idx, r) in enumerate(df.iterrows()):
            d = dates.iloc[i]
            if pd.isna(d) or d.date() < since:
                continue
            extra = {}
            if len(odds) == 3 and not any(pd.isna(r[c]) for c in odds):
                extra["odds"] = tuple(float(r[c]) for c in odds)
            out.append(_mk(country, division, d.date(), str(r[cols[0]]).strip(),
                           str(r[cols[1]]).strip(), int(r[cols[2]]), int(r[cols[3]]),
                           "football-data", extra=extra))
    return out


# ------------------------------------------------------------ openfootball
TIME = r"(?:\d{1,2}[:.]\d{2}\s+)?"
SCORE = r"\d+-\d+(?:\s+pen\.(?:\s+\d+-\d+)?)?(?:\s+a\.e\.t\.)?(?:\s+\([^)]*\))?"
V_RE = re.compile(rf"^\s*{TIME}(?P<home>.+?)\s+v\s+(?P<away>.+?)\s+(?P<score>{SCORE})(?:\s.*)?$")
MID_RE = re.compile(rf"^\s*{TIME}(?P<home>.+?)\s+(?P<score>{SCORE})\s+(?P<away>\D.*?)\s*(?:@.*)?$")
CAL_HEADER_RE = re.compile(r"^=\s*(?P<name>.+?)\s+(?P<y>\d{4})\s*$")
DATE_LOOSE_RE = re.compile(DATE_RE.pattern.replace(r"^\s+", r"^\s*"))


def parse_openfootball_domestic(path: str | Path, country: str, unparsed: list | None = None) -> list[Match]:
    """Lee una liga o copa nacional de openfootball (sin códigos de país)."""
    path = Path(path)
    is_cup = "cup" in path.name.lower()
    start_year = None
    stage = ""
    cur: dt.date | None = None
    out: list[Match] = []
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        m = HEADER_RE.match(line)
        if m:
            start_year = int(m.group("y1"))
            continue
        m = CAL_HEADER_RE.match(line)
        if m:
            start_year = int(m.group("y"))
            continue
        m = STAGE_RE.match(line)
        if m:
            stage = m.group("stage")
            continue
        m = DATE_LOOSE_RE.match(line)
        if m and start_year is not None:
            from .parse import MONTHS
            month, day = MONTHS[m.group("mon")], int(m.group("day"))
            cur = (dt.date(int(m.group("year")), month, day) if m.group("year")
                   else _infer_date(start_year, month, day, m.group("wd"), cur))
            continue
        m = V_RE.match(line) or MID_RE.match(line)
        if m and cur is not None:
            hg, ag, _, _ = parse_score(m.group("score"))
            if hg is None:
                continue
            st = normalize_stage(stage, False) if is_cup else "liga"
            out.append(_mk(country, 1, cur, m.group("home").strip(), m.group("away").strip(),
                           hg, ag, "openfootball", competition="COPA" if is_cup else "LIGA",
                           stage=st, neutral=is_cup and st == "final"))
            continue
        if unparsed is not None and not line.startswith("="):
            unparsed.append((str(path), lineno, line))
    return out


def load_openfootball_domestic(of_dir: Path | None = None, unparsed: list | None = None) -> list[Match]:
    of_dir = Path(of_dir or OF_DIR)
    out: list[Match] = []
    for f in sorted(glob.glob(str(of_dir / "**" / "*.txt"), recursive=True)):
        parts = Path(f).relative_to(of_dir).parts
        country = OF_COUNTRY[parts[1] if parts[0] == "europe" else parts[0]]
        out.extend(parse_openfootball_domestic(f, country, unparsed))
    return out
