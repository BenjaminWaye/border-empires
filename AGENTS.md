# Operating Rules (always-on)

These rules apply to every task. Task-conditional details are in `docs/agents/`; pointers below.

## Stack targeting

- **Staging = rewrite stack** (`apps/realtime-gateway` + `apps/simulation`, combined). **Production = legacy stack** (`packages/server`). They are not symmetric.
- **Default target for new work is the rewrite stack.** Do not modify or instrument `packages/server` unless the user explicitly says "legacy", names `packages/server`, or names a production-only behavior. If a search turns up logic only in `packages/server`, surface that as a missing port — do not extend the legacy version.
- Full deploy/Fly/Vercel details: read `docs/agents/deploys.md` before any deploy or CLI work.

## Worktrees and branches

- Always work in a worktree under `.codex-worktrees/`, never in the primary checkout. Create a new git branch named `agent/<short-slug>` per task.
- Within a single user thread, keep follow-up work on the already-active branch/worktree until merged or abandoned.
- Run `pnpm install` immediately after creating a new worktree.
- Never commit directly to `main`. Never `git push origin main`. `main` only moves via PR merge or designated fast-forward.
- Push with `git push --force-with-lease`, never plain `--force`.
- Worktree post-merge cleanup and recovery patterns: `docs/agents/concurrent-agents.md`.

## File and type discipline

- Keep source files at 500 lines or fewer when reasonable. If a file grows past 500, split into focused modules — do not add net-new feature logic, rendering, state shaping, or helpers to an already-oversized file.
- If a branch touches a large integration file, review the diff for nearby regressions and extract helpers first, so later branches don't overwrite unrelated code paths.
- Treat strict TypeScript as a hard requirement. No `Record<string, any>`, no untyped dependency bags, no broad `unknown`/`any` casts for module wiring. Factories must declare explicit dependency interfaces and return types. No `as any` at composition roots — fix the contract.
- When touching loosely typed legacy areas, tighten the boundary you are working in as part of the change.

## Changelog gate (client-visible changes)

- Any user-visible gameplay, client, shared-rules, or server behavior change must update `packages/client/src/client-changelog.ts` in the same branch, bumping the exported `version` and preserving the `title`/`summary`/`entries` structure.
- Treat the changelog as the **last** file you touch on a branch — two agents picking the same `version` is a structural collision.
- Do not ship, merge, or deploy a user-visible update if the changelog check fails.

## Testing and debugging

- For every bug fix, add or update a regression test that fails before the fix and passes after.
- Failing regression tests are merge blockers, even if the feature seems unrelated.
- Full regression + debugging-instrumentation patterns: `docs/agents/testing-and-debugging.md`.
- AI planner / snapshot / selector rules (heavy selectors banned in snapshot builders, etc.): `docs/agents/ai-guardrails.md`.
- Codex token budget and context-loading rules: `docs/agents/codex-token-budget.md`.

## Documentation maintenance

- Keep `AGENTS.md` limited to always-on operating rules and pointers. Do not expand it into architecture or gameplay docs.
- When workflow rules, repo entrypoints, or package layout change, update `AGENTS.md`, `README.md`, and affected docs in the same branch.
- Use per-topic runbooks/task notes for recurring work so agents do not rediscover the same files and commands every session: `docs/agents/topic-runbooks.md`.

## Repo reference

- Main repo: `/Users/benjaminwaye/Sites/border-empires-container/border-empires`
- Workspace packages: `packages/shared` (constants/formulas/schemas/types), `packages/game-domain` (rewrite domain logic), `packages/sim-protocol` (gateway↔sim wire), `packages/client-protocol` (gateway↔client wire), `packages/server` (legacy, prod-only), `packages/client` (browser client).
- Rewrite-stack apps (staging today): `apps/realtime-gateway`, `apps/simulation`.
- Root scripts: `pnpm dev` (shared + server + client), `pnpm build`, `pnpm test`, `pnpm lint`.
- Architecture/AI/design notes live in `docs/`. Load on demand; do not inline into this file.
