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

## 2026-09-26: verifier pass 2 (REJECT on one race), fixed
- **Overlapping tile loads unpinned each other.** There was a single shared pin set, so a second load during a slow 210-tile Day load evicted the first load's tiles. Fix: per-key pin counts, released after the caller's synchronous draw returns, then trimmed back to the limit. Test: a Day frame drawn while another route loads matches a no-eviction reference (fails with the shared-pin bug reinstated).
- **A duplicated part completed a frame early.** Fix: a received-parts bitmask instead of a counter.
- **Memory:** decoded tiles drop their JSON rows, and pins release after each load, so the cache returns to its limit.

## 2026-09-29: map stuck on "loading map..." on a real watch
- **Symptom:** time, coordinates and place panel shown; map never leaves plain "loading map..." (no x/y count, so part 0 was never staged).
- **Likely cause:** `onRequest` read watch requests only by numeric key (`payload[keys.ReqZoom]`). Phone apps may key `e.payload` by name (`ReqZoom`), so every frame request was ignored. The timeline still arrived because the phone pushes it on `ready`. The emulator (pypkjs) keys by number, so all gates passed.
- **Also:** part 0 sent `FrameData: []` and the watch dropped any part without FrameData; an empty byte array is fragile across phone apps. Part 0 no longer sends it and the watch no longer needs it.
- **Fix:** `src/pkjs/payload.js` `field()` reads number, name, or numeric string. Test: `test/payload.test.js`. The 2026-09-27 "Bluetooth MTU" theory did not fix the hardware symptom.
- **Not yet confirmed on hardware.**
