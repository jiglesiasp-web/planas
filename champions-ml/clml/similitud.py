"""Parecido entre nombres de equipos de distintas fuentes (para proponer emparejamientos)."""

from __future__ import annotations

import difflib
import re
import unicodedata

# Palabras que no ayudan a distinguir clubes ("FC", "Club", "de"...).
STOP = {"fc", "cf", "afc", "sc", "sk", "fk", "cd", "ud", "sd", "rcd", "rc", "ca", "club", "de", "la",
        "el", "the", "ac", "as", "ssc", "ss", "acf", "bc", "sl", "vfl", "vfb", "tsg", "bk", "if", "ff",
        "kv", "krc", "rsc", "kaa", "nk", "gnk", "hnk", "pfc", "cfr", "kf", "sv", "us", "ogc", "hsc",
        "losc", "stade", "calcio", "futbol", "football", "cp", "sad", "ks", "mfk", "fsv", "tsv", "spvgg"}


def fold_tokens(name: str) -> list[str]:
    t = unicodedata.normalize("NFKD", name)
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    t = re.sub(r"[^a-z0-9 ]", " ", t)
    return [w for w in t.split() if w not in STOP and not w.isdigit()]


def similarity(a: str, b: str) -> float:
    A, B = fold_tokens(a), fold_tokens(b)
    if not A or not B:
        return 0.0
    ratio = difflib.SequenceMatcher(None, " ".join(A), " ".join(B)).ratio()
    overlap = len(set(A) & set(B)) / min(len(set(A)), len(set(B)))
    prefix = any(x[:4] == y[:4] for x in A for y in B if len(x) >= 4 and len(y) >= 4)
    return max(ratio, overlap * 0.95, 0.75 if prefix else 0.0)


# Palabras que pueden sobrar en un nombre sin que cambie el club
# ("Watford FC" = "Watford", "Derby County" = "Derby", "Real Zaragoza" = "Zaragoza").
GENERIC = {"city", "town", "county", "united", "athletic", "albion", "wanderers", "rovers",
           "real", "hotspur", "borough", "olympique", "sporting", "deportivo", "cfc", "football",
           "fc", "club", "calcio", "spor", "kulubu", "jk", "if", "fk", "sk", "bk", "ik", "aik"}


def _strict_tokens(name: str) -> list[str]:
    t = unicodedata.normalize("NFKD", name.replace("'", ""))
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    t = re.sub(r"[^a-z0-9 ]", " ", t)
    return [w for w in t.split() if w not in STOP and not w.isdigit()]


def strict_compatible(long_name: str, short_name: str) -> bool:
    """True si `short_name` es una forma abreviada de `long_name`.

    Cada palabra del nombre corto debe estar en el largo (o, si es una
    abreviatura de 2 a 4 letras, ser el principio de una palabra suya:
    "Man" -> "Manchester"), y las palabras que sobran del largo deben ser
    genéricas.
    """
    L, S = _strict_tokens(long_name), _strict_tokens(short_name)
    if not L or not S:
        return False
    used = set()
    for t in S:
        hit = next((i for i, u in enumerate(L) if i not in used and
                    (u == t or (2 <= len(t) <= 4 and u.startswith(t)))), None)
        if hit is None:
            return False
        used.add(hit)
    return all(i in used or u in GENERIC for i, u in enumerate(L))


def strict_match(name: str, candidates) -> str | None:
    """Candidato único compatible con `name` (en cualquier sentido), o None si no hay o es ambiguo."""
    if name in candidates:
        return name
    hits = [c for c in candidates if strict_compatible(name, c) or strict_compatible(c, name)]
    if len(hits) == 1:
        return hits[0]
    return None
