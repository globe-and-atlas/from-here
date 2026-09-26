# Directive: Prompt Testing with Promptfoo

## Validation Contract

- [ ] `promptfoo/promptfooconfig.yaml` targets the prompt or user-facing AI endpoint under test.
- [ ] `npx promptfoo@latest eval` completes or records a clear blocker.
- [ ] User-facing AI changes include a red-team run or an explicit reason it was skipped.
- [ ] Evaluation results are captured in the location documented by the directive.

## Purpose

Systematically evaluate and red-team any LLM prompt in this project before shipping.
Use this directive when: adding a new prompt, changing a system prompt, switching models,
or when a user reports unexpected AI output.

## Inputs

- `promptfoo/promptfooconfig.yaml` — test suite config
- `prompts/` — prompt files referenced by config (create if absent)
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in `.env`

## Tools / Scripts

- `npx promptfoo@latest eval` — runs the eval suite
- `npx promptfoo@latest view` — opens results UI in browser
- `npx promptfoo@latest redteam run` — runs adversarial attack suite (requires redteam block in config)

## Outputs

- Results viewable in browser at `http://localhost:15500` (after `view`)
- CI: exit code 0 = pass, 1 = failure (use in GitHub Actions)

## Procedure

### 1. First-time setup (per project)

```bash
npm install -g promptfoo
echo "ANTHROPIC_API_KEY=sk-..." >> .env
```

### 2. Configure the test suite

1. Edit `promptfoo/promptfooconfig.yaml`:
   - Set `description` to the project name
   - Point `prompts` at actual prompt files or inline them
   - Add test cases covering: happy path, edge cases, adversarial inputs
2. If the project has user-facing AI, uncomment the `redteam:` block
   and set `purpose` to describe what the AI does

### 3. Run evals

```bash
cd path/to/project
npx promptfoo@latest eval --config promptfoo/promptfooconfig.yaml
npx promptfoo@latest view
```

### 4. Interpret results

- **Pass**: all assertions green — safe to ship
- **Fail on llm-rubric**: review output, tighten the prompt or add an example
- **Fail on latency**: consider a smaller model for the hot path
- **Fail on red team**: treat as a security issue — fix before exposing to users

### 5. Red team (user-facing apps only)

```bash
npx promptfoo@latest redteam run --config promptfoo/promptfooconfig.yaml
```

Priority vulnerabilities to check: `prompt-injection`, `pii:direct`, `jailbreak`.
If any fail, harden the system prompt with explicit refusal instructions and retest.

## Edge Cases

- **Model not supported**: check `providers:` list against current promptfoo docs
- **Rate limits**: add `--delay 1000` flag to slow down requests
- **Cost control**: use `claude-haiku-4-5-20251001` for regression runs, sonnet only for final eval

## When to Run

| Trigger | Action |
|---|---|
| New system prompt written | Full eval suite |
| Prompt wording changed | Targeted test on changed cases |
| Model swapped | Full eval + latency check |
| User reports jailbreak | Red team run |
| Pre-deploy checklist | Full eval suite must pass |
