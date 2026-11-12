# Operating Rules

## Context and task scope

- Start with the user's question, not a full repository survey. For short explanations, make one narrow discovery batch and one bounded evidence read when needed; expand only for a concrete unresolved correctness issue. See `docs/agents/codex-token-budget.md` for complex investigations.
- Read-only questions and feasibility reviews do not create worktrees, fetch, install dependencies, run builds/tests, or change files. Use an existing checkout. Once edits are needed, follow the worktree rules below. Do not turn a question into implementation or PR work without a request.
- Before assessing or proposing gameplay mechanics, read `docs/core-loop.md` §1 (pillars and owner intent) and the relevant `docs/game-mechanics.md` sections, check for an existing plan in `docs/`, and verify the affected source contracts/tests. Ground suggestions in existing resources, progression, territory and renderer constraints. Label ideas needing new systems or rule changes explicitly; do not present them as existing capabilities. Context budgets are soft targets: gather enough evidence for correctness.
- Prefer symbol searches and small excerpts over full files. Batch independent reads in one tool call. Do not repeatedly load the documentation map, rules, or unrelated runbooks. Keep command output bounded; summarize failures.

## Runtime and source

- Staging and production use only `apps/realtime-gateway` + `apps/simulation` on Hetzner; the static client is served by Caddy. `packages/server` was deleted; archive references are historical. Fly apps were destroyed; there is no Fly rollback. Hetzner CI must not invoke Vercel.
- Packages: `packages/shared` (rules/types), `packages/game-domain`, `packages/sim-protocol`, `packages/client-protocol`, `packages/client`, `packages/storybook`. Simulation AI is under `apps/simulation/src/ai/`. Tests live beside their module, not directly under `src/` roots.
- Source changes must preserve strict TypeScript, explicit dependency contracts, and the 500-line growth limit. Extract cohesive helpers from oversized files; never compact code to pass the limit. Read the matching sections of `docs/agents/implementation-rules.md` before applicable source changes.
- Map overlays/highlights/selections must cover both 2D canvas and true-3D, guarded by `isTrue3DRendererActive()`, or explicitly disclose missing coverage and why in the PR and final summary. Check both branches before claiming completion.
- Every bug fix requires a regression test that fails before and passes after. Failing regressions block merge. Run `pnpm ci:local` before opening a PR; inspect actual CI status. Keep required lint/build/test and changelog gates.
- User-visible changes require a `CLIENT_CHANGELOG_ENTRIES` entry in `packages/client/src/client-changelog/client-changelog-data.ts`; capture a frozen Unix-ms `createdAt` once from `Date.now()`. No version bump; append entries. A failed changelog check blocks shipping.

## Editing and shipping

- Make edits only in a worktree under `.codex-worktrees/` on an `agent/<short-slug>` branch. Fetch first; start normal work from latest `origin/develop`. Use `origin/main` only for explicit production hotfix/release work. Keep thread follow-ups on the active worktree until merged or abandoned.
- Prefer `pnpm worktree:new <slug>`; after manual worktree creation, immediately run `pnpm install --frozen-lockfile`. Never commit/push directly to `develop` or `main`; promote only through PRs. Use `--force-with-lease`, never `--force`. Recovery/cleanup: `docs/agents/concurrent-agents.md`.
- Before deploys or operational cloud CLI work, read `docs/agents/deploys.md`. Ordinary source searches and local Git commands do not require deployment docs.
- Before adding a cache/map or snapshot state, read `docs/agents/state-and-persistence-discipline.md`. Before AI planner changes, read `docs/agents/ai-guardrails.md` and `docs/agents/topics/ai-planner.md`.
- Before gameplay/fiction changes, read `docs/lore/README.md` and affected `docs/lore/galactic-lore.md` sections. Update canon in the same branch for changes to meaning; keep numerical balance in gameplay docs. Otherwise report "Lore reviewed; no canon change". Full maintenance requirements: `docs/agents/implementation-rules.md`.
- Update `AGENTS.md`, `README.md`, and affected docs when workflow, entrypoints, or layout change. Check README accuracy before a PR.

## Load only the relevant guide

Use `docs/README.md` when the topic is unknown. Known topics go directly to: tests/debugging → `docs/agents/testing-and-debugging.md`; gameplay → `docs/game-mechanics.md`; structures → `docs/adding-a-structure-playbook.md`; local gameplay checks → `docs/agents/topics/agent-gameplay-testing.md`; native wrappers → `docs/agents/mobile-apps.md` (sync before opening projects; never ship remote `server.url`); deletion/restore → `docs/agents/account-deletion.md` (stop both processes before offline erasure; reapply deletion ledger before restore); Great Project artwork → `docs/monument-models.md`. Reusable topic notes follow `docs/agents/topic-runbooks.md`.
