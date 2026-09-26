---
generated_by: "Claude Code CLI (claude-opus-5-5)"
timestamp: "2026-09-26T15:45:00-05:00"
---

# Build From Here

## Goal
A Pebble Time 2 (Emery, 200×228, 64 colours) watchface: your location is the origin, and at clock time H:M the dot sits H degrees M arcminutes away along one of 8 map directions (N, NE, E, SE, S, SW, W, NW). The face shows where that is on a map, names the place, and says which town is next. It's a Globe & Atlas project.

Design decisions (user, 2026-09-25/26):
- 8 directions.
- Default view: Hour (~600 km, 3 km/px) with a globe inset.
- A flick cycles Now → Hour → Day → Globe.
- Auto-zoom out over open water.
- Public repo `globe-and-atlas/from-here`; static tiles on GitHub Pages.
- Full design in the first pass.

## Architecture
- **Tiles** (`execution/build_tiles.py`): global 5°×5° tiles holding a 0.02° label raster.
  - Each cell holds an id into the tile's name table: lake > state/province > country > sea.
  - The name table records whether each name is land and which country it belongs to.
  - Towns over 15,000 people are listed separately.
  - Data: Natural Earth (public domain) and GeoNames (CC BY 4.0, credited in the settings page and README).
- **Phone** (`watchface/src/pkjs/`):
  - origin: phone GPS or manual coordinates, rounded to 0.1°;
  - route and label timeline;
  - direction suggestion, from a coarse global overview;
  - rendering each view to a 2-bit palette image (ocean, land, state line, country border), plus the route polyline and up to 5 town labels in screen coordinates, sent by AppMessage in chunks.
- **Watch** (`watchface/src/c/`):
  - draws the image and overlays: the route (past solid, future dotted), dot, town labels, time bar, coordinates and place panel;
  - a flick cycles the zoom, and the view returns to the default after 60 s;
  - auto-zoom to Day when the current frame is under 5% land;
  - with no phone data, shows the time plus the coordinates only.

## Validation Contract (2026-09-26)
Route and labels:
- [ ] `route.pointAt(origin, dir, minute)` equals origin + H°M′ along the direction for all 8 directions (unit test).
- [ ] Routes crossing a pole continue on the far side 180° of longitude away (unit test).
- [ ] Longitude wraps to [-180, 180) (unit test).
- [ ] For Spring TX heading NE, the phone timeline's named towns include Memphis, Paducah, Evansville, Muncie, Toledo, Detroit and North Bay. Each lands within ±10 minutes of the Python prototype's time.
- [ ] Minute 0 of every timeline is labelled "Home".
- [ ] Label runs shorter than 5 minutes are merged.

Tiles:
- [ ] Every 5° tile from lat -90..90 and lon -180..180 exists, or ocean tiles are covered by a documented default.
- [ ] Tile lookups at 50 sample points (cities, lakes, seas, borders) match the prototype's labeller, allowing ±1 cell at boundaries (test).
- [ ] The total tile set is under 100 MB.

Rendering (phone):
- [ ] The Hour frame for Spring NE at 10:42 shows land and water where Natural Earth has them (golden-image test within 2% of pixels).
- [ ] Frames encode as 2 bits per pixel, 200×152 = 7,600 bytes, before chunking.
- [ ] No town label boxes overlap each other or the globe inset.

Watch:
- [ ] Builds for Emery with `pebble build` and no warnings in our sources.
- [ ] In the emulator, the face shows the time, coordinates, map, route, dot and place panel (screenshot inspected).
- [ ] A tap event cycles Now → Hour → Day → Globe (emulator `pebble emu-tap`, screenshots of each).
- [ ] The view returns to default 60 s after the last flick.
- [ ] A frame under 5% land shows the Day view unless the user flicked in the last 60 s.
- [ ] With no phone data, the face shows the time and coordinates and no error text.

Settings:
- [ ] The settings page offers Auto plus the 8 directions, and phone location or manual coordinates.
- [ ] The settings page shows the GeoNames CC BY 4.0 credit.
- [ ] Auto picks the top-scoring direction; for Spring TX it picks NE.

Process:
- [ ] Every test suite passes: `pytest`, `node --test`, and the emulator checks.
- [ ] A fresh verifier approves.

## Outputs
| Artifact | Location | Notes |
|---|---|---|
| Tiles | `docs/tiles/{lat}_{lon}.json` plus `docs/overview.json` | Served by GitHub Pages from `/docs` |
| Watchface | `watchface/` | CloudPebble-importable layout |
| PBW | `watchface/build/watchface.pbw` | Gitignored |

## Edge cases
- Poles and the antimeridian.
- A route that spends the whole day at sea (auto-zoom; the panel shows the ocean name).
- Phone offline (coordinates only).
- The day rolling over at midnight (a new timeline is requested; the dot returns home).
- DST days (minute = local clock).
