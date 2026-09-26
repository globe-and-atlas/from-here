"""The phone renderer's Hour frame agrees with Natural Earth itself (contract: within 2% of pixels).

watchface/test/render.test.js writes .tmp/golden_hour_frame.json (Spring TX, NE, 10:42). The local
projection is linear in latitude and longitude, so every pixel row is one latitude: rasterize the
source polygons (countries minus lakes) along each row and compare land/water per pixel.
"""
from __future__ import annotations

import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "execution"))
import build_tiles  # noqa: E402

GOLDEN = ROOT / ".tmp" / "golden_hour_frame.json"


def row_mask(features, lat: float, lons: np.ndarray) -> np.ndarray:
    inside = np.zeros(len(lons), dtype=bool)
    for f in features:
        x0, y0, x1, y1 = f.bbox
        if lat < y0 or lat > y1 or x1 < lons[0] or x0 > lons[-1]:
            continue
        e = f.edges
        ya, yb = e[:, 1], e[:, 3]
        hit = (np.minimum(ya, yb) <= lat) & (lat < np.maximum(ya, yb))
        if not hit.any():
            continue
        h = e[hit]
        xs = h[:, 0] + (lat - h[:, 1]) * (h[:, 2] - h[:, 0]) / (h[:, 3] - h[:, 1])
        crossings = (xs[None, :] < lons[:, None]).sum(axis=1)
        inside ^= (crossings % 2 == 1)
    return inside


@pytest.fixture(scope="module")
def golden():
    if not GOLDEN.exists():
        subprocess.run(["node", "--test", "--test-name-pattern", "golden", "test/render.test.js"], cwd=ROOT / "watchface", check=True)
    return json.loads(GOLDEN.read_text())


def test_hour_frame_matches_natural_earth(golden):
    layers = build_tiles.load_features()
    w, h, kpp = golden["w"], golden["h"], golden["kmPerPx"]
    clat, clon = golden["center"]["lat"], golden["center"]["lon"]
    k = math.cos(math.radians(clat))
    lons = clon + (np.arange(w) + 0.5 - w / 2) * kpp / (111.32 * k)
    ours = np.array(golden["land"], dtype=bool).reshape(h, w)
    truth = np.zeros((h, w), dtype=bool)
    for y in range(h):
        lat = clat - (y + 0.5 - h / 2) * kpp / 110.57
        truth[y] = row_mask(layers["countries"], lat, lons) & ~row_mask(layers["lakes"], lat, lons)
    mismatch = (ours != truth).mean()
    assert truth.mean() > 0.3, "fixture frame should contain land"
    assert mismatch < 0.02, f"{mismatch:.2%} of pixels disagree with Natural Earth"
