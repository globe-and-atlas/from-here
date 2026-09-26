# Karpathy Loop Setup Guide

## Validation Contract

- [ ] The optimization target file is named explicitly.
- [ ] The evaluation method is named explicitly.
- [ ] `directives/run_loop.md` is filled with frontmatter and executable loop constraints.
- [ ] `execution/evaluate.py` can be run against a fixed fixture without changing that fixture.

Use this prompt with Claude or Gemini to fill in `directives/run_loop.md` and
`execution/evaluate.py` for a new project. Paste it at the start of a session
in the project directory.

---

## Prompt to paste

```
I want to set up a Karpathy optimization loop for this project.
Read `directives/run_loop.md` and `execution/evaluate.py` — they contain
placeholder TODOs that need to be filled in.

Before writing anything, ask me the following questions one group at a time.
Wait for my answers before moving to the next group.

GROUP 1 — What are we optimizing?
1. What file should the loop edit on each iteration? (default: execution/prompts.py)
2. What is the single output quality we're trying to maximize? Describe it in one sentence.
3. Is higher better, or lower? (default: higher)

GROUP 2 — The editable file
4. What constants or variables in the editable file control output quality?
   (e.g. a USER_PROFILE string, a SPEC_SUMMARY, a build_prompt() function)
5. What is the function/method signature that must stay unchanged?
   (e.g. `build_analysis_prompt(data: list[dict]) -> str`)
6. What must never change? (JSON field names, imports, minimum prompt length, etc.)

GROUP 3 — The scorer
7. How should the output be scored? (rule-based formula, or LLM judge via Claude Haiku?)
8. If LLM judge: describe what a HIGH-VALUE output looks like (score 8–10).
   Then MEDIUM-VALUE (5–7). Then LOW-VALUE / irrelevant (0–4).
9. Are there any bonuses or penalties to apply?
   (e.g. +5 for diversity across topics, −5 for duplicate cards, −10 for forced inclusions)

GROUP 4 — The fixture
10. What does the fixed test input look like? Describe its structure and a realistic example.
    (This becomes tests/fixtures/fixture.json — must never change during optimization.)

GROUP 5 — Optimization directions
11. What are 3–5 hypotheses for how to improve the score?
    (e.g. "tighten the persona description", "add chain-of-thought before output",
     "add few-shot examples", "add negative selection rules")
12. What should the loop NOT touch? (files, schemas, behaviors that are off-limits)

Once I've answered all groups, fill in:
- directives/run_loop.md  (frontmatter + all sections)
- execution/evaluate.py  (score_output() and main(), using my answers)
- Create tests/fixtures/fixture.json from my example input in question 10.

Show me a diff / summary of what you wrote before finalizing.
```

---

## Tips

- **Fixture quality is everything.** A fixture that's too easy or unrepresentative
  will produce a loop that optimizes for the wrong thing. Use real or
  realistic data, and freeze it before the first run.

- **Keep the scorer profile separate from the prompt being optimized.**
  The `_SCORER_PROFILE` in `evaluate.py` should use *different words* than
  `USER_PROFILE` / `SPEC_SUMMARY` in `prompts.py` — otherwise the loop
  can game the score by echoing the exact phrases back.

- **Rule-based > LLM-based scoring when possible.**
  If you can express quality as a formula (precision, F1, format compliance),
  prefer it. LLM scoring adds API cost and variance per iteration.

- **Set `max_iter` conservatively first** (e.g. 10) to validate the loop
  is working before letting it run to 40.

- **`results.tsv` is your log.** Each row has timestamp, commit label, score,
  status (keep/discard/crash), and a description of what changed. Review it
  to understand what directions actually moved the needle.
