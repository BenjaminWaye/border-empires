# Codex Token Budget

Use this for Codex-agent context discipline. It is about reducing agent token usage while working in this repo, not gameplay/API token usage.

## Default workflow

1. Start narrow:
   - `git status --short --branch`
   - `rg --files <likely-dir>`
   - targeted `rg "<symbol-or-error>" <likely-dir>`
2. Read small slices:
   - prefer `sed -n 'x,yp' file`
   - avoid full-file reads unless the file is already small or the whole contract matters
   - keep terminal output capped
3. State the working hypothesis before expanding search.
4. Expand only when local evidence contradicts the hypothesis or the touched boundary is shared.
5. Run focused checks first. Save full CI for PR/merge, shared contracts, or high-blast-radius changes.

## Output hygiene

- Do not paste huge logs into the conversation. Summarize the failing test, file, line, and key error.
- Prefer `rg`, `git diff --stat`, `git diff --check`, and focused test output over broad dumps.
- If a command may print thousands of lines, redirect to a temp file or narrow it before running.
- When browsing history, prefer `git show --stat` or `git show --name-only` before reading full diffs.

## Ambiguity check

Clarify before expensive work when a request could mean multiple token domains:

- Codex agent token usage
- OpenAI/API app token usage
- Border Empires AI labeling/training token usage
- server/client network payload size

If the user asks for "tokens" without a target, ask once or make the smallest reversible inspection only.

## Full-search triggers

A broad repo search is acceptable when:

- a symbol has multiple implementations
- the bug crosses package boundaries
- a public protocol/schema is involved
- the first focused search found no plausible entrypoint
- a refactor must update all call sites

Even then, search by specific terms first and avoid dumping the result set wholesale.
