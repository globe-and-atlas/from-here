---
generated_by: "Claude Code CLI (claude-opus-5-5)"
timestamp: "2026-09-26T17:30:00-05:00"
---

# Tiles, frames and messages

**Tile** (`docs/tiles/<lat0>_<lon0>.json`)
- Covers `[lat0, lat0+5) × [lon0, lon0+5)`: a 250×250 grid at 0.02°, row 0 at the north edge.
- `names`: `[label, isLand, countryIndex]`. `countries`: the tile's country names.
- `rows`: run-length pairs `[len, id, ...]`. A uniform tile has `fill` instead.
- `towns`: `[asciiName, lat, lon, pop, cc, admin1]`.
- **Paint order:** open water < sea < country < state (only on country land) < lake.
- **Labels:**
  - US states read alone ("Ohio").
  - Elsewhere a state is followed by its country ("Ontario, Canada"), except when the two names match.
  - All names are ASCII, because watch fonts are Latin.
  - The 1:10m admin-1 layer uses fine units in some countries: London boroughs, Italian provinces, Singapore districts.
- **Lookup edge case:** a latitude exactly on a tile's southern edge computes row 250. Clamp to 249 (`tiles.js` does).

**Frame** (phone → watch)
- A 2 bits-per-pixel image, leftmost pixel in the most significant bits, rows packed tightly (w/4 bytes). The watch copies it into a `GBitmapFormat2BitPalette` bitmap, respecting that bitmap's row stride.
- **Palettes:**
  - map: ocean, land, state line, border;
  - globe: space, ocean, land, graticule.
- **Route:** 289 int16 pairs, minute 0..1440 every 5 minutes, in frame pixels; -32768 marks points not visible.
- **Towns:** `"x|y|left|text"` lines.
- **Valid until:** `validTo` is the last minute the dot stays 14 px inside a Now/Hour frame. Day frames last all day; Globe and inset frames an hour.
- **Chunking:** 2,000 bytes per AppMessage. Part 0 carries the header, route and towns. The inbox maximum on emery is 8,200 bytes.

**Timeline**
- One `"minute|flags|label"` line per run; flag bit 0 means land, bit 1 means a town.
- Minute 0 is "Home". Runs shorter than 5 minutes merge.
- A town label means a town over 15k within 25 km, preferring the one with the largest population ÷ (1 + distance/5 km).

**Scales**
- Now: 1.2 km/px (~240 km across).
- Hour: 3 km/px (~600 km across).
- Day: fitted to the route (~21 km/px from Spring TX heading NE).
- Globe radius: 70 px. Inset: 44 px.
