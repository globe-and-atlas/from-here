# From Here

A Pebble Time 2 watchface from [Globe & Atlas](https://globeandatlas.substack.com).

Your location is the start. At 10:42 you are 10 degrees 42 minutes away along the direction you chose. The face shows where that is on a map, names the place, and tells you which town comes next. At midnight you're home again.

- **8 directions:** N, NE, E, SE, S, SW, W, NW. They are map directions: north-east adds one degree north and one degree east every hour. **Auto** picks the direction with the most land and towns from where you live.
- **Views:**
  - **Hour** (about 600 km across, with a small globe) is the default.
  - **Flick your wrist** to cycle Now (about 240 km), Hour, Day (the whole route) and Globe. The default view returns after a minute.
  - **Over open water** (under 5% land in view), the face shows the Day view instead.
- **The panel** shows where you are ("Ohio", "Lake Huron", "Caribbean Sea") and the next town with its time ("next Defiance 10:59").
- **Privacy:** home is rounded to 0.1 degree (about 10 km) and stays on the phone. With no phone connection, the face keeps showing the time and your moving coordinates.

## Install

- [Pebble Appstore](https://apps.rePebble.com/d9fc15a8f87746b7ba01f6ca)

- [Open in CloudPebble](https://cloudpebble.repebble.com/ide/import/github/globe-and-atlas/from-here/main): the branch is in the link because CloudPebble's import defaults to `master`. Rename the project in the dialog.
- Or build locally (see Development) and `pebble install --phone <ip>`.

## How it works

| Part | Where | What it does |
| --- | --- | --- |
| Tiles | `execution/build_tiles.py` → `docs/tiles/*.json` | 2,592 global 5-degree tiles, each a 0.02-degree grid of place ids (lake, state/province, country, sea) plus towns over 15,000 people. 8.3 MB in total, served by GitHub Pages. |
| Overview | `docs/overview.json` | 1-degree land mask and town counts, for the globe views and for choosing Auto's direction. |
| Phone | `watchface/src/pkjs/` | Works out the route and the day's place timeline, then draws each view into a 4-colour image (ocean, land, state line, border). It sends that image plus the route and a few town labels to the watch. |
| Watch | `watchface/src/c/main.c` | Draws the image, the route (solid behind you, dotted ahead), the dot, labels, time, coordinates and place panel. Handles the flick. |

Borders and coastlines come from where the place ids change between neighbouring pixels, so no line data is shipped.

## Data and credits

- [Natural Earth](https://www.naturalearthdata.com) (public domain): 1:50m countries, lakes and marine areas; 1:10m states and provinces.
- [GeoNames](https://www.geonames.org) (CC BY 4.0): towns over 15,000 people (`cities15000`) and region names. This credit also appears on the watchface's settings page.

Rebuild the tiles by downloading the raw files into `data/raw/` (gitignored). `execution/build_tiles.py` lists the exact names. Then:

```bash
python3 execution/build_tiles.py        # about 5 seconds; writes docs/tiles and docs/overview.json
```

## Development

```bash
source .venv/bin/activate
python3 -m pytest tests -q                          # tiles, and a golden frame compared with Natural Earth
(cd watchface && node --test test/*.test.js)        # route, timeline, rendering, settings
python3 execution/emulator_check.py                 # emery emulator: views, flick, revert, water, offline
python3 execution/cloudpebble.py watchface .tmp/cloudpebble_sim   # simulates CloudPebble's import
```

- **Emulator:** the phone code detects the emulator and fetches tiles from `http://localhost:8765/`. `emulator_check.py` starts that server itself.
- **Pinned clock:** `FH_TEST_MINUTE=642 pebble build` fixes the time at 10:42, for screenshots only.
- **Test settings:** `watchface/src/pkjs/dev.json` sets an emulator-only home and direction. It must stay `{}` in commits; the check script restores it.
