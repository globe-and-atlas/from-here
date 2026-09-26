"""Tile set contract: full coverage, size budget, and correct labels at known places.

Natural Earth 1:10m admin-1 uses fine units in some countries (London boroughs, Italian provinces),
so those labels are the expected ones. Coastal cities are checked inland: at 0.02 degree resolution
Stockholm's archipelago and Quebec City's river front are water.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

TILES = Path(__file__).resolve().parents[1] / "docs" / "tiles"


def label(lat: float, lon: float) -> tuple[str, bool]:
    lat0 = int((lat + 90) // 5) * 5 - 90
    lon0 = int((lon + 180) // 5) * 5 - 180
    t = json.loads((TILES / f"{min(lat0, 85)}_{lon0}.json").read_text())
    if "fill" in t:
        entry = t["names"][t["fill"]]
    else:
        r = min(t["n"] - 1, int((t["lat0"] + 5 - lat) / 0.02))
        c = min(t["n"] - 1, int((lon - t["lon0"]) / 0.02))
        row, x = t["rows"][r], 0
        for i in range(0, len(row), 2):
            x += row[i]
            if c < x:
                entry = t["names"][row[i + 1]]
                break
    return entry[0], entry[1] == 1


def test_every_tile_exists():
    expected = {f"{la}_{lo}.json" for la in range(-90, 90, 5) for lo in range(-180, 180, 5)}
    assert expected <= {p.name for p in TILES.glob("*.json")}


def test_tile_set_under_100_mb():
    assert sum(p.stat().st_size for p in TILES.glob("*.json")) < 100e6


KNOWN = [
    ((40.78, -84.72), "Ohio", True), ((35.15, -90.05), "Tennessee", True), ((29.76, -95.37), "Texas", True),
    ((44.8, -82.0), "Lake Huron", False), ((42.2, -81.3), "Lake Erie", False), ((43.7, -79.4), "Ontario, Canada", True),
    ((47.5, -72.0), "Quebec, Canada", True), ((27.0, -92.0), "Gulf of Mexico", False), ((19.43, -99.13), "Distrito Federal, Mexico", True),
    ((25.7, -100.3), "Nuevo Leon, Mexico", True), ((28.0, -112.0), "Golfo de California", False), ((7.38, -72.65), "Norte de Santander, Colombia", True),
    ((-23.55, -46.63), "Sao Paulo, Brazil", True), ((-34.6, -58.38), "Ciudad de Buenos Aires, Argentina", True), ((51.48, 0.0), "Greenwich, UK", True),
    ((48.85, 2.35), "Paris, France", True), ((52.52, 13.4), "Berlin, Germany", True), ((41.9, 12.5), "Roma, Italy", True),
    ((62.0, 15.0), "Jamtland, Sweden", True), ((42.0, 50.0), "Caspian Sea", False), ((-1.0, 33.0), "Lake Victoria", False),
    ((24.0, 0.0), "Adrar, Algeria", True), ((30.04, 31.24), "Al Qahirah, Egypt", True), ((-26.2, 28.05), "Gauteng, South Africa", True),
    ((19.08, 72.88), "Maharashtra, India", True), ((35.68, 139.69), "Tokyo, Japan", True), ((-33.87, 151.21), "New South Wales, Australia", True),
    ((65.5, 176.0), "Chukchi Autonomous Okrug, Russia", True), ((65.5, -165.0), "Alaska", True), ((61.22, -149.9), "Alaska", True),
    ((0.0, -150.0), "South Pacific Ocean", False), ((30.0, -40.0), "North Atlantic Ocean", False), ((-40.0, 80.0), "Indian Ocean", False),
    ((89.9, 0.0), "Arctic Ocean", False), ((-89.9, 0.0), "Antarctica", True), ((60.0, -85.0), "Hudson Bay", False),
    ((15.0, -80.0), "Caribbean Sea", False), ((40.0, 20.0), "Vlore, Albania", True), ((1.35, 103.82), "North West, Singapore", True),
]


@pytest.mark.parametrize("point,name,is_land", KNOWN, ids=[k[1] for k in KNOWN])
def test_known_places(point, name, is_land):
    got, land = label(*point)
    assert (got, land) == (name, is_land)
