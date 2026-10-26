"""Lector de ficheros Football.TXT (formato de openfootball).

Convierte cada fichero de una temporada (cl.txt, el.txt, clq.txt...) en una
lista de partidos con fecha, fase, equipos y resultado a los 90 minutos.
"""

from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass, field
from pathlib import Path

MONTHS = {m: i for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], start=1)}

HEADER_RE = re.compile(r"^=\s*(?P<name>.+?)\s+(?P<y1>\d{4})/(?P<y2>\d{2})\s*$")
STAGE_RE = re.compile(r"^▪\s*(?P<stage>.+?)\s*$")
DATE_RE = re.compile(
    r"^\s+(?P<wd>Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(?P<mon>[A-Z][a-z]{2})\s+(?P<day>\d{1,2})"
    r"(?:\s+(?P<year>\d{4}))?\s*$")
MATCH_RE = re.compile(
    r"^\s+(?:\d{1,2}:\d{2}\s+)?"
    r"(?P<home>.+?)\s+\((?P<hc>[A-Z]{3})\)\s+v\s+"
    r"(?P<away>.+?)\s+\((?P<ac>[A-Z]{3})\)"
    r"(?:\s+(?P<score>[^@]*?))?\s*(?:@.*)?$")

# Resultados posibles:
#   "4-2 (1-0)"                              -> 90' = 4-2
#   "4-1 a.e.t. (1-1, 0-1)"                  -> 90' = 1-1, prórroga 4-1
#   "4-3 pen. 1-0 a.e.t. (1-0, 1-0)"         -> 90' = 1-0, prórroga 1-0, penaltis 4-3
#   "4-3 pen. (2-2, 0-1)"                    -> 90' = 2-2, penaltis 4-3 (sin prórroga)
#   "4-3 pen." o "2-1 a.e.t." sin paréntesis -> no se sabe el 90': se descarta
PEN_RE = re.compile(r"^(\d+)-(\d+) pen\. (\d+)-(\d+) a\.e\.t\. \((\d+)-(\d+)")
AET_RE = re.compile(r"^(\d+)-(\d+) a\.e\.t\. \((\d+)-(\d+)")
# Penaltis sin prórroga (p. ej. Copa de la Liga inglesa): "4-3 pen. (2-2, 0-1)" -> 90' = 2-2
PEN_NOAET_RE = re.compile(r"^(\d+)-(\d+) pen\. \((\d+)-(\d+)")
FT_RE = re.compile(r"^(\d+)-(\d+)(?!\s+(?:pen|a\.e\.t))(?:\s|$)")


@dataclass
class Match:
    competition: str      # "UCL", "UEL", "UECL"
    qualifying: bool      # partido de la fase previa
    season: str           # "2013-14"
    stage: str            # fase normalizada (ver normalize_stage)
    stage_raw: str
    date: dt.date
    home: str
    home_country: str
    away: str
    away_country: str
    home_goals: int | None   # goles a los 90 minutos
    away_goals: int | None
    extra_time: bool = False
    penalties: tuple[int, int] | None = None
    neutral: bool = False
    extra: dict = field(default_factory=dict)

    @property
    def played(self) -> bool:
        return self.home_goals is not None


def parse_score(text: str | None):
    """Devuelve (goles_local_90, goles_visitante_90, prorroga, penaltis)."""
    if not text:
        return None, None, False, None
    text = text.strip()
    m = PEN_RE.match(text)
    if m:
        g = list(map(int, m.groups()))
        return g[4], g[5], True, (g[0], g[1])
    m = PEN_NOAET_RE.match(text)
    if m:
        g = list(map(int, m.groups()))
        return g[2], g[3], False, (g[0], g[1])
    m = AET_RE.match(text)
    if m:
        g = list(map(int, m.groups()))
        return g[2], g[3], True, None
    m = FT_RE.match(text)
    if m:
        return int(m.group(1)), int(m.group(2)), False, None
    return None, None, False, None


def competition_from_header(name: str) -> tuple[str, bool]:
    low = name.lower()
    quali = "quali" in low
    if "champions" in low:
        return "UCL", quali
    if "europa" in low:
        return "UEL", quali
    if "conference" in low:
        return "UECL", quali
    raise ValueError(f"Competición desconocida: {name!r}")


def normalize_stage(raw: str, qualifying: bool) -> str:
    s = raw.lower()
    if qualifying:
        return "qualifying"
    if "final" in s and "semi" not in s and "quarter" not in s and s.strip().endswith("final"):
        return "final"
    if "semi" in s:
        return "semifinal"
    if "quarter" in s:
        return "quarterfinal"
    if "round of 16" in s:
        return "round_of_16"
    if "round of 32" in s or "sechzehntelfinale" in s:
        return "round_of_32"
    if "playoff" in s or "knockout round" in s:
        return "knockout_playoff"
    if "league" in s:
        return "league"
    if "group" in s or "gruppe" in s:
        return "group"
    return "other"


WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _infer_date(start_year: int, month: int, day: int, weekday: str,
                prev: dt.date | None) -> dt.date:
    """Elige el año de una fecha sin año (temporada start_year/start_year+1).

    Los ficheros antiguos van ordenados por grupo, así que las fechas no son
    crecientes. Se usa el día de la semana para desambiguar y, si no basta,
    la cercanía a la fecha anterior.
    """
    candidates = []
    for y in (start_year, start_year + 1):
        try:
            candidates.append(dt.date(y, month, day))
        except ValueError:  # 29 de febrero en año no bisiesto
            pass
    matching = [c for c in candidates if WEEKDAYS[c.weekday()] == weekday]
    if len(matching) == 1:
        return matching[0]
    pool = matching or candidates
    if prev is None:
        return pool[0] if month >= 6 else pool[-1]
    return min(pool, key=lambda c: abs((c - prev).days))


def parse_file(path: str | Path, unparsed: list | None = None) -> list[Match]:
    """Lee un fichero Football.TXT. Las líneas no reconocidas se añaden a `unparsed`."""
    path = Path(path)
    lines = path.read_text(encoding="utf-8").splitlines()
    competition = qualifying = season = None
    start_year = None
    stage_raw = ""
    cur_date: dt.date | None = None
    matches: list[Match] = []

    for lineno, line in enumerate(lines, start=1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        m = HEADER_RE.match(line)
        if m:
            competition, qualifying = competition_from_header(m.group("name"))
            start_year = int(m.group("y1"))
            season = f"{start_year}-{m.group('y2')}"
            continue
        m = STAGE_RE.match(line)
        if m:
            stage_raw = m.group("stage")
            continue
        m = DATE_RE.match(line)
        if m:
            month, day = MONTHS[m.group("mon")], int(m.group("day"))
            if m.group("year"):
                cur_date = dt.date(int(m.group("year")), month, day)
            else:
                cur_date = _infer_date(start_year, month, day, m.group("wd"), cur_date)
            continue
        m = MATCH_RE.match(line)
        if m and cur_date is not None and season is not None:
            hg, ag, aet, pens = parse_score(m.group("score"))
            if m.group("score") and hg is None and unparsed is not None:
                unparsed.append((str(path), lineno, line))
            matches.append(Match(
                competition=competition,
                qualifying=qualifying,
                season=season,
                stage=normalize_stage(stage_raw, qualifying),
                stage_raw=stage_raw,
                date=cur_date,
                home=m.group("home").strip(),
                home_country=m.group("hc"),
                away=m.group("away").strip(),
                away_country=m.group("ac"),
                home_goals=hg,
                away_goals=ag,
                extra_time=aet,
                penalties=pens,
            ))
            continue
        if unparsed is not None:
            unparsed.append((str(path), lineno, line))

    _mark_neutral(matches)
    return matches


def _mark_neutral(matches: list[Match]) -> None:
    """Marca los partidos en campo neutral.

    - Las finales se juegan siempre en sede neutral.
    - En 2019-20 (COVID) cuartos, semifinales y final se jugaron a partido
      único en Lisboa (desde el 12 de agosto de 2020).
    """
    for mt in matches:
        if mt.stage == "final":
            mt.neutral = True
        if mt.competition == "UCL" and mt.season == "2019-20" and mt.date >= dt.date(2020, 8, 12):
            mt.neutral = True
