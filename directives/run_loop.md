# Directive: Karpathy Loop

## Goal

Iteratively improve an artifact until it crosses the quality threshold for this profile.

## Validation Contract

- [ ] The editable artifact is named explicitly.
- [ ] The evaluator or scoring rule is named explicitly.
- [ ] Each loop iteration records its score and keep/discard decision.
- [ ] The loop stops when the threshold is met, the iteration limit is reached, or a blocker is logged.

## Inputs

- target artifact
- evaluator or review criteria
- current acceptance threshold
- max iteration count

## Outputs

- improved artifact
- loop notes in `.tmp/loop_runs/`
- promotion decision in `task.md` or `knowledge/DECISIONS.md`

## Standard

1. Define the artifact under review
2. Define the evaluator
3. Run one improvement pass
4. Re-evaluate
5. Stop when quality clearly improves or the loop stops paying off

## Profile Guidance

- `artifact`: screenshots, layout, exports, deploy bundles
- `prompt`: prompt/eval quality
- `data`: structured outputs and metrics
- `hybrid`: artifact + data quality together
