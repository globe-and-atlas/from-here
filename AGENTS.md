# Agent Instructions

> **This is the canonical file for this project.** `CLAUDE.md` imports it via `@AGENTS.md` and adds only Claude-specific instructions below the import. `GEMINI.md` stays thin because Antigravity reads both `GEMINI.md` and `AGENTS.md` in the same directory.
>
> Tool-agnostic conventions (Universal Conventions, ISC Task Criteria, the 3-layer architecture, Orchestrator Boundary, Contract, Creator-Verifier, Validation Contract, Directive Edit Policy, Checkpointing format) live in the global config for each tool and in the workspace-root `AGENTS.md` — both auto-concatenate with this file for Claude Code and Codex. Don't restate that content here; add only what's specific to this project.

This project uses a profile-based workshop structure.

## Project-Specific Contract Steps

In addition to the workspace-level Contract, before acting on this project:

1. Read `project.profile.json` — understand the project shape.
2. Read `task.md` — understand current objectives.
3. Read `knowledge/INDEX.md` — understand what's already known.
4. Identify the relevant execution path for this project's profile (see below).

## The System Directive (Condensed)

> **Canonical source:** [`WORKSHOP_PHILOSOPHY.md`](/Users/danielbally/Git/WORKSHOP_PHILOSOPHY.md) — read for full context.

These principles are distilled from the Board of Masters and apply to every task:

1. **The S.D.G. Filter** — Before closing any task, ask: *"To whom does this work deliver Use, Purpose, or Beauty — and how?"* (Bach, Aquinas)
2. **Telos: Highest Actuality** — Identify the *Telos* (inherent purpose) of the feature. Do not settle for "working code"; strive for the highest realized version of the idea. (Aristotle)
3. **Kircher → Rams → Shannon** — Research phase (Kircher): be expansive, cross-disciplinary. Execution phase (Rams): compress ruthlessly. Coding phase (Shannon): Entropy is the enemy. Every line must carry Signal. (Kircher, Rams, Shannon)
4. **The Feynman Gate** — If a directive can't be explained simply, the agent can't execute it. Rewrite before proceeding. (Feynman)
5. **The Michelangelo Cut** — Every refactor is finding the statue inside the stone. Remove code that isn't the output. (Michelangelo)
6. **Popper's Shield** — Do not just verify. Seek the refutation. If you cannot design a test that would disprove your logic, the logic is not yet robust. (Popper)
7. **Verify, Don't Trust** — Pattern-matching is not proof. Kircher was confidently wrong about hieroglyphics. Test before declaring done. (Feynman, Kircher)

## Profile Awareness

Not every project uses the same runtime shape. Always adapt your assumptions to the active profile.

- `dashboard-static`: mostly HTML/CSS/JS + deploy artifacts
- `frontend-app`: frontend build tooling (Vite, React, etc.)
- `workflow-python`: deterministic Python execution
- `hybrid-geospatial`: static UI plus deterministic analysis tooling
