---
generated_by: "Claude Code CLI (claude-opus-5-5)"
timestamp: "2026-09-26T17:30:00-05:00"
---

# Emulator checks and release

- **Full check:** `python3 execution/emulator_check.py` covers hour, cycle, revert, water and offline, 13 checks, in about 7 minutes. Screenshots go to `.tmp/emulator/`.
- **Tile server:** the emulator's phone simulator fetches tiles from `http://localhost:8765/`. The phone code detects the emulator from `Pebble.getActiveWatchInfo().model` starting with `qemu`.
- **Emulator location:** the phone simulator looks up location from the network, which lands in central Houston (30.0, -95.3) rather than Spring. Use `dev.json` `home` for exact homes.
- **Fetch limit:** the phone simulator's connection pool is 10. A burst of 60+ tile requests drops some, so `TileCache.ensure` allows at most 6 in flight and retries each tile once.
- **Emulator fallback face:** a crashed or backgrounded face falls back to whatever the emulator last ran (Personal Atlas). Restart with `pebble kill` rather than `pebble wipe`, which would delete other projects' installs.
- **Scale-tag checks:** compare only the tag's white text pixels. The map behind the tag changes (land or sea).
- **Pixel check limits:** the pixel checks are coarse. Always look at the screenshots too.
- **Before publishing:** run `python3 execution/cloudpebble.py watchface .tmp/cloudpebble_sim`. It must report "dropped: none".
- **Pages:** GitHub Pages serves `/docs` from `main`. `docs/.nojekyll` makes it serve the files as-is.
