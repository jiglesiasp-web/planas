#!/usr/bin/env python3
"""Comprueba el contraste WCAG 2.x de cada pareja de tokens.json (AA: 4.5 texto, 3 texto grande y UI)."""
import json, pathlib, sys

t = json.loads((pathlib.Path(__file__).parent / "tokens.json").read_text(encoding="utf-8"))

def lum(hexa):
    r, g, b = (int(hexa[i:i + 2], 16) / 255 for i in (1, 3, 5))
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)

fails = 0
for pair in t["pairs"]:
    fg, bg = pair[0], pair[1]
    kind = pair[2] if len(pair) > 2 else "text"
    a, b = lum(t["color"][fg]), lum(t["color"][bg])
    ratio = (max(a, b) + 0.05) / (min(a, b) + 0.05)
    need = 4.5 if kind == "text" else 3.0
    ok = ratio >= need
    fails += not ok
    print(f"{'OK  ' if ok else 'FAIL'} {ratio:5.2f}:1 (min {need})  {fg} sobre {bg} [{kind}]")
print(f"\n{len(t['pairs'])} parejas, {fails} fallos AA")
sys.exit(1 if fails else 0)
