# Directive: Manage task.md

> Standardized SOP for maintaining the source of truth for current project objectives.

## Goal

Ensure that both the human and AI agents have a clear, synchronized understanding of progress, blockers, and next steps through a disciplined `task.md` lifecycle.

## Validation Contract

- [ ] `task.md` states the current objective.
- [ ] `task.md` lists acceptance criteria as atomic pass/fail items.
- [ ] Completed `task.md` items cite the command, artifact, or observation that verified them.
- [ ] Blocked work records the blocker and next action.

## Inputs

- **Current User Request**: The primary trigger for updating the objective.
- **Project Context**: `knowledge/INDEX.md` and `knowledge/context.md`.

## Tools/Scripts

- `scripts/health_check.py` — run before and after major tasks to ensure integrity.

## Standard Notation

| Symbol | Status | Description |
| :--- | :--- | :--- |
| `[ ]` | Pending | To be started. |
| `[/]` | In Progress | Actively being worked on by the agent. |
| `[x]` | Complete | Finished and verified. |
| `[!]` | Blocked | Requires user input or external dependency. |

## Lifecycle Rules

1. **Session Start**:
   - Read `task.md` to resume from the last checkpoint.
   - If starting a new request, create a new top-level objective.
2. **Execution**:
   - Mark the current sub-step as `[/]` before starting work.
   - For complex work, create an `implementation_plan.md` first.
3. **Verification**:
   - Only mark a step as `[x]` after successful verification (scripts/tests).
4. **Session End**:
   - Ensure the current state is accurately reflected.
   - Document any blockers as `[!]`.

## Acceptance Criteria

- [ ] Every active session has an updated `task.md`.
- [ ] Steps are granular enough to track meaningful progress (3–10 steps per objective).
- [ ] Verification method is noted for each major step.

## Last Validated

<!-- YYYY-MM-DD — result -->
