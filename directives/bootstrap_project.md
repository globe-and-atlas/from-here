# Directive: Project Bootstrap

> Execute this directive when a user shares a new project vision for the first time.
> Goal: populate the project's knowledge and planning files *before* writing any code.

## Goal

Transform a user's natural-language project vision into a fully populated project scaffold —
so every subsequent session starts with accurate context instead of re-deriving it from conversation.

## Inputs

- User's project description (verbal or written — any level of detail)
- This template's existing stub files

## Steps

Work through these in order. Each step has an acceptance criterion.

### 1. Populate `knowledge/context.md`

Update these fields specifically:
- `Name`, `Purpose`, `Deploy`
- `Stack Context` — language, framework, key deps, data sources, external APIs
- `Known Constraints` — anything the user flagged (rate limits, budgets, data freshness, etc.)
- `Out of Scope` — what they explicitly said this won't do, or what you inferred from scope

**Done when:** no blank fields remain in the Project and Stack Context sections.

---

### 2. Populate `README.md`

- Replace `from-here` with the real name
- Write a one-sentence description
- Update the Architecture section if the stack differs from the template defaults

**Done when:** README has no placeholder values and describes the actual project.

---

### 3. Draft directives for each major workflow

For each distinct workflow the user described:
1. Copy `directives/_template.md` → `directives/[verb_noun].md`
2. Fill in: Goal, Inputs, expected Outputs
3. Draft the **Validation Contract** now — write at least 2–3 binary assertions that define "done" before any code is written. These can be skeletal but must be present. Edge Cases and Rollback can stay as stubs.

Name directives by verb+noun in snake_case:
- `fetch_data.md`, `process_records.md`, `generate_report.md`, `sync_calendar.md`

**Done when:** one directive file exists per major workflow. Minimum 1.

---

### 4. Update `task.md`

- Set `## Objective` to the first concrete milestone (not the full vision)
- List 3–5 steps toward that milestone
- Add a progress log entry: `YYYY-MM-DD HH:MM — Bootstrap complete`

**Done when:** task.md contains a real objective and at least one step.

---

### 5. Update `knowledge/INDEX.md`

Add a row for every new file created or meaningfully updated during bootstrap.
Update the `Last Updated` column with today's date.

**Done when:** INDEX.md reflects the current state of `knowledge/`.

---

### 6. Confirm with the user

Present a summary:

```
## Bootstrap Summary

**Project:** [name]
**Purpose:** [one sentence]
**Stack:** [brief]
**Profile:** [from project.profile.json]
**Workflows drafted:** [list directive filenames]
**First milestone:** [from task.md]

**Assumptions I made:**
- [assumption 1]
- [assumption 2]

**One question before I start coding:**
[Most important ambiguity — if any. If none, say so.]
```

Wait for confirmation or corrections before writing any code.

---

## Outputs

| Artifact | Location |
|----------|----------|
| Agent context | `knowledge/context.md` |
| Human-facing docs | `README.md` |
| Workflow SOPs | `directives/[workflow].md` (one per major workflow) |
| Active task | `task.md` |
| Knowledge index | `knowledge/INDEX.md` |

## Edge Cases

- **Vague vision**: fill what you can, mark unknowns `<!-- TBD -->`, ask one question at step 6
- **Very large vision**: identify the 3 most important workflows and draft those; note the rest as "future directives" in task.md
- **Vision changes mid-bootstrap**: finish the current pass, then revise — don't restart

## Rollback Plan

Bootstrap only writes Markdown files. Nothing is irreversible. If the user wants to restart, delete the populated files and re-run from the template stubs.

## Last Validated

<!-- YYYY-MM-DD — result -->

## Learnings

<!-- Append dated learnings here -->
