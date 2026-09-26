"""Build the From Here tile set: global 5x5 degree tiles with a 0.02 degree place raster.

Each cell holds an id into the tile's name table. Painting order decides priority:
open water < sea/ocean < country < state/province (only on country land) < lake.
Borders and coastlines are drawn later from label changes, so no polylines are stored.

Inputs (data/raw, gitignored; see README "Data"):
  Natural Earth 1:50m countries, lakes, marine polygons and 1:10m states/provinces (public domain)
  GeoNames cities15000 + admin1CodesASCII (CC BY 4.0)
Outputs:
  docs/tiles/<lat0>_<lon0>.json   one per tile (lat0 in -90..85, lon0 in -180..175, step 5)
  docs/overview.json              1 degree land mask + town counts, for the globe and suggestions

Usage: python3 execution/build_tiles.py [--only LAT0_LON0 ...] [--workers N]
"""
from __future__ import annotations

import argparse
import json
import math
import multiprocessing as mp
import sys
import time
import unicodedata
from dataclasses import dataclass
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
DOCS = ROOT / "docs"
TILE_DEG = 5
RES = 0.02
N = int(round(TILE_DEG / RES))  # 250 cells per side
TOWN_POP = 15000
OPEN_WATER = "Open water"
SMALL_WORDS = {"of", "de", "del", "la", "the", "and", "da", "do", "dos", "das"}


def ascii_name(text: str) -> str:
    """Watch system fonts are Latin; strip accents rather than risk missing glyphs."""
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii").strip()


def tidy_sea(name: str) -> str:
    words = name.title().split()
    return " ".join(w.lower() if i and w.lower() in SMALL_WORDS else w for i, w in enumerate(words))


# ---------------- geometry ----------------

@dataclass
class Feature:
    label: str
    is_land: bool
    country: str
    bbox: tuple[float, float, float, float]
    edges: np.ndarray  # (E, 4) lon0, lat0, lon1, lat1 across all rings (even-odd fill)


def feature_from(geom: dict, label: str, is_land: bool, country: str) -> Feature | None:
    if not geom:
        return None
    polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    segs = []
    for rings in polys:
        for ring in rings:
            a = np.asarray(ring, dtype=np.float64)[:, :2]
            if len(a) < 3:
                continue
            b = np.roll(a, -1, axis=0)
            segs.append(np.hstack([a, b]))
    if not segs:
        return None
    edges = np.vstack(segs)
    xs = np.concatenate([edges[:, 0], edges[:, 2]])
    ys = np.concatenate([edges[:, 1], edges[:, 3]])
    return Feature(label, is_land, country, (xs.min(), ys.min(), xs.max(), ys.max()), edges)


def rasterize(feature: Feature, lat0: float, lon0: float) -> np.ndarray:
    """Boolean N x N mask of cells whose centre lies inside the feature (even-odd rule)."""
    top = lat0 + TILE_DEG
    e = feature.edges
    ya, yb = e[:, 1], e[:, 3]
    keep = (np.maximum(ya, yb) >= lat0) & (np.minimum(ya, yb) <= top) & (ya != yb)
    e = e[keep]
    mask = np.zeros((N, N), dtype=bool)
    if not len(e):
        return mask
    x0, y0, x1, y1 = e[:, 0], e[:, 1], e[:, 2], e[:, 3]
    lo, hi = np.minimum(y0, y1), np.maximum(y0, y1)
    rows = top - (np.arange(N) + 0.5) * RES
    for r, y in enumerate(rows):
        hit = (lo <= y) & (y < hi)
        if not hit.any():
            continue
        xs = x0[hit] + (y - y0[hit]) * (x1[hit] - x0[hit]) / (y1[hit] - y0[hit])
        xs.sort()
        for a, b in zip(xs[0::2], xs[1::2]):
            c0 = max(0, math.ceil((a - lon0) / RES - 0.5))
            c1 = min(N, math.ceil((b - lon0) / RES - 0.5))
            if c1 > c0:
                mask[r, c0:c1] ^= True
    return mask


# ---------------- inputs ----------------

def load_features() -> dict[str, list[Feature]]:
    def load(name: str) -> list[dict]:
        return json.loads((RAW / name).read_text())["features"]

    countries = []
    for f in load("ne_50m_admin_0_countries.geojson"):
        p = f["properties"]
        name = ascii_name(p.get("NAME") or p.get("ADMIN") or "")
        feat = feature_from(f["geometry"], name, True, name)
        if feat and name:
            countries.append(feat)
    states = []
    for f in load("ne_10m_admin_1_states_provinces.geojson"):
        p = f["properties"]
        state, admin = ascii_name(p.get("name") or ""), ascii_name(p.get("admin") or "")
        if not state:
            continue
        # US states read alone ("Ohio"); elsewhere the country follows ("Ontario, Canada").
        label = state if admin in ("United States of America", state) else f"{state}, {country_short(admin)}"
        feat = feature_from(f["geometry"], label, True, admin)
        if feat:
            states.append(feat)
    lakes = []
    for f in load("ne_50m_lakes.geojson"):
        p = f["properties"]
        name = ascii_name(p.get("name") or p.get("name_en") or "")
        feat = feature_from(f["geometry"], name or "Lake", False, "")
        if feat:
            lakes.append(feat)
    seas = []
    for f in load("ne_50m_geography_marine_polys.geojson"):
        p = f["properties"]
        name = ascii_name(p.get("name") or p.get("label") or "")
        feat = feature_from(f["geometry"], tidy_sea(name) if name else OPEN_WATER, False, "")
        if feat:
            seas.append(feat)
    # Big seas first so named gulfs and bays inside them win.
    seas.sort(key=lambda f: -(f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
    return {"seas": seas, "countries": countries, "states": states, "lakes": lakes}


COUNTRY_SHORT = {"United States of America": "USA", "Democratic Republic of the Congo": "DR Congo",
                 "Republic of the Congo": "Congo", "United Kingdom": "UK", "United Arab Emirates": "UAE"}


def country_short(name: str) -> str:
    return COUNTRY_SHORT.get(name, name)


def country_names_by_iso() -> dict[str, str]:
    """ISO alpha-2 -> short country name, so a town names its own country (not the point's)."""
    names = {}
    for f in json.loads((RAW / "ne_50m_admin_0_countries.geojson").read_text())["features"]:
        p = f["properties"]
        iso = p.get("ISO_A2") if p.get("ISO_A2") not in (None, "-99") else p.get("ISO_A2_EH")
        if iso and iso != "-99":
            names[iso] = country_short(ascii_name(p.get("NAME") or p.get("ADMIN") or ""))
    return names


def load_towns() -> list[tuple[str, float, float, int, str, str, str]]:
    countries = country_names_by_iso()
    admin1 = {}
    for line in (RAW / "admin1CodesASCII.txt").read_text(encoding="utf-8").splitlines():
        parts = line.split("\t")
        if len(parts) >= 3:
            admin1[parts[0]] = parts[2]  # ASCII name
    towns = []
    with (RAW / "cities15000.txt").open(encoding="utf-8") as fh:
        for line in fh:
            c = line.rstrip("\n").split("\t")
            pop = int(c[14] or 0)
            if pop < TOWN_POP:
                continue
            name = ascii_name(c[2] or c[1])
            if not name:
                continue
            towns.append((name, float(c[4]), float(c[5]), pop, c[8], ascii_name(admin1.get(f"{c[8]}.{c[10]}", "")), countries.get(c[8], "")))
    return towns


# ---------------- tiles ----------------

LAYERS: dict[str, list[Feature]] = {}
TOWNS: list = []


def overlaps(f: Feature, lat0: float, lon0: float) -> bool:
    x0, y0, x1, y1 = f.bbox
    return x1 >= lon0 and x0 <= lon0 + TILE_DEG and y1 >= lat0 and y0 <= lat0 + TILE_DEG


def build_tile(key: tuple[int, int]) -> tuple[str, int, int]:
    lat0, lon0 = key
    names: list[list] = [[OPEN_WATER, 0, -1]]
    countries: list[str] = []
    index: dict[tuple[str, bool, str], int] = {(OPEN_WATER, False, ""): 0}
    raster = np.zeros((N, N), dtype=np.int32)

    def name_id(label: str, is_land: bool, country: str) -> int:
        k = (label, is_land, country)
        if k not in index:
            if country and country not in countries:
                countries.append(country)
            index[k] = len(names)
            names.append([label, 1 if is_land else 0, countries.index(country) if country else -1])
        return index[k]

    for f in LAYERS["seas"]:
        if overlaps(f, lat0, lon0):
            m = rasterize(f, lat0, lon0)
            if m.any():
                raster[m] = name_id(f.label, False, "")
    land = np.zeros((N, N), dtype=bool)
    for f in LAYERS["countries"]:
        if overlaps(f, lat0, lon0):
            m = rasterize(f, lat0, lon0)
            if m.any():
                raster[m] = name_id(f.label, True, f.country)
                land |= m
    for f in LAYERS["states"]:
        if overlaps(f, lat0, lon0):
            m = rasterize(f, lat0, lon0) & land  # coastline stays the countries layer's
            if m.any():
                raster[m] = name_id(f.label, True, f.country)
    for f in LAYERS["lakes"]:
        if overlaps(f, lat0, lon0):
            m = rasterize(f, lat0, lon0)
            if m.any():
                raster[m] = name_id(f.label, False, "")
    tile: dict = {"v": 1, "lat0": lat0, "lon0": lon0, "deg": TILE_DEG, "n": N, "names": names, "countries": countries}
    if (raster == raster[0, 0]).all():
        tile["fill"] = int(raster[0, 0])
    else:
        rows = []
        for r in range(N):
            row = raster[r]
            change = np.flatnonzero(np.diff(row)) + 1
            starts = np.concatenate([[0], change])
            lengths = np.diff(np.concatenate([starts, [N]]))
            rows.append([int(v) for pair in zip(lengths, row[starts]) for v in pair])
        tile["rows"] = rows
    tile["towns"] = [[n, round(la, 4), round(lo, 4), p, cc, a1, cn] for n, la, lo, p, cc, a1, cn in TOWNS
                     if lat0 <= la < lat0 + TILE_DEG and lon0 <= lo < lon0 + TILE_DEG]
    path = DOCS / "tiles" / f"{lat0}_{lon0}.json"
    text = json.dumps(tile, separators=(",", ":"))
    path.write_text(text)
    return path.name, len(text), int(land.sum())


def build_overview() -> None:
    """1 degree land mask (from the tiles' land share) and town counts, row 0 = 89..90N."""
    land = np.zeros((180, 360), dtype=np.uint8)
    for f in LAYERS["countries"]:
        # Sample the country raster coarsely: centre of each 1 degree cell.
        x0, y0, x1, y1 = f.bbox
        for r in range(max(0, int(90 - y1) - 1), min(180, int(90 - y0) + 1)):
            lat = 89.5 - r
            e = f.edges
            ya, yb = e[:, 1], e[:, 3]
            hit = (np.minimum(ya, yb) <= lat) & (lat < np.maximum(ya, yb))
            if not hit.any():
                continue
            h = e[hit]
            xs = np.sort(h[:, 0] + (lat - h[:, 1]) * (h[:, 2] - h[:, 0]) / (h[:, 3] - h[:, 1]))
            for a, b in zip(xs[0::2], xs[1::2]):
                c0 = max(0, math.ceil(a + 180 - 0.5))
                c1 = min(360, math.ceil(b + 180 - 0.5))
                if c1 > c0:
                    land[r, c0:c1] ^= 1
    towns = np.zeros((180, 360), dtype=np.int32)
    for _, la, lo, _, _, _, _ in TOWNS:
        towns[min(179, int(90 - la)), min(359, int(lo + 180))] += 1
    rle = []
    for row in land:
        change = np.flatnonzero(np.diff(row)) + 1
        starts = np.concatenate([[0], change])
        lengths = np.diff(np.concatenate([starts, [360]]))
        rle.append([int(row[0])] + [int(v) for v in lengths])
    sparse = [[int(r), int(c), int(towns[r, c])] for r, c in zip(*np.nonzero(towns))]
    (DOCS / "overview.json").write_text(json.dumps({"v": 1, "land": rle, "towns": sparse}, separators=(",", ":")))


def init_worker(layers, towns) -> None:
    LAYERS.update(layers)
    TOWNS[:] = towns


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", help="tiles as LAT0_LON0, e.g. 40_-85")
    ap.add_argument("--workers", type=int, default=max(1, (mp.cpu_count() or 2) - 1))
    args = ap.parse_args()
    for name in ("ne_50m_admin_0_countries.geojson", "ne_10m_admin_1_states_provinces.geojson",
                 "ne_50m_lakes.geojson", "ne_50m_geography_marine_polys.geojson", "cities15000.txt", "admin1CodesASCII.txt"):
        if not (RAW / name).is_file():
            print(f"Missing input data/raw/{name}; see README 'Data'.", file=sys.stderr)
            return 1
    started = time.time()
    layers = load_features()
    towns = load_towns()
    init_worker(layers, towns)
    (DOCS / "tiles").mkdir(parents=True, exist_ok=True)
    keys = [(la, lo) for la in range(-90, 90, TILE_DEG) for lo in range(-180, 180, TILE_DEG)]
    if args.only:
        keys = [tuple(int(v) for v in k.split("_")) for k in args.only]
    total, land_cells = 0, 0
    ctx = mp.get_context("fork")
    with ctx.Pool(args.workers) as pool:
        for i, (name, size, land) in enumerate(pool.imap_unordered(build_tile, keys, chunksize=4), 1):
            total += size
            land_cells += land
            if i % 200 == 0 or i == len(keys):
                print(f"{i}/{len(keys)} tiles, {total / 1e6:.1f} MB, {time.time() - started:.0f}s", flush=True)
    if not args.only:
        build_overview()
    print(f"done: {len(keys)} tiles, {total / 1e6:.1f} MB, land cells {land_cells}, {time.time() - started:.0f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
