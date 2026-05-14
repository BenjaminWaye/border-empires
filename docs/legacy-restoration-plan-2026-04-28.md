# Legacy Restoration Plan — 2026-04-28

This is a self-contained handoff for the next agent (likely Sonnet) to execute.
The previous (Opus) session diagnosed the situation and authored this plan; do
not assume the executor will have any prior conversation context.

## Why this exists

Production at `wss://border-empires.fly.dev/ws` is broken. Symptom (from a
real client log on 2026-04-28):

```
[auth-progress] waiting {elapsedSec: 37, connection: 'connecting',
  title: 'Securing session',
  detail: 'Google account connected, but the realtime game co… The server
           may still be starting or overloaded.',
  wsReadyState: 0}
```

Firebase Google sign-in completes; the WebSocket to the legacy app never
reaches `readyState=1`. The client default backend is still legacy
(`packages/client/src/client-app-runtime-env.ts:49`), so this is a legacy
app failure, not a backend-selector misroute.

The user has decided to revert from the rewrite (gateway + simulation) back
to the legacy monolith (`packages/server`), but is keeping the rewrite code
in `main` for now while pursuing a parallel "make rewrite work" track. This
plan handles the **legacy track only**. When the user signals the rewrite
track is dead, Phase E removes the rewrite code from `main`.

## User's verbatim answers (do not re-ask)

1. "I don't understand what the seasons rollover is. But basically production
   is fucked so we are going to reset everything when we are done. If we can
   login to production that is good for stresstesting purposes." → No data
   migration work needed. Wiping the Fly volume snapshot dir is fair game.
2. "I am trying to get the rewrite working while you are getting legacy
   working. So we need to keep both until one works. Then we will stash the
   rewrite code in a branch and cut it out of main." → Both stacks coexist
   in `main` until the user signals. Do not delete rewrite code yet.
3. "Just a clone of the production border-empires. Doesn't even need to be a
   clone map wise just needs to be a place we can push things for testing
   before going to prod. So it could run a completely separate season." →
   Staging is just a parallel Fly app + volume + fresh world. No Postgres,
   no special workflow.
4. "attack debug, simulation lag, sim startup are not portable to prod so
   don't think about that. What I think about is behaviour like wooden fort,
   any new popups or prompts or metrics we are logging." → Parity audit
   scope is *player-visible* changes only. Skip rewrite-only architectural
   work.
5. "If we can lets finish this tonight" → Tonight = 2026-04-28 evening.
   Realistic critical path is A → B → C; D is a stretch.
6. "I am only talking about player visible." → Confirms #4.

## Context the executor needs

### Repo geometry
- Active repo: `/sessions/amazing-keen-clarke/mnt/border-empires-container/border-empires/`
  (on the user's machine: `/Users/benjaminwaye/Sites/border-empires-container/border-empires/`).
- All other folders under `border-empires-container/` are stale worktrees;
  ignore them.
- Project rules are in `/sessions/amazing-keen-clarke/mnt/border-empires-container/AGENTS.md`
  (container level, not in the repo). Read it before any git/deploy work.
  In particular: never commit to `main`, branch as `agent/<slug>`,
  `--force-with-lease` only, treat `fly deploy` and `vercel deploy --prod` as
  serialized resources you ask the user to run.

### Current state of legacy on `main`
- `packages/server/src/main.ts` is **10,254 lines** (down from 17,331 at the
  monolithic peak). The 2026-04-07 → 2026-04-13 split is intact; main.ts
  grew only +30 lines after the rewrite landed. There are 167 sibling
  `*.ts` files under `packages/server/src/`. The user's worry about losing
  the file-split is unfounded; do **not** spend time recovering it.
- Last pre-rewrite commit on `main`: `041d81c Add public HQ summary endpoint
  (#12)` (2026-04-15). First rewrite commit on `main`: `b43aa45 Phase 0/land
  rewrite (#13)` (2026-04-20). The diff `041d81c..HEAD` is the universe of
  changes that need parity-auditing in Phase C.

### Production deploy targets
- Legacy prod: Fly app `border-empires`, region `arn`, defined in
  `fly.server.toml`. WS at `wss://border-empires.fly.dev/ws`. Volume
  `border_empires_data` mounted at `/data`, snapshots at `/data/snapshots`.
  `min_machines_running = 1`, `auto_stop_machines = "off"` (so it should
  always be up; if it isn't, something crashed it).
- Rewrite prod: `border-empires-gateway` (gateway) + `border-empires-simulation`
  (sim). Don't touch.
- Rewrite staging: `border-empires-combined-staging`.
  Pattern to mirror for legacy staging.
- Client: one Vercel project, `border-empires-client` (per container
  `AGENTS.md` — never create another). Aliases currently in use:
  - `play.borderempires.com` → prod build (legacy backend by default).
  - `staging.borderempires.com` → preview build wired to the **rewrite**
    gateway staging (`scripts/deploy-client-preview.mjs` sets both
    `VITE_WS_URL` and `VITE_GATEWAY_WS_URL` to
    `wss://border-empires-combined-staging.fly.dev/ws`).
  - `border-empires-client.vercel.app` → stable Vercel preview alias used
    only by `deploy-client-prod.mjs` to verify a release rolled out.
  - **`staging-legacy.borderempires.com` will be added in Phase B for the
    legacy staging backend.**
- Client backend selection: Vite build-time env vars
  `VITE_WS_URL` (legacy host) and `VITE_GATEWAY_WS_URL` (gateway host) set
  via `vercel deploy --build-env`. At runtime, `selectBackend()` in
  `packages/client/src/client-backend-selector.ts` honours
  `?backend=legacy|gateway` URL param > `be-backend` cookie > env default.
  The legacy default lives in `packages/client/src/client-app-runtime-env.ts:49`.

### Sandbox limits (executor must know)
The Cowork/Claude-Code sandbox cannot:
- Run `fly` CLI (no Fly auth, no network access to fly.io API for status).
- Run `vercel` CLI.
- Reach production WebSockets or HTTP endpoints from inside the sandbox.

The executor **must** hand specific commands to the user and wait for output.
Do not silently substitute a sandbox-side approximation.

## Phase A — restore prod WS handshake

**Goal:** a fresh browser load of `https://play.borderempires.com/` reaches
`wsReadyState=1` against `wss://border-empires.fly.dev/ws` within 5 seconds,
and INIT lands.

### A1. Diagnose (user runs, executor parses)

Ask the user to run, in this order:

```
fly status -a border-empires
fly machine list -a border-empires
fly logs -a border-empires --since 1h | tail -300
curl -sv -o /dev/null -m 10 https://border-empires.fly.dev/health 2>&1 | tail -30
```

If `/health` doesn't exist, also try `/` and `/metrics`. The legacy server
exposes Prometheus metrics on the same Fastify server in some configurations.

### A2. Decision tree

Based on the output:

**Case 1: machine state is `stopped` or repeatedly crashing on boot.**
Look at the boot crash in `fly logs`. Common causes:
  - Snapshot reload failing because of a schema/format change introduced by
    a recent commit. Recovery: ask user to `fly ssh console -a border-empires`
    then `rm -rf /data/snapshots/*` then restart the machine. The user has
    pre-approved wiping data.
  - Dockerfile.server or main.js missing a dist artifact. Look for
    `Cannot find module` in the boot log. Recovery: check the latest CI run
    on `main`; if last green CI is older than the last main commit, ask the
    user to redeploy from the green SHA: `git checkout <sha> &&
    fly deploy -a border-empires --image-label legacy-restore-<sha>`.

**Case 2: machine state is `started`, `/health` responds, but WS upgrades
return non-101 or hang.**
Recently merged commits may have broken the WS handshake. Bisect with:
```
git log --first-parent main --since="2026-04-22" --pretty=format:'%h %s' \
  -- packages/server/src
```
Look for commits touching auth (`Fix staging auth identity diagnostics`,
`auth-init-bootstrap`), socket upgrade paths, or `client-app-runtime-env`.
Check each suspect with `git show <sha> -- packages/server/src`. If the bad
commit is identified, create branch `agent/legacy-prod-revert-<sha>`,
`git revert <sha>` (no commit-amend), push, and ask user to `fly deploy
-a border-empires` after rebasing onto current main.

**Case 3: machine up, /health hangs, no logs since last deploy.**
Snapshot reload is wedging boot before any log line emits. Same fix as
Case 1: SSH in, wipe `/data/snapshots/*`, restart machine.

**Case 4: machine up, /health 200, WS handshake completes, but `INIT` never
arrives.**
This is a server-internal stall, not a transport issue. Look for "AI tick"
or "frontier expansion" log lines from the runtime; if AI is starving the
event loop on cold start, increase `AI_TICK_BATCH_SIZE` or temporarily set
`AI_PLAYERS=0` via `fly secrets set` to confirm. This is the failure mode
the user remembers from before the rewrite.

### A3. Verify (user reports back)

Once a fix is applied, user does a single fresh-incognito browser load of
`https://play.borderempires.com/?backend=legacy` and reports the
`[auth-progress]` log. Success = `wsReadyState=1` and an `INIT` message
appears in the network tab. Do not declare A complete on `fly logs` alone.

## Phase B — stand up legacy staging (backend + client alias)

**Goal:** a Fly app `border-empires-staging` running current `main` with its
own volume and a fresh seed world (WS at
`wss://border-empires-staging.fly.dev/ws`), plus a Vercel client alias
`https://staging-legacy.borderempires.com/` that points the in-browser
client at that staging backend by default.

This deliberately mirrors the existing rewrite-staging shape:
`border-empires-combined-staging.fly.dev` ← `staging.borderempires.com`.
The legacy version is `border-empires-staging.fly.dev` ←
`staging-legacy.borderempires.com`.

### B1. Add `fly.server.staging.toml`

Create the file at the repo root by cloning `fly.server.toml` with these
diffs:

```toml
app = "border-empires-staging"

[env]
  NODE_ENV = "staging"
  SNAPSHOT_DIR = "/data_staging/snapshots"
  AI_PLAYERS = "20"
  # everything else identical to fly.server.toml — same AI throttling, same
  # worker flags (AI_PLANNER_WORKER = "0", SIM_COMBAT_WORKER = "1", etc.)

[http_service]
  auto_stop_machines = "stop"   # cost: stays asleep when idle
  min_machines_running = 0      # cost: cold starts allowed in staging

[[mounts]]
  source = "border_empires_data_staging"
  destination = "/data_staging"
  initial_size = "1gb"

[[vm]]
  memory = "256mb"   # half of prod, cost-conscious
```

Keep `Dockerfile.server` shared with prod — no separate Dockerfile.

### B2. Add `scripts/deploy-server-staging.command`

Create a runner that mirrors the existing rewrite-staging convention. The
script must be idempotent and runnable from the repo root:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Deploying legacy server to STAGING (border-empires-staging)..."
fly deploy -c fly.server.staging.toml --remote-only
echo "Done. Probe with:"
echo "  curl -sv -o /dev/null -m 10 https://border-empires-staging.fly.dev/health"
```

Mark executable: `chmod +x scripts/deploy-server-staging.command`.

### B3. Add `pnpm staging:deploy:server` script

In root `package.json`, add to `"scripts"`:
```
"staging:deploy:server": "bash scripts/deploy-server-staging.command"
```

### B4. User runs the one-time setup

Hand to user (executor cannot run these):

```
fly apps create border-empires-staging --org <user's org>
fly volumes create border_empires_data_staging --region arn --size 1 \
  -a border-empires-staging
# Replicate the legacy prod secrets onto staging (Firebase project id, etc.):
fly secrets list -a border-empires | awk 'NR>1 {print $1}'
# For each secret, copy the value from prod or set a staging-appropriate one:
fly secrets set FIREBASE_PROJECT_ID=... -a border-empires-staging
# Then deploy:
pnpm staging:deploy:server
```

### B5. Verify the staging backend (server-only, before the client alias)

User runs:
```
fly status -a border-empires-staging
curl -sv -o /dev/null -m 10 https://border-empires-staging.fly.dev/health
```

Then a one-off WS handshake probe from the user's machine (no client
involved) — this isolates the backend from any client-side issues:
```
node -e "
const { WebSocket } = require('ws');
const ws = new WebSocket('wss://border-empires-staging.fly.dev/ws');
const t = Date.now();
ws.on('open', () => { console.log('OPEN in', Date.now()-t, 'ms'); ws.close(); });
ws.on('error', (e) => console.error('ERR', e.message));
setTimeout(() => process.exit(0), 8000);
"
```
Success = `OPEN in <2000 ms`. If this passes, B5 is green and we can move
to the client alias in B7.

### B6. Commit and PR (backend pieces)

Branch: `agent/legacy-staging-fly-app`. Files added:
- `fly.server.staging.toml`
- `scripts/deploy-server-staging.command`
- `package.json` (one new script line for `staging:deploy:server`)

Do **not** touch `packages/client/src/client-changelog.ts` on this branch.
PR title: `ops(staging): add legacy fly app and deploy script`. After
merge, the user runs `pnpm staging:deploy:server` themselves.

### B7. Add `staging-legacy.borderempires.com` Vercel alias

The pattern is already in `scripts/deploy-client-preview.mjs` — that script
deploys to `staging.borderempires.com` and points it at the **gateway**
staging backend. Mirror it as `scripts/deploy-client-staging-legacy.mjs`:

```js
import { spawnSync } from "node:child_process";

const rootDir = new URL("../", import.meta.url);
const stagingAlias = process.env.STAGING_LEGACY_CLIENT_ALIAS
  ?? "staging-legacy.borderempires.com";
const stagingLegacyWsUrl = process.env.STAGING_LEGACY_WS_URL
  ?? "wss://border-empires-staging.fly.dev/ws";

// (reuse the run() and normalizeDeploymentUrl() helpers verbatim from
// scripts/deploy-client-preview.mjs — just copy them across.)

run("pnpm", ["--filter", "@border-empires/shared", "build"]);
run("pnpm", ["--filter", "@border-empires/client", "build"]);
const deploymentUrl = normalizeDeploymentUrl(
  run("npx", [
    "vercel",
    "deploy",
    "--yes",
    "--build-env",
    `VITE_WS_URL=${stagingLegacyWsUrl}`
    // NOTE: deliberately do NOT set VITE_GATEWAY_WS_URL.
    // selectBackend() falls back to legacyWsUrl when gatewayWsUrl is
    // undefined, so the staging-legacy client is unconditionally legacy.
  ])
);
console.log(`Preview deployment URL: ${deploymentUrl}`);
run("npx", ["vercel", "inspect", deploymentUrl]);
const trimmed = deploymentUrl.endsWith("/") ? deploymentUrl.slice(0, -1) : deploymentUrl;
run("npx", ["vercel", "alias", "set", trimmed, stagingAlias]);
console.log(`Staging-legacy alias updated: https://${stagingAlias}/`);
```

Add the matching `package.json` script:
```
"staging:deploy:client-legacy": "node scripts/deploy-client-staging-legacy.mjs"
```

User runs (one-time DNS, then deploy):
```
# Same anycast IP that staging.borderempires.com already uses:
# Add A record  staging-legacy.borderempires.com → 76.76.21.21
# (Cloudflare or wherever borderempires.com DNS lives.)

pnpm staging:deploy:client-legacy
```

If `vercel alias set` errors on missing DNS, fix the A record and rerun
the script — the deploy itself is idempotent.

### B8. Verify the staging client end-to-end

User browses to `https://staging-legacy.borderempires.com/` in a fresh
incognito window. Success criteria:
- Firebase Google sign-in completes.
- `[auth-progress]` log reaches `wsReadyState=1` within 5 seconds.
- An `INIT` message arrives and the map renders with the player's tile.
- HUD elements render (this confirms the legacy backend is wired up
  correctly — the prod symptom is HUD never rendering).

If verified, B is complete. Move to C.

### B9. Commit the client-alias pieces

Branch: `agent/legacy-staging-client-alias`. Files added:
- `scripts/deploy-client-staging-legacy.mjs`
- `package.json` (second new script line)

PR title: `ops(staging): add staging-legacy client alias deploy script`.
This branch can land in parallel with B6's branch — they touch disjoint
files.

## Phase C — player-visible parity audit (`041d81c..HEAD`)

**Goal:** a single doc, `docs/legacy-parity-2026-04-28.md`, that lists every
player-visible behavior change merged on `main` between 2026-04-15 and
2026-04-28, with a status flag per item.

### C1. Generate the candidate list

Run from repo root:

```
git log --first-parent --pretty=format:'%h|%ad|%s' --date=short \
  041d81c..HEAD > /tmp/parity-candidates.txt
git diff --stat 041d81c..HEAD -- 'packages/client/src/' \
  > /tmp/parity-client-stat.txt
git diff --stat 041d81c..HEAD -- 'packages/server/src/' 'packages/shared/src/' \
  > /tmp/parity-server-stat.txt
```

### C2. Filter to player-visible

For each commit in `/tmp/parity-candidates.txt`, classify as:
- **player-visible** — adds/changes UI, popups, prompts, HUD elements,
  rendered tiles/icons, AI behavior, combat rules, economy rules, season
  semantics, audio, or input handling.
- **arch-only** — gateway, simulation, parity-trace, supabase, postgres,
  staging-only diagnostics, CI, build tooling, fly config. Skip per user's
  rule #4.
- **already-in-legacy** — most "fix" commits to packages/server, packages/shared,
  or packages/client are auto-in-legacy because legacy builds from the same
  packages. Mark these for spot-check, not porting.

Specifically watch for: wooden fort, new popups, new prompts, new HUD
metrics, 3D ownership rendering, active-edge AI frontier planning,
season rollover semantics, leaderboard ghost players, logout button
behavior, settlement support areas UI, public HQ summary endpoint.

### C3. Write the parity doc

Output format for `docs/legacy-parity-2026-04-28.md`:

```markdown
# Legacy Parity Audit — 2026-04-28

Diff range: 041d81c..HEAD (2026-04-15 → 2026-04-28)
Total commits in range: <N>
Player-visible items: <M>

## Status legend
- ✅ confirmed working in legacy on staging
- ⚠️ in legacy code but untested on staging
- ❌ gateway-only, needs porting to legacy
- ⏭️ arch-only, skipped per user instruction (#4)

## Player-visible items

### <Feature name>
- **Commit(s):** <sha> <title>
- **Player-visible behavior:** <one sentence>
- **Where in code:** <file:line>
- **Status:** ⚠️
- **Verification step:** <what to do in Phase D to flip ⚠️ → ✅>

(repeat for each item)

## Arch-only items skipped
<bulleted list of <sha> <title> for traceability>
```

### C4. Commit the doc

Branch: `agent/legacy-parity-audit-2026-04-28`. Single file added:
`docs/legacy-parity-2026-04-28.md`. PR title:
`docs(parity): legacy vs gateway audit 2026-04-28`.

## Phase D — verify on staging

**Goal:** every ⚠️ in the parity doc gets flipped to ✅ or ❌.

### D1. Set up live metrics watch

After staging is up (B5), tail its log similarly to the local watcher:

```bash
# user runs this in a terminal:
fly logs -a border-empires-staging | tee /tmp/be-staging.log

# executor sets up an aggregator, similar to /tmp/be-legacy/watch-metrics.sh
# from the local Phase 0 work, but pointed at /tmp/be-staging.log.
```

### D2. Walkthrough

User plays one season on `https://staging-legacy.borderempires.com/` with
`AI_PLAYERS=20` (set in B1). Executor runs through the parity checklist
item by item with the user, flipping ⚠️ → ✅ as each behavior is observed.
For any ❌, open a follow-up issue/branch (do not block tonight on porting).

### D3. Stretch: stress-test login

If time remains, ask user to open 5+ browser windows against staging and
report whether any get stuck on "Securing session." This is the same
symptom Phase A is fixing in prod; if staging reproduces it, the bug is in
recent main commits and not env-specific.

## Phase E — cutover (DEFERRED — wait for user signal)

**Trigger:** user explicitly says the rewrite track is dead. Until then,
**do not start Phase E**.

### E1. Archive rewrite code
```
git checkout main
git fetch origin
git pull --ff-only
git checkout -b archive/rewrite-2026-04
git push --force-with-lease -u origin archive/rewrite-2026-04
```

### E2. Cutover branch
Branch `agent/rewrite-removal-cutover`. Single PR that:
1. Edits `packages/client/src/client-app-runtime-env.ts:49` so the default
   backend is **unconditionally** legacy. Remove the `?backend=` URL param,
   the `be-backend` cookie path, and the env-var path that route to
   gateway. Read `client-backend-selector.ts` carefully — that file may
   need to collapse to a single-backend constant.
2. Deletes:
   - `apps/realtime-gateway/`
   - `apps/simulation/`
   - `packages/game-domain/`
   - `packages/sim-protocol/`
   - `packages/client-protocol/`
   - `packages/client/src/gateway-sync.ts`
   - `packages/client/src/gateway-capabilities.ts`
   - `packages/client/src/frontier-recovery.ts`
   - `packages/client/src/frontier-status.ts`
   - `packages/client/src/frontier-command.ts`
   - `packages/client/src/map-loading-view.ts`
   - `packages/client/src/send-message-guard.ts`
   - `packages/client/src/map-input.ts` (if rewrite-only — verify by reading)
   - `Dockerfile.gateway`, `Dockerfile.simulation`
   - `fly.gateway.toml`, `fly.simulation.toml`, `fly.combined.staging.toml`
3. Updates `pnpm-workspace.yaml` to drop `apps/*`.
4. Updates `tsconfig.base.json` to drop the rewrite path mappings.
5. Bumps `client-changelog.ts` (this is the **only** branch on which you
   touch the changelog — see AGENTS.md rule).
6. Updates `README.md` and any prominent docs that reference the rewrite.

PR title: `chore(rewrite): archive and remove gateway/simulation stack`.
Big diff but mechanically clean. Run full `pnpm test` before opening.

### E3. Decommission rewrite Fly apps
Hand to user:
```
fly apps destroy border-empires-gateway --yes
fly apps destroy border-empires-simulation --yes
fly apps destroy border-empires-combined-staging --yes
```

## Phase F — lag work (DEFERRED — after parity complete)

**Trigger:** Phase D parity checklist all ✅. Until then, do not start F.

### F1. Tune AI throttling on staging
Iterate on these env vars in `fly.server.staging.toml`, redeploying staging
each time, until 40-AI + 1-human steady state shows
`eventLoopDelayMaxMs < 50` for 5 consecutive minutes:
- `AI_TICK_BATCH_SIZE` (current: 1; try 2, then 3 only if 2 doesn't help)
- `AI_DISPATCH_INTERVAL_MS` (current: 250; try 350, 500)
- `AI_EVENT_LOOP_P95_SOFT_LIMIT_MS` (current: 60; try 40 — tighter shedding)
- `AI_EVENT_LOOP_UTILIZATION_SOFT_LIMIT_PCT` (current: 65; try 50)
- `AI_FRONTIER_SELECTOR_BUDGET_MS` (current: 100; try 60)

### F2. Worker offload candidates (only if F1 isn't enough)
Current worker config: `AI_PLANNER_WORKER=0` (off — proven to *worsen* event
loop), `SIM_COMBAT_WORKER=1` (on), `CHUNK_SERIALIZER_WORKER=1` (on).
Candidates to investigate:
- Move frontier candidate generation into a dedicated worker. Measure
  postMessage serialisation cost end-to-end *before* committing — the
  planner worker showed +2× event-loop max because the snapshot copy
  dominates the savings.
- Re-evaluate the planner worker with a smaller payload (only the diffed
  ownership tiles, not the whole snapshot).

### F3. Frontier expansion specifically
Look at `server-ai-frontier-planning-runtime.ts` (544 lines) and
`server-ai-frontier-selection-runtime.ts` (550 lines). The user said
"frontier expansion kept timing out because the AI kept stealing all the
event loop." This is a hot-path candidate for: (a) batching frontier
expansion across ticks, (b) deferring expansion when human commands are in
queue (reverse priority), (c) capping per-tick expansion count.

## Sandbox vs user execution boundary

**Executor (Sonnet, in sandbox) does:**
- Read code, write code, run `pnpm test`/`pnpm build` locally.
- Create git branches, commits, push to origin (`--force-with-lease` on
  feature branches only, never `main`).
- Open PRs with `gh pr create` (this works from sandbox).
- Write the parity doc.

**User runs:**
- All `fly` commands (`status`, `logs`, `deploy`, `secrets`, `apps create`,
  `volumes create`, `machine restart`, `ssh console`, `apps destroy`).
- All `vercel` commands.
- Browser-based verification (the executor cannot reach prod URLs from the
  sandbox).
- PR merges to `main`.

When in doubt, the executor asks the user rather than running a deploy.

## What NOT to do

- Do not commit to `main` directly. Always work on `agent/<slug>` branches.
- Do not run `git push --force` (only `--force-with-lease`).
- Do not touch `packages/client/src/client-changelog.ts` until your branch
  is the very last edit before PR open. Two agents both bumping the
  version is the most common collision in this repo.
- Do not delete the rewrite code in Phase E without an explicit user signal.
- Do not skip the boot-log read in Phase A by guessing at the prod symptom.
  The hang could be one of four distinct causes (see A2).
- Do not touch any folder under `border-empires-container/` other than
  `border-empires/` itself. The other folders are stale worktrees.
- Do not retry a fix in a sleep loop if it fails. Diagnose, then act.
- Do not declare any phase complete on intent alone. Phase A needs a
  browser-confirmed `wsReadyState=1`. Phase B needs a curl + browser
  confirmation. Phase C needs the doc committed. Phase D needs every ⚠️
  flipped. The repo has explicit "verify before reporting done" rules in
  the container `AGENTS.md`; follow them.

## Tonight's realistic critical path

A → B → C. D is a stretch. E and F are deferred.

If the executor finishes A and B in the first hour and the parity audit in
C reveals only a handful of items, attempt D. Otherwise stop at C and hand
the parity doc to the user for tomorrow.
