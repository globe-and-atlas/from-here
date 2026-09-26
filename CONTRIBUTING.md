# Contributing

This project uses a **3-layer architecture** that keeps AI-driven orchestration reliable.

## The 3 Layers

```
Layer 1 — Directives (directives/)
  What to do. Markdown SOPs. Written once, improved over time.

Layer 2 — Orchestration (the AI agent)
  Decision-making only. Reads directives, delegates to scripts, handles errors.

Layer 3 — Execution (execution/)
  Deterministic scripts. All loops, parsing, API calls, and file ops live here.
```

**Rule:** If it loops, paginates, parses, retries, or calls APIs — it goes in `execution/`, not in the agent.

---

## Starting a New Project (Bootstrap)

When you describe a project vision to the AI agent, it will automatically run `directives/bootstrap_project.md` before writing any code. This populates:

- `knowledge/context.md` — project identity, stack, constraints
- `README.md` — name and description
- `directives/` — one SOP file per major workflow
- `task.md` — first milestone and steps

The agent will then confirm its assumptions and ask one clarifying question before proceeding.

---

## Adding a New Directive

1. Copy `directives/_template.md` to `directives/your_directive.md`
2. Fill in: Goal, Inputs, Tools/Scripts, Outputs, Edge Cases
3. Add acceptance criteria so the agent can self-verify completion
4. Reference the execution script(s) it uses
5. Follow the `verb_noun.md` naming convention

## Adding an Execution Script

1. Copy `execution/_template.py` to `execution/your_script.py`
2. Always include:
   - `--dry-run` flag (print what would happen, don't do it)
   - `logging` setup
   - `.env` loading via `python-dotenv`
   - `pathlib.Path` for all file paths
3. Test it: `python3 execution/your_script.py --dry-run`
4. Add a test in `tests/`

## Running Tests

```bash
make test        # full test suite
make lint        # lint with ruff
make check       # lint + typecheck + tests
make health      # audit project integrity
```

## Commit Guidelines

- Never commit `.env`, `token.json`, `credentials.json`, or anything in `.tmp/`
- The pre-commit hook blocks secret files automatically
- Stage files explicitly — avoid `git add -A`
- Keep `.env.example` up to date whenever you add new env vars

## Knowledge System

When you learn something about this project that isn't obvious from the code:

- **What things are** → `knowledge/domain/`
- **How to do things** → `knowledge/procedural/`
- **Errors encountered** → `knowledge/ERRORS.md`
- **Architecture decisions** → `knowledge/DECISIONS.md`
- **Active session state** → `knowledge/SESSION.md`

Update `knowledge/INDEX.md` whenever you add a new file.
