#!/usr/bin/env python3
"""
health_check.py — Profile-aware project structure and safety validator.

Combines V2's profile awareness with V1's comprehensive auditing
(secrets scanning, knowledge system, execution coupling, tests).

Run at any time to audit project integrity. Exit 0 = healthy, 1 = issues found.

Usage:
    python3 scripts/health_check.py
    python3 scripts/health_check.py --strict   # fail on warnings too
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

PASS = "\033[92m✓\033[0m"
FAIL = "\033[91m✗\033[0m"
WARN = "\033[93m⚠\033[0m"
INFO = "\033[94m·\033[0m"

CORE_REQUIRED = [
    "README.md",
    "CLAUDE.md",
    "AGENTS.md",
    "GEMINI.md",
    "task.md",
    "project.profile.json",
    "directives/_template.md",
    "knowledge/INDEX.md",
    "knowledge/SESSION.md",
    "knowledge/DECISIONS.md",
    "knowledge/ERRORS.md",
    "knowledge/context.md",
]

PROFILE_REQUIRED = {
    "dashboard-static": [
        "index.html", "style.css", "src", "data", "prod", "DEPLOY.md",
    ],
    "frontend-app": [
        "package.json", "index.html", "src", "public", "DEPLOY.md",
    ],
    "workflow-python": [
        "pyproject.toml", "requirements.txt", "requirements-dev.txt",
        "Makefile", ".env.example", "src", "execution", "tests",
    ],
    "hybrid-geospatial": [
        "index.html", "help.html", "style.css", "config.example.js",
        "data", "src", "execution", "tests", "prod", "DEPLOY.md",
    ],
}

warnings_count = 0
failures_count = 0


def check(label: str, ok: bool, message: str = "", warning: bool = False) -> bool:
    """Print a check result. Returns True if passed."""
    global warnings_count, failures_count
    icon = PASS if ok else (WARN if warning else FAIL)
    suffix = f"  {message}" if message else ""
    print(f"  {icon}  {label}{suffix}")
    if not ok:
        if warning:
            warnings_count += 1
        else:
            failures_count += 1
    return ok


def section(title: str) -> None:
    print(f"\n{title}")
    print("─" * 50)


# ── Required files ────────────────────────────────────────────────────────────

def check_required_files(profile: str) -> None:
    section("Required Files")
    for f in CORE_REQUIRED:
        path = ROOT / f
        check(f, path.exists(), "" if path.exists() else "MISSING")
    for f in PROFILE_REQUIRED.get(profile, []):
        path = ROOT / f
        check(f"[{profile}] {f}", path.exists(), "" if path.exists() else "MISSING")


# ── Environment ───────────────────────────────────────────────────────────────

def check_env(profile: str) -> None:
    section("Environment")

    env_path = ROOT / ".env"
    env_example = ROOT / ".env.example"

    if env_example.exists():
        check(".env exists", env_path.exists(),
              "run: cp .env.example .env" if not env_path.exists() else "")

        if env_path.exists():
            example_keys = {
                line.split("=")[0].strip()
                for line in env_example.read_text().splitlines()
                if line.strip() and not line.startswith("#") and "=" in line
            }
            env_keys = {
                line.split("=")[0].strip()
                for line in env_path.read_text().splitlines()
                if line.strip() and not line.startswith("#") and "=" in line
            }
            missing_keys = example_keys - env_keys
            if missing_keys:
                check(".env has all keys from .env.example", False,
                      f"missing: {', '.join(sorted(missing_keys))}")
            else:
                check(".env has all keys from .env.example", True)

    if profile in ("workflow-python", "hybrid-geospatial"):
        venv = ROOT / ".venv"
        check(".venv exists", venv.exists(),
              "run: python3 -m venv .venv" if not venv.exists() else "", warning=True)

    if profile == "frontend-app":
        nm = ROOT / "node_modules"
        check("node_modules exists", nm.exists(),
              "run: npm install" if not nm.exists() else "", warning=True)


# ── Secrets safety ────────────────────────────────────────────────────────────

def check_secrets() -> None:
    section("Secrets Safety")

    git_dir = ROOT / ".git"
    if not git_dir.exists():
        check("git initialized", False, "run: git init")
        return

    check("git initialized", True)

    try:
        staged = subprocess.run(
            ["git", "diff", "--cached", "--name-only"],
            cwd=ROOT, capture_output=True, text=True,
        ).stdout.splitlines()
        env_staged = any(".env" == Path(f).name and f != ".env.example" for f in staged)
        check(".env not staged for commit", not env_staged,
              "DANGER: run 'git reset HEAD .env'" if env_staged else "")
    except FileNotFoundError:
        check("git available", False, "git not found in PATH")

    # Scan for hardcoded secrets patterns in src/ and execution/
    dangerous_patterns = [
        (r'sk-[a-zA-Z0-9]{20,}', "OpenAI API key pattern"),
        (r'AKIA[0-9A-Z]{16}', "AWS access key pattern"),
        (r'ghp_[a-zA-Z0-9]{36}', "GitHub PAT pattern"),
    ]
    scan_dirs = [d for d in [ROOT / "src", ROOT / "execution"] if d.exists()]
    if scan_dirs:
        found_secrets = []
        for pattern, label in dangerous_patterns:
            try:
                result = subprocess.run(
                    ["grep", "-r", "--include=*.py", "--include=*.ts",
                     "--include=*.js", "--include=*.jsx", "--include=*.tsx",
                     "-l", "-E", pattern] + [str(d) for d in scan_dirs],
                    capture_output=True, text=True,
                )
                if result.stdout.strip():
                    found_secrets.append(f"{label} in {result.stdout.strip()}")
            except Exception:
                pass
        check("No hardcoded secret patterns in src/execution/", not found_secrets,
              "; ".join(found_secrets) if found_secrets else "")


# ── Knowledge system ──────────────────────────────────────────────────────────

def check_knowledge() -> None:
    section("Knowledge System")

    knowledge = ROOT / "knowledge"

    domain = knowledge / "domain"
    domain_files = [f for f in domain.iterdir() if f.name != ".gitkeep"] if domain.exists() else []
    check("knowledge/domain/ has content", bool(domain_files),
          "still empty — write domain knowledge as you learn it" if not domain_files else f"{len(domain_files)} file(s)",
          warning=True)

    procedural = knowledge / "procedural"
    proc_files = [f for f in procedural.iterdir() if f.name != ".gitkeep"] if procedural.exists() else []
    check("knowledge/procedural/ has content", bool(proc_files),
          "still empty — write procedural knowledge as you learn it" if not proc_files else f"{len(proc_files)} file(s)",
          warning=True)

    index = knowledge / "INDEX.md"
    if index.exists():
        index_content = index.read_text()
        has_entries = any(
            line.strip().startswith("- [") and "gitkeep" not in line
            for line in index_content.splitlines()
        )
        check("knowledge/INDEX.md has entries", has_entries,
              "INDEX.md has no file entries yet" if not has_entries else "", warning=True)


# ── Task tracking ─────────────────────────────────────────────────────────────

def check_tasks() -> None:
    section("Task Tracking")
    task_md = ROOT / "task.md"
    if not task_md.exists():
        check("task.md exists", False)
        return
    content = task_md.read_text()
    is_template = "from-here" in content or "[Objective Name]" in content
    check("task.md has been updated from template", not is_template,
          "still using placeholder text" if is_template else "", warning=True)


# ── Execution scripts (for profiles that have them) ───────────────────────────

def check_execution(profile: str) -> None:
    if profile not in ("workflow-python", "hybrid-geospatial"):
        return

    section("Execution Scripts")
    execution_dir = ROOT / "execution"
    if not execution_dir.exists():
        check("execution/ exists", False)
        return

    real_scripts = [
        f for f in execution_dir.iterdir()
        if f.suffix == ".py" and f.name != "_template.py"
    ]

    check("Real execution scripts exist", bool(real_scripts),
          "only _template.py found" if not real_scripts else f"{len(real_scripts)} script(s)",
          warning=True)

    for script in real_scripts:
        content = script.read_text()
        has_dry_run = "--dry-run" in content
        check(f"{script.name} has --dry-run flag", has_dry_run,
              "add: parser.add_argument('--dry-run')" if not has_dry_run else "", warning=True)

    # Check coupling: scripts referenced in directives
    directives_dir = ROOT / "directives"
    if directives_dir.exists():
        all_directive_content = ""
        for df in directives_dir.glob("*.md"):
            all_directive_content += df.read_text()

        for script in real_scripts:
            is_referenced = script.name in all_directive_content
            check(f"{script.name} referenced in directives/", is_referenced,
                  "add to a directive SOP to ensure 3-layer coupling" if not is_referenced else "",
                  warning=True)


# ── Tests ─────────────────────────────────────────────────────────────────────

def check_tests(profile: str) -> None:
    tests_dir = ROOT / "tests"
    if not tests_dir.exists():
        return

    section("Tests")
    test_files = [
        f for f in tests_dir.iterdir()
        if f.suffix == ".py" and f.name != "_template_test.py" and f.name != "__init__.py"
    ]
    check("Real test files exist", bool(test_files),
          "only template found — write project tests" if not test_files else f"{len(test_files)} test file(s)",
          warning=True)

    if test_files:
        try:
            result = subprocess.run(
                ["python3", "-m", "pytest", "tests/", "-q", "--tb=short"],
                cwd=ROOT, capture_output=True, text=True, timeout=60,
            )
            passed = result.returncode == 0
            summary = result.stdout.strip().splitlines()[-1] if result.stdout.strip() else "no output"
            check("Tests pass", passed, summary if not passed else "")
        except subprocess.TimeoutExpired:
            check("Tests pass", False, "timed out after 60s")
        except FileNotFoundError:
            check("pytest available", False, "install: pip install pytest", warning=True)


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    global warnings_count, failures_count

    parser = argparse.ArgumentParser(description="Profile-aware project health check")
    parser.add_argument("--strict", action="store_true", help="Fail on warnings too")
    args = parser.parse_args()

    profile_path = ROOT / "project.profile.json"
    if not profile_path.exists():
        print(f"  {FAIL}  Missing project.profile.json")
        sys.exit(1)

    profile_data = json.loads(profile_path.read_text())
    profile = profile_data.get("profile", "unknown")

    print(f"\n{'='*52}")
    print(f"  Health Check: {ROOT.name} ({profile})")
    print(f"{'='*52}")

    check_required_files(profile)
    check_env(profile)
    check_secrets()
    check_knowledge()
    check_tasks()
    check_execution(profile)
    check_tests(profile)

    print(f"\n{'─'*52}")
    total = failures_count + warnings_count
    if failures_count:
        print(f"  {FAIL}  {failures_count} failure(s), {warnings_count} warning(s)")
    elif warnings_count:
        print(f"  {WARN}  {warnings_count} warning(s), 0 failures")
    else:
        print(f"  {PASS}  All checks passed")
    print()

    if failures_count or (args.strict and warnings_count):
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
