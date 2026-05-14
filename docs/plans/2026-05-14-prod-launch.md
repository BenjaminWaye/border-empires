# Border Empires — Production launch plan

Updated 2026-05-14 after the combined-arch perf push. Plan reflects current reality, not the earlier sketch.

## Goals

1. Cut `play.borderempires.com` and `borderempires.com` over from the legacy monolith (`border-empires.fly.dev`) to the combined rewrite stack with its own SQLite volume.
2. Verify `borderempires.com` displays `/hq/summary` + `/hq/archives` data correctly from the new backend.
3. Keep the legacy app alive for 48 h as instant rollback. Destroy after stability is proven.
4. Stay at or under **~$15/mo** total Fly + Vercel cost for prod + staging.

## Current state (verified)

- Combined-staging running `195fc32`, RSS 327 MB, heap 173 MB, event-loop p99 167 ms, snapshot 3 MB. Login is working.
- Combined-staging running at 2 GB (the OOM-era band-aid). **Now overprovisioned** — pre-perf fixes it OOM'd at 850 MB; post-fixes it's idling at 327 MB.
- Staging Fly secrets present: `ADMIN_API_TOKEN`, `GATEWAY_SLOW_LOGIN_ALERT_SLACK_WEBHOOK`. No Firebase server-side secrets needed (gateway uses Firebase JWKS, public keys).
- `chore/remove-legacy-server` exists locally, never pushed. Drops `packages/server`, `Dockerfile.server`, `fly.server.toml`, plus migrates the canonical `tech-tree.json` and `domain-tree.json` from `packages/server/data/` into `packages/game-domain/data/`. Half-done. **Do not delete `packages/server/data` until its current catalogs are byte-preserved or deliberately reconciled in `packages/game-domain/data`.**
- **Vercel API token is `invalidToken: true`** — blocks `deploy-client-staging.mjs` / `deploy-client-prod.mjs` until refreshed. This is the single blocker for any Vercel work.
- `play.borderempires.com` is on a Vercel deployment from `e4c9f5c9` (2026-05-02) with the bundle hardcoded to `wss://border-empires.fly.dev/ws` (the legacy app).
- `borderempires.com` is a separate Vercel project from repo `BenjaminWaye/border-empires-hq` — reads `/hq/summary` and `/hq/archives` from `VITE_API_BASE_URL`. Coordination required.

## Sizing decision

After the v1 snapshot work (PR #230, #232), per-process RSS settled at ~330 MB on staging under steady AI load. The 2 GB bump is no longer needed. Plan goes back to **1024 MB per env**:

| | App | Memory | Volume | Auto-stop | $/mo |
|---|---|---|---|---|---|
| **prod** | `border-empires-combined` | 1024 MB | `be_combined_prod_data` 1 GB | no | $7.78 |
| **staging** | `border-empires-combined-staging` | 1024 MB (shrink from 2048) | existing | **yes** when idle | ~$2 |

Total **~$10/mo** under budget. If prod RSS climbs past ~700 MB over the first week, bump to 2 GB then.

## Pre-requisite: refresh the Vercel API token

**This blocks anything that touches Vercel.** Until it's fixed:
- `play.borderempires.com` cannot be redeployed (bundle stays on `e4c9f5c9` pointing at legacy)
- `staging.borderempires.com` bundle is drifting from main, also can't be updated
- The current bundle still *works* — it just can't be replaced

User action: go to https://vercel.com/account/tokens, generate a fresh token, update `VERCEL_TOKEN` wherever it's stored (probably a `.env` or shell profile). The deploy scripts read it from env.

## Phase 1 — Land legacy removal (~45 min)

Branch `chore/remove-legacy-server` is already half-done locally. Pick it up.

1. From the existing worktree (`.codex-worktrees/...`), rebase onto current `main`.
2. Resolve any merge conflicts from PRs that landed since (Dockerfile.combined got modified by several recent perf PRs).
3. Preserve production gameplay catalogs before deleting legacy:
   - Treat `packages/server/data/tech-tree.json` as the current canonical tech tree unless a separate design review says otherwise. It contains current production names/costs and late-game techs such as `census-records`, `aegis-dome`, `world-engine`, and `astral-dock`.
   - Copy the current server tech tree into `packages/game-domain/data/tech-tree.json`, including the Aether Moorings fix: `unlockCustomsHouse: true` and `unlockAetherWall: true`.
   - Add/keep regressions that byte-compare `packages/game-domain/data/tech-tree.json` and `packages/game-domain/data/domain-tree.json` to the current canonical catalogs before `packages/server` is removed.
   - Preserve `domain-tree.json` production behavior deliberately. `crystal-network` should stay on the current unified `observatoryRangeBonus` effect unless a separate design review intentionally changes observatory protection/cast radius balance.
4. After the catalog copy is complete, update the progression resolvers:
   - Before `packages/server` deletion, gateway/simulation can still prefer `packages/server/data` with `packages/game-domain/data` as fallback.
   - In the legacy-removal PR itself, remove server-data candidates only after tests prove `packages/game-domain/data` contains the current catalogs.
   - Keep resolver tests for both gateway and simulation so they fail if the packaged game-domain catalogs drop Aether Moorings' Aether Wall unlock or lose sync with the current catalogs.
5. Run `pnpm ci:local` — must be clean.
6. Push, open PR, merge.
7. After merge: deploy combined-staging via `scripts/deploy-staging-all.mjs` (Fly side will succeed even if Vercel step fails on the token).
8. Verify staging still works end-to-end:
   - `/healthz` reports sim connected
   - `/hq/summary` returns leaderboard with `seasonId`
   - Real login completes in <5 s
   - Tech panel shows Aether Moorings with both Harbor Exchange and Aether Wall
   - Late-game tech cards still exist for `census-records`, `aegis-dome`, `world-engine`, and `astral-dock`
   - 30 min soak — no Slack slow-login alerts

**Gate**: staging green for 30 min. If anything fails, revert PR before moving on.

## Phase 2 — Prod Fly infra setup (~45 min, no live traffic yet)

1. Clone `fly.combined.staging.toml` → `fly.combined.toml`:
   - `app = "border-empires-combined"`
   - `primary_region = "arn"` (match staging — switch later if user latency dictates)
   - `memory = "1024mb"`
   - Drop `auto_stop_machines` (prod stays warm)
   - `min_machines_running = 1`
   - Update `GATEWAY_SLOW_LOGIN_ALERT_LABEL = "border-empires-combined"` so alerts identify which env
2. `fly apps create border-empires-combined`
3. `fly volumes create be_combined_prod_data --region arn --size 1 --app border-empires-combined`
4. Set Fly secrets:
   - `fly secrets set ADMIN_API_TOKEN=<from staging>` (regenerate if rotated)
   - `fly secrets set GATEWAY_SLOW_LOGIN_ALERT_SLACK_WEBHOOK=<existing or new prod-only webhook>`
   - **User decision**: same Slack channel as staging, or a dedicated `#prod-alerts`?
5. `fly deploy --config fly.combined.toml --strategy rolling --remote-only`
6. Verify on `border-empires-combined.fly.dev` directly (DNS not flipped yet):
   - `/healthz` returns `{ ok: true, simulation: { connected: true } }`
   - `/metrics` shows `gateway_event_loop_max_ms < 100` and `gateway_backend_connected: 1`
   - `/hq/summary` returns a fresh season with empty leaderboard (no events yet)
7. Let it run **30 min** with AI autopilot. Check that snapshot fires (~10 KB initially, growing), no OOMs, no crashes.

**Gate**: prod backend stable under AI-only load. If yes → Phase 3.

## Phase 3 — Production deploy script (~45 min)

1. Add `scripts/deploy-prod-all.mjs`, mirroring `deploy-staging-all.mjs` with:
   - Same `assertRequiredBranch` and clean-tree guards
   - Extra: interactive typed-confirmation prompt — `Type 'DEPLOY PROD <git-short-sha>' to continue:`
   - Tag on success: `prod-YYYYMMDDHHMMSS-<short-sha>`, push to origin
   - Force-pushes `origin/main` → `origin/production` so prod's deploy branch is identifiable
   - Deploys `fly.combined.toml`
   - Runs the client deploy step with `PRODUCTION_GATEWAY_WS_URL=wss://border-empires-combined.fly.dev/ws` and Vercel target `production`
2. Update `scripts/deploy-client-prod.mjs` to inject the prod WS URL as build-env (`VITE_GATEWAY_WS_URL`, `VITE_WS_URL`).
3. Verify the script in dry-run mode (skip the actual `fly deploy` / `vercel deploy` calls) — confirms the right URLs, sha, prompt.

**Gate**: dry-run output looks correct.

## Phase 4 — Production cutover (~30 min)

Pre-condition: Vercel API token refreshed (Phase 0 blocker).

1. `node scripts/deploy-prod-all.mjs`
2. Type the confirmation prompt.
3. Wait for the Fly + Vercel steps to complete.
4. **Immediate verification on `play.borderempires.com`**:
   - `curl https://play.borderempires.com/__build_sha.txt` matches the deploy sha
   - Fetch the JS bundle and grep — must contain `border-empires-combined.fly.dev`, must NOT contain `border-empires.fly.dev` or `border-empires-combined-staging`
   - Open the site in a fresh browser, sign in with Google
   - Auth completes within 5 s
   - World renders, HUD shows real values, can submit a frontier action
5. Watch the Slack alert channel for 10 min. No slow-login alerts should fire.

**Rollback if anything's off**: `vercel alias set <previous-deployment-url> play.borderempires.com` reverts the client to the legacy-pointing bundle in <2 min. Legacy Fly app is still running and routable at `border-empires.fly.dev`.

## Phase 5 — borderempires.com (HQ) cutover

The HQ site lives in repo `BenjaminWaye/border-empires-hq`, separate Vercel project. It reads `/hq/summary` and `/hq/archives` from `VITE_API_BASE_URL` at build time.

Steps:

1. Confirm user has access to the HQ Vercel project. If not, coordinate with whoever does.
2. Update env var on the HQ Vercel project: `VITE_API_BASE_URL = https://border-empires-combined.fly.dev`
3. Trigger an HQ redeploy (`vercel deploy --prod` from the HQ repo, or via Vercel dashboard).
4. Verify `borderempires.com`:
   - Page loads (no console errors)
   - **Season metadata** rendered: current season name, started date
   - **Leaderboards** (overall, byTiles, byIncome, byTechs) populated — initially only AI players, since prod DB is fresh
   - **Victory objective status** shows pressure-building items
   - **Online players, total players, town count** all present
   - Archive section is empty (no completed seasons yet) — site should handle gracefully

Failure mode to watch: if the HQ site assumes non-empty archives, it might crash. If so, file an issue on the HQ repo and fall back to keeping `VITE_API_BASE_URL` on legacy until fixed.

**Rollback**: revert the Vercel env var on the HQ project to whatever it was. Legacy `/hq/*` endpoints continue serving until we destroy legacy.

## Phase 6 — 48 h soak

Keep `border-empires.fly.dev` (legacy) running but with no DNS / alias pointing at it. It's a passive rollback target.

Monitoring checklist (check at 12 h, 24 h, 48 h):
- Fly app RSS — should stay under 700 MB for first week. Bump to 2 GB if it climbs.
- `gateway_event_loop_max_ms` — should stay under 1000 ms p99.
- Slack alert channel — no slow-login alerts fired.
- SQLite snapshot size — should stay under 10 MB.
- Snapshot retention — at most 3 rows in `world_snapshots`.

Roll forward if a real bug surfaces: hot-patch via the standard `deploy-prod-all.mjs` flow.

## Phase 7 — Cleanup (~15 min, post-48h)

1. `fly apps destroy border-empires` (legacy monolith).
2. Remove `fly.gateway.toml`, `fly.simulation.toml` from the repo (obsolete split-arch configs).
3. Optional: resize combined-staging to 1024 MB and enable auto-stop (the 2 GB band-aid is no longer needed).
4. Optional: refresh the auto-memory note about "Never build for legacy packages/server" — legacy code is now gone, the rule simplifies.

## Rollback at each phase

| Phase | Failure | Rollback |
|---|---|---|
| 1 | legacy-removal breaks staging | revert PR; before retry, verify `packages/game-domain/data` still contains the production tech/domain catalogs |
| 1 | tech/domain catalog drift during legacy deletion | stop deletion; restore from the pre-removal `packages/server/data` copy, then rerun gateway/simulation resolver tests |
| 2 | combined-prod won't start | `fly apps destroy border-empires-combined`, fix, retry |
| 3 | deploy script broken | revert script PR, fix |
| 4 | client cutover bad | `vercel alias set <old-deployment> play.borderempires.com` (≤ 2 min) |
| 5 | HQ site renders wrong | revert `VITE_API_BASE_URL` env on HQ Vercel project |
| 6 | prod OOM / wedges | redeploy with 2 GB memory + investigate the regression |
| 7 | unforeseen need for legacy | restore from Fly snapshot of the legacy volume (Fly keeps 5 days) |

## Time estimate

| Phase | Active | Wait |
|---|---|---|
| 0 (Vercel token refresh) | 5 min | — |
| 1 (legacy removal) | 30 min | 30 min staging soak |
| 2 (prod infra) | 30 min | 30 min prod soak |
| 3 (deploy script) | 45 min | — |
| 4 (cutover) | 30 min | 10 min smoke |
| 5 (HQ site) | 15 min (active) + coordination | passive |
| 6 (48 h soak) | passive | 48 h |
| 7 (cleanup) | 15 min | — |
| **Total active** | **~3 h** | + 48 h passive soak |

Realistic wall-clock: kick off this morning, prod stable by lunch, HQ cutover same afternoon, cleanup in 2 days.

## Open questions (resolve before Phase 1)

1. **Slack channel** — same channel as combined-staging alerts, or dedicated `#prod-alerts`?
2. **Vercel API token** — who refreshes it, and where does the new value get stored?
3. **HQ repo access** — does the user own the `border-empires-hq` Vercel project, or is it someone else?
4. **Region** — `arn` matches staging. Switch to a US region for North American players, or keep `arn` for now and revisit if latency complaints come in?
