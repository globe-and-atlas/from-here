"""Emulator checks for the From Here watchface (Pebble Time 2 / emery).

Scenarios (screenshots in .tmp/emulator/):
  hour     Spring TX, NE, 10:42: default Hour view with inset, route, towns, panel
  cycle    four flicks from Hour: Day, Globe, Now, Hour
  revert   61 s after the last flick the default view returns
  water    Spring TX, SE, 11:00 (Caribbean, 0% land in the Hour frame): shows the Day view
  offline  tile server stopped after a sync: time and moving coordinates, no error text

Each scenario builds with FH_TEST_MINUTE, writes watchface/src/pkjs/dev.json (emulator-only home
and direction; restored to {} afterwards) and serves docs/ on localhost:8765.
Pixel checks are coarse (is the map drawn? which scale tag?) and every screenshot is kept for review.

Usage: python3 execution/emulator_check.py [--only hour cycle revert water offline]
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FACE = ROOT / "watchface"
DEV = FACE / "src" / "pkjs" / "dev.json"
OUT = ROOT / ".tmp" / "emulator"
SPRING = [30.08, -95.42]
MAP_BOX = (0, 34, 200, 186)


def run(cmd: list[str], timeout: int = 300, env: dict | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=FACE, capture_output=True, text=True, timeout=timeout, env=env)


def build(minute: int) -> None:
    import os
    env = dict(os.environ, FH_TEST_MINUTE=str(minute))
    r = run(["pebble", "build"], env=env)
    if r.returncode:
        raise SystemExit("build failed:\n" + r.stdout[-2000:] + r.stderr[-2000:])


def install() -> None:
    run(["pebble", "kill"], timeout=60)
    r = run(["pebble", "install", "--emulator", "emery"], timeout=300)
    if "succeeded" not in r.stdout:
        raise SystemExit("install failed:\n" + r.stdout[-2000:] + r.stderr[-2000:])


def shot(name: str) -> Image.Image:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.png"
    run(["pebble", "screenshot", "--emulator", "emery", "--no-open", str(path)], timeout=60)
    return Image.open(path).convert("RGB")


def map_drawn(img: Image.Image) -> bool:
    """True when the map area is mostly not black (a frame arrived)."""
    crop = img.crop(MAP_BOX)
    pixels = list(crop.get_flattened_data())
    return sum(1 for p in pixels if p != (0, 0, 0)) / len(pixels) > 0.5


def wait_for_map(name: str, seconds: int = 60) -> Image.Image:
    end = time.time() + seconds
    img = shot(name)
    while not map_drawn(img) and time.time() < end:
        time.sleep(4)
        img = shot(name)
    return img


def tap() -> None:
    run(["pebble", "emu-tap", "--emulator", "emery", "--direction", "x+"], timeout=60)


def scale_region(img: Image.Image) -> list[bool]:
    """The scale tag's white text pixels only; the map behind the tag varies (land or sea)."""
    crop = img.crop((136, 34 + 152 - 18, 200, 34 + 152))
    return [p == (255, 255, 255) for p in crop.get_flattened_data()]


class Server:
    def __enter__(self):
        subprocess.run("lsof -ti :8765 | xargs kill -9", shell=True, capture_output=True)
        self.proc = subprocess.Popen([sys.executable, "-m", "http.server", "8765", "--directory", str(ROOT / "docs")],
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
        return self

    def stop(self) -> None:
        if self.proc.poll() is None:
            self.proc.terminate()
            self.proc.wait(10)

    def __exit__(self, *exc):
        self.stop()


def configure(home, direction) -> None:
    DEV.write_text(json.dumps({"home": home, "direction": direction}))


def scenario_hour(results: dict) -> None:
    configure(SPRING, 1)
    build(642)
    install()
    img = wait_for_map("hour")
    results["hour: map drawn"] = map_drawn(img)
    results["hour: dot drawn"] = any(img.getpixel((x, y)) == (255, 255, 255) for x in range(200) for y in range(40, 180))


def scenario_cycle(results: dict) -> None:
    names = ["cycle_1_day", "cycle_2_globe", "cycle_3_now", "cycle_4_hour"]
    for name in names:
        tap()
        img = wait_for_map(name, 45)
        results[f"{name}: map drawn"] = map_drawn(img)
    globe = Image.open(OUT / "cycle_2_globe.png").convert("RGB")
    results["cycle: globe has black space around the disc"] = globe.getpixel((4, 40)) == (0, 0, 0) and globe.getpixel((100, 110)) != (0, 0, 0)


def scenario_revert(results: dict) -> None:
    tap()  # Hour -> Day
    time.sleep(8)
    shot("revert_before")
    time.sleep(62)
    img = wait_for_map("revert_after")
    before = scale_region(Image.open(OUT / "revert_before.png").convert("RGB"))
    hour = scale_region(Image.open(OUT / "hour.png").convert("RGB"))
    results["revert: flicked view differs from Hour"] = before != hour
    results["revert: back to Hour after 60 s"] = scale_region(img) == hour


def scenario_water(results: dict) -> None:
    configure(SPRING, 3)
    build(660)  # 12:00 is exactly 5% land (Cuba, Central America): the rule is under 5%
    install()
    img = wait_for_map("water", 90)
    day_tag = scale_region(Image.open(OUT / "cycle_1_day.png").convert("RGB")) if (OUT / "cycle_1_day.png").exists() else None
    results["water: map drawn"] = map_drawn(img)
    if day_tag is not None:
        results["water: shows the Day view"] = scale_region(img) == day_tag


def scenario_offline(results: dict, server: Server) -> None:
    configure(SPRING, 1)
    build(642)
    install()
    wait_for_map("offline_synced")
    server.stop()
    run(["pebble", "kill"], timeout=60)
    run(["pebble", "install", "--emulator", "emery"], timeout=300)
    time.sleep(20)
    img = shot("offline")
    top = img.crop((110, 0, 200, 32))
    results["offline: coordinates drawn"] = any(p != (0, 0, 0) for p in top.get_flattened_data())
    results["offline: time drawn"] = any(p != (0, 0, 0) for p in img.crop((0, 0, 100, 32)).get_flattened_data())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", default=["hour", "cycle", "revert", "water", "offline"])
    args = ap.parse_args()
    results: dict[str, bool] = {}
    original = DEV.read_text() if DEV.exists() else "{}\n"
    try:
        with Server() as server:
            if "hour" in args.only or "cycle" in args.only or "revert" in args.only:
                scenario_hour(results)
            if "cycle" in args.only:
                scenario_cycle(results)
            if "revert" in args.only:
                scenario_revert(results)
            if "water" in args.only:
                scenario_water(results)
            if "offline" in args.only:
                scenario_offline(results, server)
    finally:
        DEV.write_text(original)
        run(["pebble", "build"])  # leave a normal build (no test minute, no dev settings)
    width = max(len(k) for k in results)
    for k, v in results.items():
        print(f"{'PASS' if v else 'FAIL'}  {k:<{width}}")
    print(f"screenshots: {OUT}")
    return 0 if all(results.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
