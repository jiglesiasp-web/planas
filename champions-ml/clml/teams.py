"""Unificación de nombres de equipos.

openfootball cambió de nombres cortos ("Real Madrid") a nombres oficiales
("Real Madrid CF") a partir de 2023-24. Para que el historial de cada club
sea continuo, se traduce cada variante a un nombre canónico.

Solo se unifican variantes que son el mismo club. Clubes distintos con
nombres parecidos (CSKA Sofia / CSKA 1948 Sofia, FK Žalgiris / Kauno
Žalgiris, Víkingur de Islas Feroe / de Islandia) se mantienen separados.
"""

from __future__ import annotations

import difflib
import unicodedata

# (país, nombre en el fichero) -> (país, nombre canónico)
ALIASES: dict[tuple[str, str], tuple[str, str]] = {
    ("ENG", "Aston Villa FC"): ("ENG", "Aston Villa"),
    ("ENG", "Manchester City FC"): ("ENG", "Manchester City"),
    ("ENG", "Manchester United FC"): ("ENG", "Manchester United"),
    ("ENG", "Tottenham Hotspur FC"): ("ENG", "Tottenham Hotspur"),
    ("ENG", "Newcastle United FC"): ("ENG", "Newcastle United"),
    ("ESP", "Club Atlético de Madrid"): ("ESP", "Atlético Madrid"),
    ("ESP", "Real Madrid CF"): ("ESP", "Real Madrid"),
    ("ESP", "Real Sociedad de Fútbol"): ("ESP", "Real Sociedad"),
    ("FRA", "Olympique de Marseille"): ("FRA", "Olympique Marseille"),
    ("FRA", "Paris Saint-Germain FC"): ("FRA", "Paris Saint-Germain"),
    ("FRA", "Racing Club de Lens"): ("FRA", "RC Lens"),
    # El Mónaco juega la liga francesa: se le asigna Francia.
    ("MCO", "AS Monaco FC"): ("FRA", "AS Monaco"),
    ("GER", "Bayer 04 Leverkusen"): ("GER", "Bayer Leverkusen"),
    ("GER", "FC Bayern München"): ("GER", "Bayern München"),
    ("ITA", "Atalanta BC"): ("ITA", "Atalanta"),
    ("ITA", "FC Internazionale Milano"): ("ITA", "Inter"),
    ("ITA", "Juventus FC"): ("ITA", "Juventus"),
    ("ITA", "SS Lazio"): ("ITA", "Lazio Roma"),
    ("NED", "Feyenoord Rotterdam"): ("NED", "Feyenoord"),
    ("NED", "PSV Eindhoven"): ("NED", "PSV"),
    ("POR", "Sport Lisboa e Benfica"): ("POR", "SL Benfica"),
    ("POR", "Sporting Clube de Braga"): ("POR", "Sporting Braga"),
    ("POR", "Sporting Clube de Portugal"): ("POR", "Sporting CP"),
    ("AUT", "FC Red Bull Salzburg"): ("AUT", "RB Salzburg"),
    ("AUT", "SK Sturm Graz"): ("AUT", "Sturm Graz"),
    ("AZE", "Qarabağ Ağdam FK"): ("AZE", "Qarabağ FK"),
    ("BEL", "Royale Union Saint-Gilloise"): ("BEL", "Union Saint-Gilloise"),
    ("CRO", "GNK Dinamo Zagreb"): ("CRO", "Dinamo Zagreb"),
    ("CYP", "Pafos FC"): ("CYP", "Paphos FC"),
    ("CZE", "SK Slavia Praha"): ("CZE", "Slavia Praha"),
    ("GRE", "PAE Olympiakos SFP"): ("GRE", "Olympiakos Piraeus"),
    ("KOS", "Drita Gjilan"): ("KOS", "KF Drita"),
    ("ROU", "FC Steaua Bucureşti"): ("ROU", "FCSB"),
    ("SRB", "FK Crvena Zvezda"): ("SRB", "Crvena Zvezda"),
    ("SVK", "ŠK Slovan Bratislava"): ("SVK", "Slovan Bratislava"),
    ("TUR", "Galatasaray SK"): ("TUR", "Galatasaray"),
    ("UKR", "FK Shakhtar Donetsk"): ("UKR", "Shakhtar Donetsk"),
}


def canonical(country: str, name: str) -> tuple[str, str]:
    return ALIASES.get((country, name), (country, name))


def team_id(country: str, name: str) -> str:
    c, n = canonical(country, name)
    return f"{n} ({c})"


def _fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return text.lower().replace(".", "").replace("-", " ").strip()


def find_team(query: str, known_ids: list[str]) -> str:
    """Busca un equipo por nombre aproximado (sin tildes ni mayúsculas).

    Acepta "real madrid", "Bayern", "atletico madrid", "psg"... Lanza
    ValueError con sugerencias si no hay una coincidencia clara.
    """
    q = _fold(query)
    shortcuts = {"psg": "paris saint germain", "barca": "fc barcelona",
                 "atleti": "atletico madrid", "man city": "manchester city",
                 "man united": "manchester united", "spurs": "tottenham hotspur"}
    q = shortcuts.get(q, q)
    folded = {_fold(t): t for t in known_ids}
    names_only = {_fold(t.rsplit(" (", 1)[0]): t for t in known_ids}

    for table in (folded, names_only):
        if q in table:
            return table[q]
    # Coincidencia por contenido ("bayern" -> "Bayern München (GER)").
    hits = sorted({t for f, t in names_only.items() if q in f})
    if len(hits) == 1:
        return hits[0]
    if len(hits) > 1:
        raise ValueError(f"'{query}' es ambiguo. Opciones: {', '.join(hits[:8])}")
    close = difflib.get_close_matches(q, list(names_only), n=5, cutoff=0.6)
    if len(close) >= 1 and difflib.SequenceMatcher(None, q, close[0]).ratio() > 0.85:
        return names_only[close[0]]
    sugerencias = ", ".join(names_only[c] for c in close) or "ninguna"
    raise ValueError(f"No encuentro el equipo '{query}'. ¿Quizá: {sugerencias}?")
