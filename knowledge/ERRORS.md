# Errors

Record deterministic errors, root causes, and fixes here.

## 2026-09-26
- **Southern-edge row.** A latitude exactly on a tile's southern edge computed row 250 (IndexError in a check script). Fix: clamp the row in every lookup.
- **Day view missing tile columns.** 9×9 sampling in keysForFrame was about 6° apart in the Day view, wider than a 5° tile, so whole tile columns were skipped and drawn as water. Near the poles, even 10 px sampling skipped columns. Fix: enumerate every 5° column between each pixel row's ends. Test: every pixel of five frames, including a polar one, has a loaded tile.
- **Day frame never arriving.** 63 tile requests at once overflowed the phone simulator's connection pool, and one dropped tile failed the frame. Fix: at most 6 in flight, one retry each.
- **Route drawn outside the map.** The route crossed the time bar and panel. Fix: the map gets its own clipped Layer.
- **Emulator check scale-tag comparison** included the background under the tag. Fix: compare white text pixels only.
