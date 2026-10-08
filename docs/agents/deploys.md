# Deploys

Status: canonical runbook

Read this before any deploy or Vercel/Fly CLI work. AGENTS.md links here.

<!-- ci-smoke-test: harmless doc touch to exercise the develop PR + staging auto-deploy flow end to end; safe to remove this line in a later edit. -->

## Branch flow (GitHub Actions)

- `develop` is the default branch and the base for all feature PRs. Every push to `develop` runs `.github/workflows/ci.yml` (lint, `check:file-lines`, build, test); on green, `.github/workflows/deploy-staging.yml` deploys automatically to staging.
- `main` is production-ready code, only moved by PR from `develop` (or a hotfix branch). Every push to `main` runs CI, then `.github/workflows/deploy-prod.yml` runs the prod-shape gate unattended and, on a pass, deploys to production.
- The `pnpm deploy:staging:all` / `pnpm deploy:prod:all` scripts (below) still work for manual/emergency deploys — the Actions workflows call the same underlying steps, just non-interactively with tokens from repo secrets (`FLY_API_TOKEN`, `VERCEL_TOKEN`, `GH_PAT`/`GITHUB_TOKEN`) instead of a local CLI login.
- A push to `develop`/`main` directly (not via PR) is blocked by branch protection; land changes through a PR.

## Stack targets (critical)

- **Staging** (`https://staging.borderempires.com`, backend `api-staging.borderempires.com` on a Hetzner CX23 in Nuremberg; the Fly app `border-empires-combined-staging` is **stopped, kept only as a rollback**) runs the **combined rewrite stack**: `apps/realtime-gateway` + `apps/simulation` in one process, built by `Dockerfile.combined` / `fly.combined.staging.toml`.
- **Production** (`https://play.borderempires.com`, backend `api.borderempires.com` on a Hetzner CX23 in Nuremberg since 2026-10-02; the Fly app `border-empires-combined` is **stopped (machine frozen with `sleep infinity`), kept only as a rollback**) runs the **combined rewrite stack**: `apps/realtime-gateway` + `apps/simulation` in one process, built by `Dockerfile.combined` / `fly.combined.toml`.
- "Deploy to staging" = deploying the rewrite stack. This now happens automatically on every push to `develop` via `.github/workflows/deploy-staging.yml`. For a manual/ad-hoc run, use `pnpm deploy:staging:all` from any worktree on any branch — it fast-forwards `origin/staging` to `origin/develop`, deploys the combined Fly app, then publishes the client to Vercel and flips the staging alias. Fly escape hatch: `fly deploy --config fly.combined.staging.toml --strategy rolling --remote-only`. Piecemeal split gateway/simulation staging deploys are obsolete.
- Staging deploys hold the client alias until `scripts/verify-staging-realtime.mjs` has checked `/health` and a WebSocket upgrade for ten minutes, then used a reusable Firebase anonymous probe account to verify AUTH reaches INIT and the gateway remains healthy. CI gets its refresh token from `STAGING_ANON_PROBE_REFRESH_TOKEN`; manual runs without that token create a temporary Firebase account and delete it afterward (a staging game profile may remain). Fly's initial machine check can pass before a later watchdog kill; `/healthz` always returns HTTP 200 even if the simulation is disconnected, so the Fly service check uses `/health`. If the soak fails, inspect `fly checks list`, `fly logs`, and the bounded `/data/.death-forensics.json.history.json` before trying a new deployment. The workflow fails without publishing the new client; recover the backend from the last known healthy release after checking database compatibility.
- `auth/admin-restricted-operation` from Play Now means Firebase anonymous sign-in is disabled for the `border-empires` Firebase project; restarting Fly will not fix it. The deployment guest probe catches that configuration drift. A separate AUTH-to-INIT stall can come from the gateway's synchronous SQLite connection contending with simulation writes. Runtime gateway DB connections use 100 ms lock waits and async retries for identity/profile operations; schema setup retains the longer wait before traffic starts. This avoids blocking the gateway event loop without raising Fly CPU or memory allocations.
- "Deploy to production" = deploying the combined rewrite stack plus the prod client. This now happens automatically on every push to `main` via `.github/workflows/deploy-prod.yml` (which runs the prod-shape gate itself before deploying). For a manual/ad-hoc run, use `pnpm deploy:prod:all` from a clean checkout at `origin/main`; it requires a recent successful prod-shape gate JSON for the exact target SHA, deploys `fly.combined.toml`, tags the release, updates `origin/production`, and publishes the client with the gateway backend default.
- When a user says "deploy" without naming an environment, treat that as **staging by default**. Do not assume production unless the user explicitly says `production`, `prod`, or otherwise makes it unambiguous.
- Before any manual production deploy, make sure this checkout is updated to the latest `origin/main`, then run the prod-shape gate against an isolated clone of the latest production map. Set `PROD_SHAPE_GATE_RESULT_JSON` to that result before running `pnpm deploy:prod:all`. Bypass only for emergency rollback with `SKIP_PROD_SHAPE_GATE=1`.

## Per-environment world size

- `WORLD_WIDTH` / `WORLD_HEIGHT` (standard size 640x320, `packages/shared/src/world-size.ts`) and `WATCHTOWERS_ENABLED` are read from env. Staging explicitly sets the standard 640x320 size and keeps watchtowers off in `fly.combined.staging.toml` (re-render `deploy/env/staging.env` with `pnpm ops:hetzner:render-env`); production uses the defaults.
- The client bundle bakes the size in at build time (`packages/client/vite.config.ts` `define`). `scripts/deploy-client-staging.mjs` builds with 640x320 unless `WORLD_WIDTH`/`WORLD_HEIGHT` are set. Server and client must match or tile coordinates break.
- A size change only shows up after a forced season rollover (below), because a restart reloads the persisted season.
- `GET /admin/world` (read-only admin auth, e.g. `X-Admin-Github-Token: $(gh auth token)`) reports the configured size and watchtowers, the size the current season was generated at, the AI count and `sizeStatus`: `match`, `rollover_pending` (new size deployed, old season still running), or `unknown` (season created before seasons were stamped with their size).

## Season rollover (new map, map size, AI count, worldgen)

Worldgen code, `SIMULATION_MAP_STYLE`, `WORLD_WIDTH`/`WORLD_HEIGHT`, `WATCHTOWERS_ENABLED` and `SIMULATION_AI_PLAYER_COUNT` only take effect for a **new** season. A deploy or restart reloads the persisted season unchanged. Learned on 2026-10-02 (PR #2208, staging 320x160 / 20 AI):

1. **Merge, then wait for the whole `Deploy staging` run**, not just CI. Check that the `Deploy client to Vercel staging alias` step ran. If the soak/verify step fails, the server is deployed but the client publish is **skipped**; for a world-size change that leaves the server and client on different sizes. Publish it with `pnpm deploy:client:staging`. Check the live client with `curl https://staging.borderempires.com/__build_sha.txt` (and, for size, the `WORLD_WIDTH` value in the `shared-game-*.js` chunk).
2. **Check `/admin/world`**: `configured` shows the new values and `sizeStatus` is `rollover_pending`. Watch for older develop CI runs. `deploy-staging` runs serialize (they are not cancelled), so confirm the deployed SHA contains your merge.
3. **Roll over promptly.** Between the client publish and the rollover, a size-changing client is talking to the old-size season.
4. **Run the rollover as one command.** `start-next` only accepts the static `ADMIN_API_TOKEN` (not the GitHub-token or Google paths). On Hetzner it lives in `/etc/border-empires/secrets.env` (root ssh). An `export` in one `!` command did not carry into the next, so load the token and call the endpoint in a single line:

   ```bash
   ADMIN_API_TOKEN="$(ssh root@178.105.133.33 "grep '^ADMIN_API_TOKEN=' /etc/border-empires/secrets.env | cut -d= -f2-")"; echo "token length: ${#ADMIN_API_TOKEN}"; curl -X POST "https://api-staging.borderempires.com/admin/season/start-next?force=true" -H "Authorization: Bearer $ADMIN_API_TOKEN"
   ```

   `{"ok":false,"error":"unauthorized"}` with token length 0 means the token never loaded. Claude Code's auto-mode classifier blocks agents from reading this secret, so the human runs this step. It wipes the current season on that environment.
5. **Verify:** `/admin/world` shows `sizeStatus: "match"`, the new `season.seasonId`, and the expected `aiPlayers`. `/admin/players` shows fresh AIs with 1 tile each.
6. **Open clients reconnect on their own.** The simulation announces a rollover as a `PLAYER_MESSAGE` with no player id; the gateway answers by closing every connected player's sockets with code `4009` / reason `season_rollover` (`apps/realtime-gateway/src/season-rollover-resync/`), and the client reconnects in place and clears last season's leaderboard, tiles and queues when the new INIT carries a different season id. A player's sockets all close together (the gateway keeps a player's cached snapshot until the last one closes), and different players are spread over `max(8s, 1s x connected players)`, capped at 60s, after a 1.5s floor. Tunables: `GATEWAY_SEASON_ROLLOVER_SPREAD_MS`, `GATEWAY_SEASON_ROLLOVER_MIN_DELAY_MS` (0 closes immediately). Each client costs one full login (the gate admits 4 at once, 50 queued, the rest get `SERVER_BUSY`), so expect a login burst; the counter is `gateway_season_rollover_resync_sockets_total` and the log line is `gateway_season_rollover_resync_scheduled`. Clients on an older cached build are closed and reconnect but keep the old season's map until reloaded.

## Production shape gate

Production deploys must prove the candidate can handle a live-shaped world before any remote prod mutation happens. The gate must run against an isolated local clone of the prod SQLite database, not live production.

```bash
# 1. Pull a consistent snapshot of the live prod SQLite db.
#    Runs VACUUM INTO server-side (atomic, single-file, ~30-60s read lock),
#    then SFTP-pulls the one output file into a timestamped dir under
#    ./.prod-shape-clones/. Requires `flyctl auth login`.
pnpm ops:prod-shape:clone-snapshot
# (or --app border-empires-combined-staging to clone staging instead)

# 2. In one shell, boot the candidate combined stack against the cloned db
#    (replace <CLONE_DIR> with the path the previous step printed). The
#    schema-apply flags are required on a fresh clone the first time any
#    given SQLite schema version boots against it -- without them the
#    gateway/simulation crash on startup with "no such table: ..." for any
#    table added since the snapshot's own last boot.
GATEWAY_SQLITE_PATH="<CLONE_DIR>/border-empires.db" \
SIMULATION_SQLITE_PATH="<CLONE_DIR>/border-empires.db" \
GATEWAY_DB_APPLY_SCHEMA=1 \
SIMULATION_DB_APPLY_SCHEMA=1 \
  pnpm dev

# 3. In another shell, once /health returns 200 on 127.0.0.1:3101, run the gate.
PROD_SHAPE_TARGET_SHA="$(git rev-parse HEAD)" \
PROD_SHAPE_OUTPUT_PATH="docs/load-results/prod-shape-$(git rev-parse --short HEAD).json" \
WS_URL="ws://127.0.0.1:3101/ws" \
GATEWAY_HEALTH_URL="http://127.0.0.1:3101/health" \
GATEWAY_METRICS_URL="http://127.0.0.1:3101/metrics" \
SIMULATION_METRICS_URL="http://127.0.0.1:50052/metrics" \
  pnpm ops:prod-shape:gate

PROD_SHAPE_GATE_RESULT_JSON="docs/load-results/prod-shape-$(git rev-parse --short HEAD).json" \
  pnpm ops:prod-shape:verify --target-sha "$(git rev-parse HEAD)"
```

The gate auto-discovers a real, territory-holding player to probe with (via
the read-only `/admin/players` endpoint, authenticated with `gh auth token`
-- see `scripts/rewrite-find-probe-player.mjs`) instead of defaulting to the
fixed `player-1` test identity, which is frequently a brand-new, zero-tile
account in a real cloned prod snapshot and would otherwise make the whole
gate pass vacuously (`acceptedSamples: 0`, `acceptedP95Ms`/`acceptedP99Ms`
silently `skipped: true`). Check the result JSON's `probe` field and confirm
`soak.acceptedSamples > 0` -- an `ok: true` with `skipped: true` latency
gates is not a real pass (see `reference_prod_shape_gate_can_pass_vacuously`
project memory). Pin `AUTH_TOKEN` explicitly to disable auto-discovery.

The clone script runs `VACUUM INTO` on the remote server to produce a single consistent, defragmented SQLite file — no WAL/SHM coordination needed. The `VACUUM INTO` holds a read lock for ~30-60s on a ~1GB database; the simulation's writes queue during that window and resume after (no user-visible impact). Server-side temp files are cleaned up after the SFTP pull. Cloned snapshots are git-ignored under `.prod-shape-clones/`.

`pnpm deploy:prod:all` runs the same verification internally. The result must be `ok: true`, recent by default within 6 hours, and stamped with the exact deploy SHA.

## Hetzner backend (live for staging and production)

Status: staging and production run here (`STAGING_BACKEND` / `PROD_BACKEND` = `hetzner`). Production was cut over manually on 2026-10-02 (Fly frozen → DB copy → `deploy <sha>` → probe → client alias); the first fully automatic `main` deploy through this path had not run when this was written, so check that workflow run when it does.

Plan, phases and rationale: [`../hetzner-migration-plan.md`](../hetzner-migration-plan.md). The repo-side pieces live in `deploy/` and `.github/actions/hetzner-deploy/`.

- **Switch:** repo variables `STAGING_BACKEND` / `PROD_BACKEND` (`hetzner` selects the VPS; unset or `fly` would deploy to the stopped Fly apps and wake them — leave both set to `hetzner`). Do not set either variable to `hetzner` before plan Phase 1 (stable `api[-staging].borderempires.com` hostnames) and the server provisioning phases are done: the staging soak/probe scripts and client defaults still point at `*.fly.dev`. Image builds use `DEPLOY_PLATFORM` (default `linux/amd64`; `linux/arm64` for CAX11).
- **Deploy:** the workflow builds `Dockerfile.combined`, pushes `ghcr.io/<owner>/border-empires-combined:<sha>`, then runs `ssh deploy@host <sha>`. The CI key is a forced command (`deploy/bin/deploy`), so it can only `<sha>`, `rollback` or `snapshot`. The server fetches `deploy/compose.yml`, `Caddyfile`, `env/<env>.env` and `bin/backup` at that sha from GitHub, switches, and polls `127.0.0.1:8080/health` for `ok:true` (15 min), then waits for the app to *settle* (container up ≥120s and 8 consecutive fast `/health` checks; tunable via `SETTLE_*`) because staging measured a ~15–20s window of hung requests about 15s after boot that made the CI soak fail; an unhealthy deploy auto-rolls back. Updating `deploy/bin/deploy` itself needs a re-run of `bootstrap-server.sh`.
- **Env:** `deploy/env/*.env` are generated from `fly.combined*.toml` (`pnpm ops:hetzner:render-env`; a test fails if stale) until Fly is retired. Secrets live only in `/etc/border-empires/secrets.env` on the server (`pnpm ops:hetzner:copy-fly-secrets`; values never printed).
- **Logs:** `scripts/ops/backend-logs.sh <staging|production>` (needs `BE_STAGING_HOST`/`BE_PRODUCTION_HOST`), or `ssh deploy@host "cd /opt/border-empires && docker compose logs -f app"`.
- **Rollback:** `ssh deploy@host rollback` (admin key). Falling back to Fly means restarting the frozen Fly machine, repointing clients/DNS, and accepting that Hetzner-side play is lost (Fly's data is from the cutover moment) — a decision for the owner, not an automatic step.
- **Servers:** staging `178.105.133.33`, production `188.245.240.42` (Nuremberg, Ubuntu 26.04). Staging has no backups (disposable state, backup timer disabled). Production has Hetzner daily server backups enabled; there is **no hourly SQLite snapshot job on prod** (the timer is disabled): two staging watchdog kills coincided with hourly `VACUUM INTO` backups (hypothesis: SQLite lock contention with the synchronous app), so do not re-enable it on prod without measuring first.
- **Metrics/debug port:** `ssh -L 50052:127.0.0.1:50052 deploy@host`, then `curl 127.0.0.1:50052/metrics`.
- **Prod-shape clone:** `pnpm ops:prod-shape:clone-snapshot --ssh deploy@host` (uses the `snapshot` forced command; Fly path is `--app`).
- **Backups:** hourly `VACUUM INTO` → zstd → B2 (`deploy/bin/backup`, systemd timer). Restore: download the `.zst` from B2, `zstd -d`, stop the app, copy over `/srv/border-empires/data/border-empires.db` (remove `-wal`/`-shm`, chown `10001:10001`), start the app.

## Vercel

- Use exactly one Vercel project: `border-empires-client` (`projectId` `prj_QczQjhdpgV6Mu8Q03r4Ot6KWD1va`, `orgId` `team_GdmtYDKeSISxfvppIgLt4Rma`).
- `pnpm vercel:link:client` from the repo root rewrites the current worktree's `.vercel/project.json` to that pinned project before any manual Vercel CLI work.
- Reserve the `staging` branch for `https://staging.borderempires.com`; `pnpm deploy:client:staging` must run from `staging` unless an explicit one-off override env var is set.
- For production client deploys: `pnpm deploy:client:prod` from the repo root. Must run from `main` and verifies the public Vercel aliases serve the new bundle without capturing the staging alias.
- `/admin` on `play.borderempires.com` / `staging.borderempires.com` is a separate static page (`packages/client/admin.html` + `packages/client/admin-app/`). You sign in with Google, and it calls that deployment's gateway `/admin/*` JSON endpoints directly with the Firebase ID token. The gateway only accepts the token for the verified `ADMIN_EMAIL` (`apps/realtime-gateway/src/admin-auth/admin-firebase-auth.ts`). It replaces the old `api/admin` edge proxy, which never served anything.
- `/r/:code` (rally invite links) is served by the edge function `api/rally/[code].ts`, which returns the normal app shell with link-preview (Open Graph/Twitter) tags injected. It reads the inviter name from the gateway's cached `GET /rally/preview/:code` via the `BACKEND_URL` Vercel env var, and fails open to generic tags if that is unset or slow. The share image is `packages/client/public/og/rally-preview.jpg` (1200x630 JPEG, kept under ~300 KB for WhatsApp). After a client deploy, check a link with the platform debuggers (Facebook Sharing Debugger, X Card Validator) or `curl -A "facebookexternalhit/1.1" <play origin>/r/<code>`.
- Do not create or link additional Vercel projects for this repo. Reuse `border-empires-client` and prefer the stable production domain `https://border-empires-client.vercel.app/` when reporting deploy results.

## Firebase sign-in providers

- Google, email link, email/password and anonymous (Play now) are built-in Firebase Auth providers for the `border-empires` project.
- **Twitch** ("Continue with Twitch" on the login screen and the guest "Save your empire" panel) is a custom OpenID Connect provider, so the project must be on Identity Platform (Firebase console → Authentication → Settings → upgrade; needs the Blaze plan, one-way). Without the provider enabled the button fails with `auth/operation-not-allowed`.
  - Twitch app (dev.twitch.tv/console) OAuth redirect URLs: `https://play.borderempires.com/__/auth/handler`, `https://staging.borderempires.com/__/auth/handler`, `https://border-empires.firebaseapp.com/__/auth/handler` (the first two go through the `vercel.json` `/__/auth/*` proxy; the last is the localhost/preview fallback authDomain).
  - Firebase provider: Sign-in method → Add new provider → OpenID Connect, code flow, name `twitch` (provider id `oidc.twitch`, `TWITCH_PROVIDER_ID` in `packages/client/src/client-auth-flow/client-auth-flow-sso.ts`), issuer `https://id.twitch.tv/oauth2`, Twitch client ID and secret.
  - The client requests the `email` claim; the gateway drops an `oidc.*` email Firebase doesn't mark verified (`firebase-token-verifier.ts`), so an unverified Twitch email never email-matches an existing player.

## Fly (legacy rollback only)

Both Fly apps are stopped. Do not run `fly deploy` against them.

- Production app name: `border-empires-combined`.
- Use `fly status -a border-empires-combined`, `fly logs -a border-empires-combined`, and `pnpm deploy:prod:all` for production runtime checks and deploys. Direct Fly escape hatch: `fly deploy --config fly.combined.toml --strategy rolling --remote-only`.

## Deploy safety

- Treat the following as serialized — only one agent at a time: `git push origin main`, `vercel deploy --prod`, `vercel env rm`/`add`, `vercel alias set`, `fly deploy -a border-empires-combined`, `fly secrets set`, any database migration. If you cannot guarantee you are the only agent running these, surface the deploy to the user.
- Production env vars are global mutable state. Prefer `printf '<value>' | vercel env add` over interactive prompts (avoids stray newlines), and re-read with `vercel env pull && cat .vercel/.env.production.local` to verify it round-trips clean.
- After any prod deploy, verify by hitting the live URL: confirm `wss://api.borderempires.com/ws` round-trips a valid handshake (`wsReadyState` reaches `1`) within 5s. A successful build is not a successful deploy.
- If a deploy fails or smoke check is red, do not roll forward by re-running. Roll back to the previous Vercel/Fly release, then investigate.
