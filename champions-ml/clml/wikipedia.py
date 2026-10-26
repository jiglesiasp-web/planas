"""Partidos de la temporada en curso a partir de Wikipedia (fase de liga de la Champions).

openfootball todavía no publica la temporada 2026-27, así que el calendario y
los resultados se leen de la página de Wikipedia de la fase de liga. Solo se
guardan los hechos (fecha, equipos, resultado) en data/champions_2026_27.csv.
"""

from __future__ import annotations

import csv
import datetime as dt
import re
from pathlib import Path

from .parse import Match
from .teams import load_manual_mapping

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SEASON = "2026-27"
CSV_PATH = DATA_DIR / "champions_2026_27.csv"
WIKI_URL = ("https://en.wikipedia.org/w/index.php?title="
            "2026%E2%80%9327_UEFA_Champions_League_league_phase&action=raw")

BOX_RE = re.compile(r"\{\{#invoke:[Ff]ootball box\|main(.*?)\n\}\}", re.S)
FIELD_RE = re.compile(r"^\|[ \t]*(\w+)[ \t]*=[ \t]*(.*)$", re.M)
DATE_RE = re.compile(r"Start date\|(\d{4})\|(\d{1,2})\|(\d{1,2})")
LINK_RE = re.compile(r"\[\[(?:[^\]|]*\|)?([^\]]+)\]\]")
FLAG_RE = re.compile(r"\{\{fbaicon\|([A-Z]{3})\}\}")
SCORE_RE = re.compile(r"^(\d+)\s*[–−-]\s*(\d+)")


def _team(text: str) -> tuple[str, str]:
    name = LINK_RE.search(text)
    flag = FLAG_RE.search(text)
    if not name or not flag:
        raise ValueError(f"No entiendo el equipo: {text!r}")
    return name.group(1).strip(), flag.group(1)


def parse_wikitext(text: str) -> list[dict]:
    """Lista de partidos: fecha, local, país, visitante, país, goles (None si no se ha jugado)."""
    out = []
    for box in BOX_RE.findall(text):
        fields = dict(FIELD_RE.findall(box))
        d = DATE_RE.search(fields.get("date", ""))
        if not d:
            continue
        home, hc = _team(fields["team1"])
        away, ac = _team(fields["team2"])
        s = SCORE_RE.match(fields.get("score", "").strip())
        out.append({"fecha": dt.date(int(d[1]), int(d[2]), int(d[3])).isoformat(),
                    "local": home, "pais_local": hc, "visitante": away, "pais_visitante": ac,
                    "goles_local": int(s[1]) if s else "", "goles_visitante": int(s[2]) if s else ""})
    return out


def save_csv(rows: list[dict], path: Path = CSV_PATH) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)


def load_season(eu_names: dict[str, set], path: Path = CSV_PATH) -> tuple[list[Match], list[Match]]:
    """(partidos jugados, partidos pendientes) con los nombres que usa el modelo.

    `eu_names`: país -> nombres europeos conocidos, para traducir los de Wikipedia.
    """
    from .similitud import strict_match

    manual = load_manual_mapping()

    def name(country: str, n: str) -> str:
        if (country, n) in manual and manual[(country, n)] != "-":
            return manual[(country, n)]
        return strict_match(n, eu_names.get(country, set())) or n

    played, pending = [], []
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            m = Match(competition="UCL", qualifying=False, season=SEASON, stage="league",
                      stage_raw="League phase", date=dt.date.fromisoformat(r["fecha"]),
                      home=name(r["pais_local"], r["local"]), home_country=r["pais_local"],
                      away=name(r["pais_visitante"], r["visitante"]), away_country=r["pais_visitante"],
                      home_goals=int(r["goles_local"]) if r["goles_local"] != "" else None,
                      away_goals=int(r["goles_visitante"]) if r["goles_visitante"] != "" else None)
            (played if m.played else pending).append(m)
    return played, pending
