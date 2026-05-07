# Stack Targeting (Rewrite vs Legacy)

This repo has two stacks. They are not symmetric, and this is the most common source of wasted agent work.

- **Staging** (`https://staging.borderempires.com`, fly apps `border-empires-gateway-staging` + `border-empires-simulation-staging`) runs the **rewrite stack**: `apps/realtime-gateway` + `apps/simulation`, built by `Dockerfile.gateway` / `Dockerfile.simulation`.
- **Production** (fly app `border-empires`) currently runs the **legacy stack**: `packages/server`, built by `Dockerfile.server`. This is in flight; the rewrite is being prepared for prod but is not there yet.
- **Default target for any new work is the rewrite stack.** Do not modify, instrument, or build features in `packages/server` (legacy) unless the user explicitly says "legacy", names `packages/server`, or names a production-only behavior. A legacy-only change will not affect staging at all and will only land in prod once it ships there.
- If a search turns up logic only in `packages/server`, treat that as a missing port to the rewrite stack. Surface that to the user before instrumenting the legacy version, and offer to port it instead.
- "Deploy to staging" means deploying the rewrite stack. **Use `pnpm deploy:staging:all` from any worktree on any branch** — that script fast-forwards `origin/staging` to `origin/main`, deploys simulation and gateway to Fly in dependency order, then publishes the client to Vercel and flips the staging alias, all in one command. The individual steps (`fly deploy --config fly.gateway.staging.toml`, `fly deploy --config fly.simulation.staging.toml`, `pnpm deploy:client:staging`) still exist as escape hatches but should not be the primary deploy path; running them piecemeal is what historically left staging serving stale gateway / sim or stale client bundles.
- "Deploy to production" today means deploying the legacy stack to `border-empires` plus the prod client. Confirm with the user before deploying production rewrite — that's a stack-cutover operation, not a routine deploy.

# Worktree Setup

- Always create a new git branch and a new git worktree when starting a new thread or a new block of work.
- Create repo-managed worktrees under `/Users/benjaminwaye/Sites/border-empires-container/border-empires/.codex-worktrees/`, not as sibling folders under `border-empires-container/`.
- Within a single user thread, keep all follow-up work on the already-active branch and worktree until that work has been merged or explicitly abandoned. Do not create another worktree for the same thread while unmerged work is still active.
- Always run `pnpm install` immediately after creating a new git worktree before running checks or making code changes.
- Treat worktree deletion as a cleanup step only after the work is safely merged or otherwise archived. Do not use stale-worktree cleanup as a token-saving tactic.
- Before deleting any worktree, create a recovery point for unmerged work with a branch, tag, or bundle, and verify the target commit is reachable from a preserved ref.
- After a PR merge, do not consider the task complete until you verify the merge commit is reachable from `origin/main`, remove the merged worktree, delete the local feature branch, and delete the remote feature branch.
- If an automated merge command claims it deleted the branch or worktree, verify that yourself with `git worktree list`, `git branch --list`, and `git branch -r --list` before telling the user cleanup is done.
- Never report "merged" or "done" for a branch-backed task until the post-merge cleanup verification above has succeeded, or you explicitly tell the user which cleanup step is still pending.
- When a user asks to "deploy" without naming an environment, treat that as a staging deploy by default. Do not assume production unless the user explicitly says `production`, `prod`, or otherwise makes the production target unambiguous.
- Before any production deploy, make sure this checkout is updated to the latest `origin/main` so the deploy uses the merged remote state.
- Use exactly one Vercel project for the client deploys: `border-empires-client` (`projectId` `prj_QczQjhdpgV6Mu8Q03r4Ot6KWD1va`, `orgId` `team_GdmtYDKeSISxfvppIgLt4Rma`).
- Use `pnpm vercel:link:client` from `/Users/benjaminwaye/Sites/border-empires-container/border-empires` to rewrite the current worktree's `.vercel/project.json` to that pinned project before any manual Vercel CLI work.
- Reserve the `staging` branch for `https://staging.borderempires.com`; `pnpm deploy:client:staging` must run from `staging` unless an explicit one-off override env var is set.
- For production client deploys, use `pnpm deploy:client:prod` from `/Users/benjaminwaye/Sites/border-empires-container/border-empires`; it must run from `main` and verifies that the public Vercel aliases serve the new bundle without capturing the staging alias.
- Do not create or link additional Vercel projects for this repo. Reuse `border-empires-client` and prefer the stable production domain `https://border-empires-client.vercel.app/` when reporting deploy results.
- The production Fly app name for this repo is `border-empires`.
- Use `fly status -a border-empires`, `fly logs -a border-empires`, and `fly deploy -a border-empires` for production runtime checks and deploys.

# Concurrent Agent Coordination

This repo regularly has many agents (and humans) editing, merging, pushing, and deploying at the same time. Treat every shared resource as contended and assume any other actor may be racing you.

## Branching and pushing

- Never commit directly to `main`. Every change ships on a feature branch named `agent/<short-slug>` (e.g. `agent/fix-vite-ws-url-newline`). The branch name should make the task obvious to anyone scanning `git branch --all`.
- Never run `git push origin main` from an agent. `main` only moves forward via merge of a feature branch (PR or fast-forward from the designated merge step). This is the single serialization point for shared writes.
- Always `git fetch origin && git rebase origin/main` immediately before pushing your branch, even if you just rebased a moment ago. Another agent may have moved `origin/main` since.
- When pushing, use `git push --force-with-lease`, never plain `--force` or `-f`. `--force-with-lease` refuses if the remote moved since your last fetch and prevents silently overwriting another agent's work.
- Set a unique committer identity per agent thread (`git config user.email "agent-<slug>@border-empires"`) so `git log --author=` can find lost commits later.
- Before any history-rewriting operation (`rebase`, `reset --hard`, branch deletion, `--force-with-lease` push), confirm the commits you might orphan are reachable from at least one preserved ref (a backup branch, a tag, or your reflog within the 90-day window).
- Before deleting a merged feature branch, verify the feature tip is contained in `origin/main`, not just in the PR UI or another remote branch ref.

## Verifying your work survived

- After every commit, run `git log -1 --stat` and confirm the listed files match the changes you just made. If a linter, autosave, or another agent reverted your edit, the commit captured a stale state; you'll catch it here, not after pushing.
- After every rebase or pull, diff your working branch against the merge base (`git diff $(git merge-base HEAD origin/main)..HEAD --stat`) and confirm your intended files are still in the diff. Do not skip this; lost commits look exactly like a clean rebase.
- Before merging a PR, scan `git reflog | head -20` for any `reset:` or `checkout:` lines that look unintentional. Recover from reflog if a commit went missing.
- After merging a PR, re-check `git worktree list`, `git branch --list <branch>`, and `git branch -r --list origin/<branch>` so cleanup failures are caught immediately.

## Working-tree contention

- One worktree per agent. Never edit files in a directory another agent is also editing.
- If you observe a file you just wrote being modified back (a "linter or other agent reverted my change" signal), stop further edits in that directory and confirm with the user before continuing. You are racing another writer.
- Do not edit `packages/client/src/client-changelog.ts` until your branch is ready to merge. Two agents both choosing the same `version` is a structural collision; the changelog should be the last file you touch on a branch.

## Deploys and other non-idempotent global ops

- Treat the following as serialized resources that only one agent may operate on at a time: `git push origin main`, `vercel deploy --prod`, `vercel env rm`/`vercel env add`, `vercel alias set`, `fly deploy -a border-empires`, `fly secrets set`, any database migration command. If you cannot guarantee you are the only agent running these, do not run them; surface the deploy request to the user and let them sequence it.
- Production env vars (Vercel and Fly) are global mutable state. When updating one, prefer `printf '<value>' | vercel env add` over the interactive prompt (avoids stray newlines), and re-read the value with `vercel env pull && cat .vercel/.env.production.local` immediately after to verify it round-trips clean.
- After any prod deploy, verify by hitting the live URL: confirm `wss://border-empires.fly.dev/ws` (or whichever target) round-trips a valid handshake (`wsReadyState` reaches `1`) within 5 seconds. A successful build is not a successful deploy.
- If a deploy fails or a smoke check is red, do not roll forward by re-running. Roll back to the previous Vercel/Fly release, then investigate.

## Recovery patterns

- Lost commit (your code disappeared after a rebase/checkout): `git reflog` -> find the SHA -> `git branch recovered/<slug> <sha>` to pin it. Then cherry-pick onto a fresh branch off current `origin/main`.
- Force-push collision (your `--force-with-lease` was rejected): `git fetch origin && git log origin/main` to see what landed, then rebase your branch on top of that and try again.
- Two PRs both bumped the changelog to the same version: rebase the second one on top of the first, increment the version (e.g. `.4` -> `.5`), and merge the entries together so neither fix is lost from the summary.

# Merge Conflicts

- After pulling the latest `main`, if merge conflicts occur, do not hand-merge old and new code together.
- Treat conflicted files as stale integration points: read the updated `main` version first, then rewrite or reapply the intended feature work onto that updated file.
- Prefer replacing the conflicted implementation with a fresh version based on current `main` rather than trying to preserve both sides of the conflict.
- After reapplying the feature on top of updated `main`, rerun the relevant builds/tests before merging or deploying.

# Regression Coverage

- Prevent regressions with automated tests whenever the behavior is deterministic enough to assert locally.
- Prefer unit tests for pure game logic and other stable rules such as math, scoring, world generation invariants, AI planning, and state transition helpers.
- For every bug fix, add or update a regression test that fails before the fix and passes after it.
- Do not rely on unit tests alone for client interaction regressions; add integration or end-to-end coverage when the risk is in UI flows, networking, or cross-system behavior.

# Strict Typing

- Treat `strict` TypeScript coverage as a hard requirement, not an aspiration. New code must preserve and strengthen static type safety instead of routing around it.
- Do not use `Record<string, any>`, untyped dependency bags, or broad `unknown`/`any` casts for module wiring when the dependency shape is knowable.
- Factory modules and runtime composition helpers must declare explicit dependency interfaces and explicit return types so missing or misspelled injections fail at compile time.
- Do not use `as any` at factory call sites in `main.ts` or equivalent composition roots to silence type mismatches. Fix the contract instead.
- When touching loosely typed legacy areas, prefer tightening the boundary you are working in as part of the change rather than extending the loose pattern.

# Debugging Workflow

- When a bug is unclear or a fix does not work on the first pass, instrument the exact failing path before trying more speculative code changes.
- Prefer temporary localhost-focused logging at the client input layer, client action-flow layer, websocket send/receive layer, and server receipt/validation layer so you can see where execution stops.
- For client interaction bugs, inspect the full event sequence (`mousedown`, `mouseup`, `click`, drag state, suppression flags) before changing gameplay logic.
- For client/server action bugs, confirm whether the client actually sends the message and whether the server receives it before changing validation rules.
- Remove or narrow noisy debug logs after the issue is understood, but keep regression tests for the branch that failed.

# AI CPU Guardrails

- Do not call heavy concrete AI selector functions such as `bestAiSettlementTile`, `bestAiTownSupportSettlementTile`, `bestAiIslandSettlementTile`, `bestAiFortTile`, `bestAiEconomicStructure`, `bestAiEnemyPressureAttack`, or `bestAiFrontierAction` from planner snapshot or planning-static cache builders.
- Planner snapshot and planning-static cache code must derive booleans and coarse scores from cached territory summaries, lightweight signals, and versioned indexes only.
- Concrete AI target selection should run only for the action the AI actually chose, and repeated late-game selector scans must be cached or version-gated.
- When changing AI code, run the server AI regression tests and keep coverage for any bug that could reintroduce multi-second AI ticks on a single CPU.
- Treat failing regression tests as merge blockers. Do not merge, push, or deploy when the relevant package test suite is failing, even if the feature you were working on seems unrelated.
- Any branch that changes `packages/client/src/main.ts` must rerun `pnpm --filter @border-empires/client test` and the touched-package build/lint checks after the final reapply onto current `main`.

# File Size Discipline

- Keep source files at 500 lines or fewer whenever reasonably possible.
- If a file grows beyond 500 lines, split out focused functionality into smaller modules instead of continuing to add code to the oversized file.
- Do not add net-new feature logic, rendering, state shaping, helper code, or orchestration to an already-oversized file when that code can live in a focused module.
- Prefer small modules with targeted tests over large integration files that mix unrelated responsibilities.
- If a branch touches a large integration file, review the diff for nearby regressions and extract helpers first so later branches do not overwrite unrelated code paths.

# Documentation Maintenance

- Keep `AGENTS.md` limited to durable operating rules, workflow guardrails, and compact repo references. Do not expand it into a full architecture or gameplay document.
- Keep `README.md` accurate for setup, scripts, deploy entrypoints, and high-level product/repo overview.
- When workflow rules, repo entrypoints, or core package/layout descriptions change, update the relevant `AGENTS.md`, `README.md`, and affected docs in the same branch so instructions do not drift.

# Release Notes Guardrail

- Any user-visible gameplay, client, shared-rules, or server behavior change must update `packages/client/src/client-changelog.ts` in the same branch.
- Every changelog update must bump the exported release `version` and keep the same structure: `title`, `summary`, and `entries` with `title`, `why`, and `changes`.
- Do not ship, merge, or deploy a user-visible update if the changelog check fails.

# Repo Reference

- Main repo: `/Users/benjaminwaye/Sites/border-empires-container/border-empires`
- Workspace packages:
  - `packages/shared`: shared constants, formulas, schemas, and types.
  - `packages/game-domain`: rewrite-stack domain logic and constants shared between simulation and gateway.
  - `packages/sim-protocol`: wire types between gateway and simulation worker.
  - `packages/client-protocol`: wire types between gateway and browser client.
  - `packages/server`: legacy authoritative game server. Currently runs in production; not on staging. Only modify when the user explicitly asks for legacy work or names a production-only behavior.
  - `packages/client`: browser client, canvas renderer, auth flow, HUD/panels, input handling, and websocket sync.
- Apps (rewrite stack — what runs on staging today):
  - `apps/realtime-gateway`: client-facing websocket gateway, auth binding, INIT payload assembly, command submission. Deployed to `border-empires-gateway-staging` via `Dockerfile.gateway`.
  - `apps/simulation`: authoritative simulation worker, spawn placement, tick loop, world events. Deployed to `border-empires-simulation-staging` via `Dockerfile.simulation`.
- Root scripts:
  - `pnpm dev`: builds shared, then runs server and client together.
  - `pnpm build`, `pnpm test`, `pnpm lint`: recurse through workspace packages.
- Primary reference docs:
  - `README.md` for setup, scripts, and product overview.
  - `docs/` for architecture, AI, and design notes.
- Load those docs on demand when the task needs them instead of copying large system descriptions into this file.
