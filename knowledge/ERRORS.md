# Errors

Record deterministic errors, root causes, and fixes here.

## 2026-09-26
- **Southern-edge row.** A latitude exactly on a tile's southern edge computed row 250 (IndexError in a check script). Fix: clamp the row in every lookup.
- **Day view missing tile columns.** 9×9 sampling in keysForFrame was about 6° apart in the Day view, wider than a 5° tile, so whole tile columns were skipped and drawn as water. Near the poles, even 10 px sampling skipped columns. Fix: enumerate every 5° column between each pixel row's ends. Test: every pixel of five frames, including a polar one, has a loaded tile.
- **Day frame never arriving.** 63 tile requests at once overflowed the phone simulator's connection pool, and one dropped tile failed the frame. Fix: at most 6 in flight, one retry each.
- **Route drawn outside the map.** The route crossed the time bar and panel. Fix: the map gets its own clipped Layer.
- **Emulator check scale-tag comparison** included the background under the tag. Fix: compare white text pixels only.

## 2026-09-26: verifier pass 1 (REJECT), all fixed
1. **High-latitude Day frames lost land.** A Day frame needs up to 216 tiles, but the cache held 120, so tiles were evicted while it filled. Fix: pin the current request's tiles, and use 8-bit grids when a tile has 256 names or fewer. Test: Tromsø N Day with a 40-tile cache equals a 1000-tile cache (mutation-checked).
2. **A frame arriving after midnight counted as fresh all day.** It was stamped with the arrival minute. Fix: the phone sends FrameBase (the request minute; 0 for Day frames).
3. **A home change with the same direction kept the old frames.** Fix: clear frames when the origin changes.
4. **Near a pole the dot went off-frame and the watch re-requested every minute.** Fix: if the lead-centred frame puts the dot outside, re-centre on the dot.
5. **A frame reply could land after a settings change.** Fix: a generation ticket on frame builds.
6. **A dropped first chunk could overwrite the frame on screen.** Fix: a staging buffer, committed only when complete; part and offset bounds-checked.
7. **With no location or tiles, the watch retried every minute** (GPS call and tile fetch each time). Fix: the phone backs off 10 minutes, and start-up or new settings force a retry.
8. **A town took the point's country, not its own** (Esch-sur-Alzette). Fix: each tile town carries its own country name.

Not fixed (cosmetic, logged):
- North of Svalbard, cells outside any marine polygon read "Open water".
- A Day frame over a pole is a stretched equirectangular map.
