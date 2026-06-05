# Border Empires (TypeScript Prototype)

Prototype MMO scaffold based on the handoff plan.

## Short Description

Border Empires is a browser-based multiplayer territory strategy game where you expand tile-by-tile, fight border wars, level through tech branches, and compete in seasonal resets with clusters, docks, and forts shaping the map meta.

## Full Description And Core Mechanics

Border Empires is a persistent-world 2D tile conquest game designed around territorial positioning rather than unit micromanagement.  
Each player controls a civilization that starts from a single land tile, expands into adjacent neutral land, and attacks neighboring enemy tiles through short lock-based combat resolution.

### World and Terrain

- The world is a toroidal grid (wrap-around edges).
- Land is playable and capturable.
- Sea and mountains are hard barriers.
- The map includes continents, inland rivers and lakes, mountain barriers, coastal zones, and resource-bearing tiles.

### Territory and Combat

- Actions originate from a controlled tile and target valid adjacent land, with dock-based crossing exceptions.
- Expand/attack actions resolve with a 3-second combat lock to prevent third-party interference.
- Defender power is amplified by a defensiveness model based on exposed border edges.
- Losing a defense can counter-capture the attacker’s origin tile.

### Progression and Scoring

- Points come from passive resource income and PvP captures.
- Underdog-friendly PvP scaling rewards defeating stronger opponents more heavily.
- Levels increase from points and grant tech picks.
- Techs are branch-locked after first root choice and apply stat modifiers/powerups.

### Strategic Layers

- **Forts:** limited, build-timed defensive structures on key border/dock tiles; destroyed on capture.
- **Docks:** paired sea-crossing gateways with cooldown and defensive value.
- **Clusters:** regional resource concentrations that grant threshold-based bonuses.
- **Alliances:** mutual relationships that affect border exposure and disallow allied farming.

### Seasons

- Seasons reset world progression while preserving account identity/cosmetics/history.
- Each season rotates strategic content (world seed, clusters, docks, active tech subset).
- Seasonal leaderboards track outcomes such as territory and points.

### Client Experience

- Real-time Canvas map with pan/zoom.
- Fog of war and chunk streaming.
- HUD panels for missions, tech, alliances, leaderboard, activity feed, and identity settings.
- Mobile-oriented interactions include touch pan/pinch zoom and panel navigation.

## Run

```bash
pnpm install
pnpm test
pnpm build
pnpm dev
```

- Client: http://localhost:5173
- Server health: http://localhost:3001/health

## Local CI

Run the full local gate from a clean worktree with:

```bash
pnpm ci:local
```

This first runs `pnpm check:file-lines`, then builds `@border-empires/shared`, lints, tests, and builds each workspace package in a fixed order so local checks are deterministic.

The file-line gate is debt-aware: new source files must be 500 lines or fewer, files at or below 500 lines may not cross 500, and files already over 500 lines may not grow. Split or extract before adding logic to an oversized file.

Install the local git hook for this checkout with:

```bash
./scripts/setup-git-hooks.sh
```

That configures `pre-push` to run `pnpm ci:local`.

## Worktrees

Keep repo-managed worktrees inside the checkout at `.codex-worktrees/`:

```bash
pnpm worktree:new fix-some-issue
```

That creates `agent/fix-some-issue` at `.codex-worktrees/fix-some-issue` and runs `pnpm install --frozen-lockfile` in the new worktree.

To migrate older sibling worktrees from `border-empires-container/` into `.codex-worktrees/`, run:

```bash
pnpm worktree:migrate
```

This migrates repo-owned sibling worktrees and leaves tool-managed session/tmp worktrees alone.

After a PR merges, finish cleanup before calling the task done:

```bash
git fetch origin main
git merge-base --is-ancestor <feature-tip> origin/main
git worktree remove .codex-worktrees/<slug>
git branch -d agent/<slug>
git push origin --delete agent/<slug>
git worktree list
git branch --list 'agent/<slug>'
git branch -r --list 'origin/agent/<slug>'
```

Do not rely on `gh pr merge --delete-branch` alone; verify the worktree and both branch refs are actually gone before reporting completion.

## Agent Workflow Notes

Codex agents should follow the token-budget workflow in `docs/agents/codex-token-budget.md`: start with narrow searches, read small file slices, keep command output capped, and run focused checks before full CI.

Recurring work areas should get short runbooks under `docs/agents/topics/` using the template in `docs/agents/topic-runbooks.md`. These notes are intended to reduce repeated repo rediscovery across sessions.

## Staging Login SLO Probe

To measure end-to-end staging login latency (AUTH -> INIT) and enforce the 5s target:

```bash
STAGING_LOGIN_PROBE_AUTH_TOKEN="<firebase-id-token>" pnpm ops:staging:login-probe
```

This runs multiple real websocket auth attempts against:

- `wss://border-empires-combined-staging.fly.dev/ws?channel=control`

The probe now requires an explicit auth token and reuses that same account for
every attempt. It no longer invents `staging-probe-*` identities, so running
the probe does not seed fake empires into shared staging.

The probe prints per-attempt outcomes plus summary p50/p95/p99.  
It exits non-zero when:

- success rate is below 100%, or
- p95 login latency exceeds 5000ms.

Useful read points:

- Immediate SLO result: terminal output of `pnpm ops:staging:login-probe`
- Gateway health/latency context: `https://border-empires-combined-staging.fly.dev/metrics`

To catch stale Fly secrets or manual env drift before debugging a staging outage, run:

```bash
pnpm ops:staging:drift-check
```

This compares the effective env on the combined staging Fly machine against the checked-in values in `fly.combined.staging.toml`. It exits non-zero on drift, including stale secret overrides like `SIMULATION_ADDRESS=...internal:50051`.

For rewrite localhost stress testing with a durable SQLite-backed 20-AI world on `http://localhost:5173`, run:

```bash
pnpm rewrite:restart:20ai
```

The helper writes to `./.local-data/border-empires-20ai.db` by default. Override with `SQLITE_PATH=...`.

For an explicit fresh-world reseed instead of durable recovery, run:

```bash
pnpm rewrite:restart:20ai:seed
```

`rewrite:restart:20ai:seed` deletes the local SQLite file before booting so it really starts from a fresh seeded world instead of recovering old local events.

## Client Release Notes

When you ship a user-facing client update, update `packages/client/src/client-changelog.ts` in the same branch.

- Bump the changelog `version` so users who already saw the previous release will only see the popup again for the new release.
- Keep each release note entry in the same shape: `introducedIn`, `title`, `why`, and `changes`.
- Write both why the change was made and what changed for each release note entry.
- `pnpm check:client-changelog` now fails when product code changes on a branch without a changelog update and release-version bump.

## Implemented in this slice

- Monorepo (`shared`, `server`, `client`) with strict TypeScript.
- Shared core formulas: wrapping, defensiveness, rating/reward scaling, level curve.
- O(1) ownership-change exposure delta with tests + full recompute helper.
- Server: seeded world tiles, auth (`name:password` token), spawn, chunk subscribe, fog by vision radius, expand/attack, 3s combat locks, stamina, passive income, anti-repeat reward decay, elimination/respawn, snapshot persistence.
- Server: branch-locked tech picks with stat modifiers, alliance request/accept/break flow, allied-border exposure handling.
- Server: branch-locked tech picks with stat modifiers, alliance request/accept/break flow, allied-border exposure handling, action rate limiting.
- Client: Canvas map, pan/zoom, click-target capture (auto-origin from adjacent owned tiles), real-time HUD, capture progress bar, alliance controls, tech picker, tile color picker.
- New strategic layer: seasons (with rollover/reset + archive), rotating active tech tree per season, strategic resource clusters (with bonuses), paired dock crossings (cooldown + defense bonus), and forts (build timer/cost/cap + capture-destroy behavior).

## Load Simulation

With server running:

```bash
pnpm --filter @border-empires/server simulate:load
```

Optional env vars:

```bash
BOTS=80 APM=1500 DURATION_SEC=180 pnpm --filter @border-empires/server simulate:load
```

## Test Checklist

1. Start stack:
```bash
pnpm install
pnpm dev
```
2. Open two browser windows at `http://localhost:5173`.
3. In window A, login prompt: `alice:pw`.
4. In window B, login prompt: `bob:pw`.
5. Press `r` in each window to refresh nearby chunks after moving camera with arrow keys.
6. Click an adjacent neutral tile to your territory to expand (origin auto-picks from your border).
7. Click an adjacent enemy tile to attack and observe ~3 second combat result.
8. In A, enter `bob` in ally target input and click `Send`. In B, click `Accept` on incoming request.
9. Confirm alliance updates appear in feed, then try attacking allied tiles and verify it is rejected.
10. Pick a root tech in the dropdown, then pick a child tech and verify root-lock behavior (cross-root picks should fail with error).
11. Select one of your border/dock tiles and click `Build Fort On Selected`; after ~60s it becomes active.
12. Capture a fortified tile from another player and verify the fort is destroyed on capture.
13. Find dock tiles (gold outlined on map) and attack across paired docks; verify cooldown is enforced.
14. Trigger season rollover for testing: `curl -X POST http://localhost:3001/admin/season/rollover` and verify progression resets while account identity remains.

## Notes

- WebSocket schema validation uses Zod.
- Snapshot file written to `snapshots/state.json` every 30s.
- Live game shell now mirrors the Figma-export structure: top HUD strip, action rail, capture overlay, side panel, and mobile drawer navigation wired to live game state.

## Deploy (Vercel + Fly.io)

### 1) Deploy API server to Fly.io

Prereqs:

```bash
brew install flyctl
fly auth login
```

From repo root:

```bash
fly launch --copy-config --config fly.server.toml --no-deploy
fly deploy --config fly.server.toml
```

After deploy, note your API hostname, for example:

`https://border-empires-api.fly.dev`

WebSocket URL for client env:

`wss://border-empires-api.fly.dev/ws`

### 2) Deploy client to Vercel

In Vercel project settings:

- Framework: Vite
- Root Directory: repo root
- Install Command: `pnpm install --frozen-lockfile`
- Build Command: `pnpm --filter @border-empires/shared build && pnpm --filter @border-empires/client build`
- Output Directory: `packages/client/dist`

Set environment variables:

- `VITE_WS_URL=wss://border-empires-api.fly.dev/ws`
- `VITE_GATEWAY_WS_URL=wss://border-empires-gateway.fly.dev/ws`

Release cadence (required):

1. Use `pnpm deploy:client:preview` for ad hoc preview URLs from any feature branch. It deploys to the pinned `border-empires-client` project but does not touch stable domains.

2. Keep a shared `staging` branch for client pre-production. Merge tested feature branches into `staging`, then relink the current worktree if needed:

```bash
pnpm vercel:link:client
```

3. Deploy **preview/staging** from the `staging` branch only:

 ```bash
 pnpm deploy:client:staging
 ```

The staging deploy script now:

- pins Vercel CLI to the single `border-empires-client` project via tracked project/org IDs
- rewrites `.vercel/project.json` in the current worktree if it is missing or stale
- refuses to run outside the `staging` branch unless `ALLOW_NON_STAGING_BRANCH_DEPLOY=1` is set for a one-off emergency override
- verifies that `staging.borderempires.com` resolves to the new preview deployment and that production no longer claims the staging alias

4. Validate staging behavior on `https://staging.borderempires.com`:
- login/session init
- frontier expand resolution
- launch attack resolution
- reconnect/reload behavior

5. Promote only after preview passes, from `main`:

```bash
pnpm deploy:client:prod
```

The production deploy script now:

- refuses to run outside `main` unless `ALLOW_NON_MAIN_PROD_DEPLOY=1` is set
- pins Vercel CLI to `border-empires-client`
- verifies `https://play.borderempires.com` and `https://border-empires-client.vercel.app` both resolve to the new production deployment
- fails if the production deployment still owns `staging.borderempires.com`

Vercel env scopes:

- Preview/staging deploy uses explicit build-time env from deploy script:
  - `VITE_GATEWAY_WS_URL=wss://border-empires-combined-staging.fly.dev/ws`
  - `VITE_WS_URL=wss://border-empires-combined-staging.fly.dev/ws`
- Production environment: production backend URLs (`*.fly.dev`)

Stable URLs:

- Production: `https://play.borderempires.com` (aliased to latest production deploy)
- Staging: `https://staging.borderempires.com` (reserved for the `staging` branch deploy only)

DNS requirement for stable staging alias:

- Add `A staging.borderempires.com 76.76.21.21` at your DNS provider.

## Rewrite Memory Safety

The split simulation service now supports checkpoint memory watermarks so checkpoint saves can be deferred instead of pushing a hot process into OOM during a bad moment.

Environment variables:

- `SIMULATION_SNAPSHOT_EVERY_EVENTS`: checkpoint cadence by persisted events
- `SIMULATION_CHECKPOINT_MAX_RSS_MB`: defer checkpoint when RSS is at or above this many MB
- `SIMULATION_CHECKPOINT_MAX_HEAP_USED_MB`: defer checkpoint when heap used is at or above this many MB

The simulation logs checkpoint phases and any high-memory deferrals so you can confirm what runtime state existed before a checkpoint was skipped.

## Rewrite Acceptance Additions

The original split gateway/simulation rewrite plan remains the right direction, but localhost parity work uncovered three additional acceptance areas that must be treated as hard requirements before production cutover.

### Runtime Provenance / Anti-Stale Guarantees

Every rewrite runtime should expose an explicit identity so a browser or operator can tell exactly which world is running instead of guessing from symptoms.

Required fields:

- source type (`legacy-snapshot`, seed profile, DB-backed recovery, etc.)
- season id
- world seed
- snapshot label / source
- runtime fingerprint
- player count
- seeded tile count

This identity should be surfaced in:

- gateway `/health`
- runtime/debug endpoints
- client bridge/debug badge
- downloaded debug bundles

Rewrite boot should fail when snapshot provenance is ambiguous or inconsistent.

### Snapshot-Bridge Parity Checklist

When localhost is validating the rewrite against an imported season snapshot, the bridge must preserve gameplay-facing parity for:

- town overview values
- visibility radius and discovered-terrain shaping
- docks / coastline / resource rendering
- economy source and upkeep breakdowns
- leaderboard settled/income/victory rows
- frontier claim behavior
- attack preview and win chance behavior
- reconnect persistence

Do not treat a snapshot-backed localhost session as “good enough” until this checklist is verified on the running client.

### Operational Memory Safety

The production monolith OOM incident showed that memory safety needs to be explicit in the rewrite acceptance criteria.

Required protections:

- gateway chunk-cache byte/count caps
- simulation checkpoint streaming or section-at-a-time writes
- checkpoint-phase memory watermarks sampled during build/write, not only before/after
- checkpoint deferral under high memory
- split-service memory budgets verified before production cutover

### 3) Local vs Production WS config

- Local default: `ws://localhost:3001/ws`
- Override in production with `VITE_WS_URL`.
