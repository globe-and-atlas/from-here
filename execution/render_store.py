#!/usr/bin/env python3
"""Capture appstore screenshots of every From Here view from the current build (emery emulator).

Home is a public fixture (downtown Houston), never the owner's home. The clock is pinned with
FH_TEST_MINUTE; tiles are served locally from docs/ exactly as in emulator_check.py.

  NE at 10:42  Hour (default) -> flick: Day, Globe, Now      store: hour, day, globe, now
  SE at 11:00  open water: the face shows the Day view        store: water

Screenshots go to .tmp/store/ as emery_*.png (the appstore wants the platform prefix).
dev.json is restored and a normal build is left behind.

  python3 execution/render_store.py [--dry-run]
"""
from __future__ import annotations

import argparse
import shutil
import sys
import time

import emulator_check as em

HOME = [29.76, -95.37]  # downtown Houston: public, not anyone's home
NE, SE = 1, 3
STORE = em.ROOT / ".tmp" / "store"


def boot_into(minute: int, direction: int) -> None:
    em.configure(HOME, direction)
    em.build(minute)
    for _ in range(3):  # a stale emulator can keep another app in front; retry until a map arrives
        em.install()
        if em.map_drawn(em.wait_for_map("store_boot", 60)):
            return
    raise SystemExit("From Here never drew a map")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true")
    if ap.parse_args().dry_run:
        print(f"would capture hour/day/globe/now (NE 10:42) and water (SE 11:00) from home {HOME}")
        return 0
    STORE.mkdir(parents=True, exist_ok=True)
    original = em.DEV.read_text() if em.DEV.exists() else "{}\n"
    shots = {}
    try:
        with em.Server():
            boot_into(642, NE)
            time.sleep(4)
            shots["hour"] = em.shot("store_hour")
            for name in ("day", "globe", "now"):
                em.tap()
                shots[name] = em.wait_for_map(f"store_{name}", 45)
                time.sleep(3)
                shots[name] = em.shot(f"store_{name}")
            boot_into(660, SE)
            time.sleep(4)
            shots["water"] = em.shot("store_water")
    finally:
        em.DEV.write_text(original)
        em.run(["pebble", "build"])
    for i, name in enumerate(("hour", "now", "day", "globe", "water"), 1):
        shutil.copyfile(em.OUT / f"store_{name}.png", STORE / f"emery_{i}_{name}.png")
        print(f"{name:<6} map drawn: {em.map_drawn(shots[name])}")
    print(f"→ {STORE}")
    return 0 if all(em.map_drawn(s) for s in shots.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
