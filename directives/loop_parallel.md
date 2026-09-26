---
max_iter: 15
dimensions:
  - accuracy
  - ux_copy
  - code_quality
  - performance
---

# Parallel Loop Config — from-here

## Validation Contract

- [ ] Each parallel loop has a separate working copy or isolated output path.
- [ ] No two running loops write to the same `results.tsv`.
- [ ] Each loop records its score and keep/discard decision independently.
- [ ] The winning artifact is selected from recorded results rather than memory.

Run 4 independent Karpathy loops in parallel git worktrees, each optimizing a
different quality dimension of the same editable file. After completion, the
leaderboard shows which change improved quality most and provides cherry-pick commands.

## Customization Checklist

Before running, complete these steps:

- [ ] Create `directives/loop_accuracy.md` (eval: rule-based correctness checks)
- [ ] Create `directives/loop_ux_copy.md` (eval: Claude Haiku rates copy quality)
- [ ] Create `directives/loop_code_quality.md` (eval: ast-based complexity analysis)
- [ ] Create `directives/loop_performance.md` (eval: output size / density)
- [ ] Create `execution/evaluate_accuracy.py`
- [ ] Create `execution/evaluate_ux_copy.py`
- [ ] Create `execution/evaluate_code_quality.py`
- [ ] Create `execution/evaluate_performance.py`

See `budget-dashboard/` for complete working examples of all 4 dimensions.

## Running

```bash
# Single overnight run (recommended):
tmux new -s loops
caffeinate -i python3 /Users/danielbally/Git/.agent/loop/parallel_loops.py \
  --project /path/to/this/project
# Ctrl+B, D to detach

# Check progress:
tmux attach -t loops

# Leaderboard only (if loops already ran):
python3 /Users/danielbally/Git/.agent/loop/leaderboard.py \
  --project /path/to/this/project --open
```

## Dimensions

| Dimension    | What it optimizes                                | Eval approach         |
|--------------|--------------------------------------------------|-----------------------|
| accuracy     | Correctness of computation/outputs               | Rule-based assertions |
| ux_copy      | Quality of user-facing labels, tooltips, copy    | Claude Haiku rubric   |
| code_quality | Code structure, type hints, function length      | AST analysis (no LLM) |
| performance  | Output file size, inline style density           | Static analysis       |

## Safety Notes

- Each dimension runs in a separate git worktree — no shared file corruption
- Peak commit is cherry-pickable after the run — nothing is auto-merged
- Worktrees live at `.tmp/worktrees/<dimension>/` — clean up with `git worktree prune`
- Results at `.tmp/loop_runs/<dimension>/results.tsv`
