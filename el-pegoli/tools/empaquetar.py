#!/usr/bin/env python3
"""Empaqueta la web en un solo archivo HTML para verla sin servidor.

Uso (desde la carpeta el-pegoli):  python3 tools/empaquetar.py
Genera tools/vista-previa.html con estilos, scripts e imágenes incrustados.
Es solo para previsualizar: al hosting se sube la carpeta normal.
"""
import base64
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "tools" / "vista-previa.html"
MIME = {".webp": "image/webp", ".svg": "image/svg+xml"}


def data_uri(rel):
    p = ROOT / rel
    return "data:%s;base64,%s" % (MIME[p.suffix], base64.b64encode(p.read_bytes()).decode("ascii"))


def inline_assets(text):
    return re.sub(r"assets/[\w./-]+\.(?:webp|svg)", lambda m: data_uri(m.group(0)), text)


html = (ROOT / "index.html").read_text(encoding="utf-8")

# estilos
css = inline_assets((ROOT / "styles.css").read_text(encoding="utf-8"))
html = re.sub(r'<link rel="stylesheet" href="styles\.css[^"]*" />', lambda m: "<style>\n" + css + "\n</style>", html)
html = re.sub(r'\s*<link rel="preload" as="image"[^>]*/>', "", html)


# scripts, en el mismo orden
def inline_script(m):
    src = m.group(1).split("?")[0]
    js = (ROOT / src).read_text(encoding="utf-8").replace("</script", "<\\/script")
    return "<script>\n" + js + "\n</script>"


html = re.sub(r'<script defer src="([^"]+)"></script>', inline_script, html)
html = inline_assets(html)

OUT.write_text(html, encoding="utf-8")
print("Escrito %s (%d KB)" % (OUT.relative_to(ROOT), OUT.stat().st_size // 1024))
