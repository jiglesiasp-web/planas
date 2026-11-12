#!/usr/bin/env python3
"""Prepara los datos geográficos reales de la vista 3D y escribe lib/geodata.js.

Solo hace falta volver a ejecutarlo si se quiere actualizar la ortofoto.
Uso (desde la carpeta el-pegoli):  python3 tools/geodatos.py [carpeta_cache]
Necesita: numpy, scipy, Pillow.

Fuentes (todas de uso libre con atribución):
  - Ortofoto PNOA, Instituto Geográfico Nacional, CC BY 4.0
  - Edificios: colaboradores de OpenStreetMap, ODbL
  - Relieve: Terrain Tiles (Mapzen / AWS Open Data)
"""
import base64
import io
import json
import math
import os
import pathlib
import sys
import urllib.request
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "tools" / ".geocache"
CACHE.mkdir(parents=True, exist_ok=True)
UA = {"User-Agent": "static-site-builder/1.0"}

LAT, LON = 38.83373, 0.13739          # centro: el restaurante (OpenStreetMap)
M_LAT = 110996.0
M_LON = 111320.0 * math.cos(math.radians(LAT))
RESTAURANT_WAY = "442574827"

# x = este, z = sur, en metros
NEAR = {"cx": 0.0, "cz": 40.0, "size": 512.0, "px": 2048, "n": 256}
MID = {"cx": -200.0, "cz": 250.0, "size": 2048.0, "px": 2048, "n": 128}
FAR = {"cx": -600.0, "cz": 600.0, "size": 8192.0, "px": 2048, "n": 192}

# contorno aproximado del restaurante y sus terrazas (para rebajar la roca debajo)
FOOTPRINT = [(-13.5, -1.5), (-8, -11.5), (-5.5, -12.6), (-1.4, -16.8), (10, -19.3), (21.3, -19.1), (22.2, -8.8),
             (24.8, -5.2), (25.2, 0), (29.2, 9.2), (17, 13.4), (-5, 7.2), (-12.8, 5.6)]
CALA = (42.0, 23.0, 17.0)             # centro y radio de la cala de cantos


def lonlat(x, z):
    return LON + x / M_LON, LAT - z / M_LAT


def fetch(url, path):
    if not path.exists() or path.stat().st_size == 0:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=120) as r:
            path.write_bytes(r.read())
    return path


def ortho(area, name):
    x0, x1 = area["cx"] - area["size"] / 2, area["cx"] + area["size"] / 2
    z0, z1 = area["cz"] - area["size"] / 2, area["cz"] + area["size"] / 2
    lon0, lat1 = lonlat(x0, z0)
    lon1, lat0 = lonlat(x1, z1)
    url = ("https://www.ign.es/wms-inspire/pnoa-ma?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap"
           "&LAYERS=OI.OrthoimageCoverage&STYLES=&SRS=EPSG:4326&FORMAT=image/jpeg"
           "&BBOX=%.8f,%.8f,%.8f,%.8f&WIDTH=%d&HEIGHT=%d" % (lon0, lat0, lon1, lat1, area["px"], area["px"]))
    return Image.open(fetch(url, CACHE / (name + ".jpg"))).convert("RGB")


# ---------- relieve (teselas terrarium, zoom 12) ----------
Z = 12


def tile_xy(lon, lat):
    n = 2 ** Z
    x = (lon + 180.0) / 360.0 * n
    y = (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n
    return x, y


def load_dem():
    pts = [lonlat(FAR["cx"] + sx * FAR["size"] / 2, FAR["cz"] + sz * FAR["size"] / 2) for sx in (-1, 1) for sz in (-1, 1)]
    txy = [tile_xy(lo, la) for lo, la in pts]
    tx0, tx1 = int(min(t[0] for t in txy)), int(max(t[0] for t in txy))
    ty0, ty1 = int(min(t[1] for t in txy)), int(max(t[1] for t in txy))
    mosaic = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), dtype=np.float32)
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            p = fetch("https://s3.amazonaws.com/elevation-tiles-prod/terrarium/%d/%d/%d.png" % (Z, tx, ty), CACHE / ("dem_%d_%d.png" % (tx, ty)))
            a = np.asarray(Image.open(p).convert("RGB"), dtype=np.float32)
            mosaic[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
    return mosaic, tx0, ty0


DEM, TX0, TY0 = load_dem()


def dem_at(x, z):
    """Altura del terreno (m) en coordenadas locales; x y z pueden ser matrices."""
    lon = LON + x / M_LON
    lat = LAT - z / M_LAT
    n = 2 ** Z
    px = ((lon + 180.0) / 360.0 * n - TX0) * 256 - 0.5
    py = ((1.0 - np.arcsinh(np.tan(np.radians(lat))) / math.pi) / 2.0 * n - TY0) * 256 - 0.5
    return ndimage.map_coordinates(DEM, [py, px], order=1, mode="nearest")


def grid(area):
    n = area["n"]
    xs = area["cx"] - area["size"] / 2 + (np.arange(n) + 0.5) * area["size"] / n
    zs = area["cz"] - area["size"] / 2 + (np.arange(n) + 0.5) * area["size"] / n
    return np.meshgrid(xs, zs)


def b64_u16(a, h0, scale):
    q = np.clip(np.round((a - h0) * scale), 0, 65535).astype("<u2")
    return base64.b64encode(q.tobytes()).decode("ascii")


def data_uri(img, quality):
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=quality, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode("ascii"), len(buf.getvalue())


# ---------- zona cercana: máscara de mar, distancia a la costa y alturas ----------
near_img = ortho(NEAR, "orto_cerca")
M = 512                                               # 1 m por píxel
small = np.asarray(near_img.resize((M, M), Image.LANCZOS), dtype=np.float32)
r, g, b = small[..., 0], small[..., 1], small[..., 2]
v = small.max(axis=2)
sea_like = (v < 112) & ((g + b) > 1.55 * r)
sea_like = ndimage.binary_opening(sea_like, structure=np.ones((3, 3)))
lab, _ = ndimage.label(sea_like)
edge = set(np.unique(lab[0, :])) | set(np.unique(lab[: M // 3, 0])) | set(np.unique(lab[: M // 3, -1]))
edge.discard(0)
sea = np.isin(lab, list(edge))
sea = ndimage.binary_closing(sea, structure=np.ones((3, 3)))
# quita destellos y motas: trozos de "tierra" de menos de 14 m2 dentro del mar
land_lab, nl = ndimage.label(~sea)
sizes = ndimage.sum(~sea, land_lab, index=np.arange(1, nl + 1))
for i, s in enumerate(sizes, start=1):
    if s < 14:
        sea[land_lab == i] = True
# la plataforma del restaurante es tierra aunque la terraza vuele sobre el agua
fp = Image.new("L", (M, M), 0)
to_px = lambda p: ((p[0] - (NEAR["cx"] - NEAR["size"] / 2)) * M / NEAR["size"], (p[1] - (NEAR["cz"] - NEAR["size"] / 2)) * M / NEAR["size"])
ImageDraw.Draw(fp).polygon([to_px(p) for p in FOOTPRINT], fill=255)
inside = np.asarray(fp) > 0

sd = ndimage.distance_transform_edt(~sea) - ndimage.distance_transform_edt(sea)   # + tierra, - mar (m)
X, Zc = np.meshgrid(NEAR["cx"] - NEAR["size"] / 2 + (np.arange(M) + 0.5), NEAR["cz"] - NEAR["size"] / 2 + (np.arange(M) + 0.5))
dem_near = np.maximum(dem_at(X, Zc), 0)
dem_near = ndimage.gaussian_filter(dem_near, 6)


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


cliff = 2.5 * smooth(0, 3.2, sd)
land_h = cliff + (np.maximum(dem_near, 2.5) - 2.5) * smooth(4, 55, sd)
cala = (np.hypot(X - CALA[0], Zc - CALA[1]) < CALA[2])
cala_w = smooth(CALA[2], CALA[2] * 0.6, np.hypot(X - CALA[0], Zc - CALA[1]))
land_h = land_h * (1 - cala_w) + np.minimum(land_h, 0.15 + sd * 0.1) * cala_w
sea_h = -np.minimum(7.0, 0.35 + (-sd) * 0.22)
h = np.where(sd > 0, land_h, sea_h)
h = np.where(inside, np.minimum(h, 1.2), h)
h = ndimage.gaussian_filter(h, 0.8)
near_h = h.reshape(NEAR["n"], M // NEAR["n"], NEAR["n"], M // NEAR["n"]).mean(axis=(1, 3))

# ---------- arbolado: manchas verde oscuro de la ortofoto, para darles volumen ----------
green = (~sea) & (v < 96) & (g > r * 1.04) & (g > b * 1.1)
green = ndimage.binary_opening(green, structure=np.ones((3, 3)))
tl, nt = ndimage.label(green)
trees = []
for i, sl in enumerate(ndimage.find_objects(tl), start=1):
    blob = tl[sl] == i
    area = int(blob.sum())
    if area < 10:
        continue
    if area <= 110:
        cy, cx = ndimage.center_of_mass(blob)
        cells = [(sl[1].start + cx, sl[0].start + cy, math.sqrt(area / math.pi))]
    else:
        # masa de árboles: una copa cada 5 m
        cells = []
        for yy in range(sl[0].start, sl[0].stop, 5):
            for xx in range(sl[1].start, sl[1].stop, 5):
                win = tl[yy:yy + 5, xx:xx + 5] == i
                if win.sum() >= 12:
                    oy, ox = ndimage.center_of_mass(win)
                    cells.append((xx + ox, yy + oy, 2.6 + (win.sum() - 12) / 13 * 0.9))
    for px_, py_, rad in cells:
        wx = NEAR["cx"] - NEAR["size"] / 2 + px_ + 0.5
        wz = NEAR["cz"] - NEAR["size"] / 2 + py_ + 0.5
        if inside[int(min(M - 1, py_)), int(min(M - 1, px_))]:
            continue
        trees.append([round(wx, 1), round(wz, 1), round(min(rad, 4.5), 1)])

# ---------- zona intermedia y lejana ----------
mid_img = ortho(MID, "orto_medio")
MX, MZ = grid(MID)
mid_h = dem_at(MX, MZ)
mid_h = np.where(mid_h <= 0.3, -3.0, mid_h)

far_img = ortho(FAR, "orto_lejos")
FX, FZ = grid(FAR)
far_h = dem_at(FX, FZ)
far_h = np.where(far_h <= 0.3, -3.0, far_h)

# ---------- edificios vecinos (OpenStreetMap) ----------
x0, z0 = NEAR["cx"] - NEAR["size"] / 2, NEAR["cz"] - NEAR["size"] / 2
lon_a, lat_b = lonlat(x0, z0)
lon_b, lat_a = lonlat(x0 + NEAR["size"], z0 + NEAR["size"])
osm = fetch("https://api.openstreetmap.org/api/0.6/map?bbox=%.6f,%.6f,%.6f,%.6f" % (lon_a, lat_a, lon_b, lat_b), CACHE / "osm.xml")
tree = ET.parse(osm).getroot()
nodes = {n.get("id"): (float(n.get("lon")), float(n.get("lat"))) for n in tree.findall("node")}
buildings = []
for w in tree.findall("way"):
    tags = {t.get("k"): t.get("v") for t in w.findall("tag")}
    if "building" not in tags or w.get("id") == RESTAURANT_WAY:
        continue
    pts = [nodes[nd.get("ref")] for nd in w.findall("nd") if nd.get("ref") in nodes]
    if len(pts) < 4:
        continue
    loc = [((lo - LON) * M_LON, -(la - LAT) * M_LAT) for lo, la in pts[:-1]]
    cx = sum(p[0] for p in loc) / len(loc)
    cz = sum(p[1] for p in loc) / len(loc)
    if abs(cx - NEAR["cx"]) > NEAR["size"] / 2 - 8 or abs(cz - NEAR["cz"]) > NEAR["size"] / 2 - 8:
        continue
    try:
        levels = float(tags.get("building:levels", 2))
    except ValueError:
        levels = 2
    flat = [round(levels, 1)]
    for p in loc:
        flat += [round(p[0], 1), round(p[1], 1)]
    buildings.append(flat)

# ---------- salida ----------
near_uri, near_bytes = data_uri(near_img, 72)
mid_uri, mid_bytes = data_uri(mid_img.resize((1024, 1024), Image.LANCZOS), 70)
far_uri, far_bytes = data_uri(far_img.resize((1024, 1024), Image.LANCZOS), 70)
geo = {
    "credit": "Ortofoto: PNOA © Instituto Geográfico Nacional (CC BY 4.0). Edificios: © colaboradores de OpenStreetMap. Relieve: Terrain Tiles (Mapzen/AWS).",
    "near": {"cx": NEAR["cx"], "cz": NEAR["cz"], "size": NEAR["size"], "n": NEAR["n"], "h0": -10, "scale": 500, "heights": b64_u16(near_h, -10, 500)},
    "mid": {"cx": MID["cx"], "cz": MID["cz"], "size": MID["size"], "n": MID["n"], "h0": -100, "scale": 60, "heights": b64_u16(mid_h, -100, 60)},
    "far": {"cx": FAR["cx"], "cz": FAR["cz"], "size": FAR["size"], "n": FAR["n"], "h0": -100, "scale": 60, "heights": b64_u16(far_h, -100, 60)},
    "buildings": buildings,
    "trees": trees,
    "orto": {"cerca": near_uri, "medio": mid_uri, "lejos": far_uri},
}
out = ROOT / "lib" / "geodata.js"
out.write_text("/* Datos geográficos reales de la vista 3D. Generado por tools/geodatos.py; no editar a mano. */\n"
               "window.__PEGOLI_GEO__ = " + json.dumps(geo, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")

# imagen de comprobación de la máscara de costa
chk = np.asarray(near_img.resize((M, M)), dtype=np.float32).copy()
chk[sea] = chk[sea] * 0.45 + np.array([0, 60, 160]) * 0.55
for t in trees:
    tx, tz = int(t[0] - (NEAR["cx"] - NEAR["size"] / 2)), int(t[1] - (NEAR["cz"] - NEAR["size"] / 2))
    chk[max(0, tz - 1):tz + 2, max(0, tx - 1):tx + 2] = [255, 40, 200]
Image.fromarray(chk.astype("uint8")).save(CACHE / "check_mask.jpg", quality=85)
hv = np.clip((near_h + 8) / 40 * 255, 0, 255).astype("uint8")
Image.fromarray(hv).resize((512, 512)).save(CACHE / "check_height.png")
print("ortofoto cercana %d KB, media %d KB, lejana %d KB" % (near_bytes // 1024, mid_bytes // 1024, far_bytes // 1024))
print("copas", len(trees))
print("edificios", len(buildings), "| altura cercana %.1f..%.1f m | lejana %.0f..%.0f m" % (near_h.min(), near_h.max(), far_h.min(), far_h.max()))
print("escrito", out, out.stat().st_size // 1024, "KB")
