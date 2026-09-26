#!/usr/bin/env python3
"""
evaluate.py — Immutable eval harness for the Karpathy Loop.

⚠️  DO NOT MODIFY: this file defines the metric.
    The loop edits one target file only (see directives/run_loop.md) — not this file.

Contract:
  Stdout: JSON {"score": float}   — required, loop parses this
  Exit 0 on success, non-zero on failure (loop treats non-zero as a crash/discard).

What to implement:
  1. Import or call whatever produces the artifact you want to score.
  2. Run it against a FIXED canonical fixture or test input (never live data).
  3. Score the output deterministically or via a separate Claude Haiku call.
  4. Print {"score": float} and exit 0.

Tips:
  - Keep the fixture in tests/fixtures/ and never let the loop touch it.
  - If scoring via LLM, use a SEPARATE scorer profile/prompt from the one being optimized
    so the loop can't game the eval by matching the exact words used here.
  - Bonuses/penalties (diversity, duplication, forced patterns) go here, not in the target file.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent

load_dotenv(PROJECT_ROOT / ".env")

# ── Scorer profile (keep separate from the prompt being optimized) ─────────────

_SCORER_PROFILE = """
TODO: Describe what a high-quality output looks like from the user's perspective.

HIGH-VALUE (score 8–10):
  - ...

MEDIUM-VALUE (score 5–7):
  - ...

LOW-VALUE / Irrelevant (score 0–4):
  - ...
"""


def score_output(output: object) -> tuple[float, str]:
    """
    Score the output produced by the editable file.

    Returns:
        (score, reasoning) — score is a float in [0, 100].

    Options:
      A) Rule-based: compute score from output fields directly.
      B) LLM-based:  ask Claude Haiku to score against _SCORER_PROFILE.
                     Import anthropic, build a prompt, parse JSON response.
    """
    # TODO: implement scoring
    raise NotImplementedError("Implement score_output() before running the loop.")


def main() -> None:
    # 1. Load fixture (fixed — never live data)
    fixture_path = PROJECT_ROOT / "tests" / "fixtures" / "fixture.json"
    if not fixture_path.exists():
        print(json.dumps({
            "score": 0.0,
            "reasoning": f"Fixture not found: {fixture_path}",
        }))
        sys.exit(1)

    fixture = json.loads(fixture_path.read_text())

    # 2. Import the editable module fresh each run so the loop's changes are picked up.
    exec_dir = str(PROJECT_ROOT / "execution")
    if exec_dir not in sys.path:
        sys.path.insert(0, exec_dir)

    target_module = "prompts"  # TODO: change to match directives/run_loop.md `editable`
    if target_module in sys.modules:
        del sys.modules[target_module]

    try:
        import importlib
        mod = importlib.import_module(target_module)
    except Exception as exc:
        print(json.dumps({
            "score": 0.0,
            "reasoning": f"Import error (likely bad {target_module}.py): {exc}",
        }))
        sys.exit(1)

    # 3. Call the target function and score the result.
    try:
        output = mod.your_function(fixture)  # TODO: replace with real function call
        score, reasoning = score_output(output)
    except Exception as exc:
        print(json.dumps({
            "score": 0.0,
            "reasoning": f"Eval error: {exc}",
        }))
        sys.exit(1)

    print(json.dumps({
        "score": round(score, 2),
        "reasoning": reasoning,
    }))


if __name__ == "__main__":
    main()
