# Directive: [Name]

> Copy this template to `directives/your_directive.md` to create a new SOP.
> Delete this instruction block when filling it in.

## Goal

[High-level summary of the desired outcome]

## Validation Contract
> [!IMPORTANT]
> **Define "Done" Before Coding**: This section must be filled out before implementation starts. It contains binary assertions that prove the goal was met, independent of how it was built.

- [ ] [Binary assertion — passes or fails with no judgment]
- [ ] [Another assertion]

## Inputs

- **File/data source**: where it comes from, what format
- **Environment variables**: which `.env` keys are required
- **Dependencies**: other directives or scripts that must run first

## Tools/Scripts

- `execution/script_name.py` — what it does, key flags
- `execution/other_script.py --dry-run` — always test with dry-run first

## Outputs

| Artifact | Location | Format | Notes |
|----------|----------|--------|-------|
| Output file | `.tmp/output.json` | JSON | Gitignored |
| Cloud resource | e.g. S3 bucket | — | Created if missing |

## Acceptance Criteria

The directive is complete when:

- [ ] Output artifact exists at expected location
- [ ] Output passes schema validation (if applicable)
- [ ] Execution script exits 0
- [ ] No errors logged to `knowledge/ERRORS.md`

## Edge Cases

- Known failure modes and how to handle them
- API rate limits or pagination considerations
- Data quality issues to watch for

## Rollback Plan

How to undo this directive's effects if something goes wrong.

## Last Validated

<!-- YYYY-MM-DD — result (✅ passed / ❌ failed) -->

## Learnings

<!-- Append dated learnings here as they are discovered -->
<!-- Format: ### YYYY-MM-DD — Title -->
