# Fly.io → Hetzner Cloud migration plan

Status: active proposal
Owner: Benjamin (approves each phase; agents implement repo changes)
Last verified: 2026-10-01
Replaces: the Fly sections of `docs/agents/deploys.md` and the Fly entries in
`README.md` once production has cut over

## Problem

Staging deploys have failed at the "Verify sustained staging gateway and
WebSocket health" step for every `develop` push since 2026-09-30 09:39 UTC.
The probe logs in as a guest. The server freezes for 30s or more, and the
event-loop watchdog SIGKILLs it.

The cause is CPU throttling, not the login code:

- Fly `shared` vCPUs have a baseline quota of 5ms per 80ms period (6.25% of a
  core), plus a burst balance capped at about 500s
  (<https://docs.fly.io/machines/cpu-performance>). Once the balance is spent,
  the machine is held at baseline.
- `/proc/stat` on `border-empires-combined-staging` since its last boot showed
  66% steal against 6.8% user+sys. That is the baseline quota, exactly.
  Staging stayed pinned at about 7% even while idle.
- The same staging DB snapshot, booted locally from the same build, started in
  20s and served a `player-1` AUTH→INIT in 159ms. Staging took 9.5 minutes to
  boot the same data (19:47 → 19:57 UTC).
- All five watchdog kills in `/data/.death-forensics.json.history.json` (15:27,
  18:08, 18:45, 19:15, 19:47 UTC) landed on a login: four deploy probes and one
  real player.
- Every deploy and every kill replays startup state on a throttled CPU, which
  spends the burst balance again. Staging had 9 deploys on 2026-10-01 alone.
- Production runs the same `shared-cpu-1x`/2GB machine. Over 6h of uptime it
  averages about 5.3% CPU, just under the quota, so player growth or a burst of
  restarts will push it over.

Budget is $10/month per environment. On Fly, `shared-cpu-1x` with 2GB RAM
already costs about that. A non-throttled `performance-1x` costs about three
times as much. A plain VPS gives 2+ vCPUs that are scheduled fairly, not
quota-capped, plus 4GB RAM, inside the budget.

## Proposed change

Run each environment on its own Hetzner Cloud VPS, using the existing
`Dockerfile.combined` image unchanged, behind Caddy. Clients reach stable
hostnames on `borderempires.com`, not `*.fly.dev`, so any future provider move
is a DNS change.

**Not changing:** application architecture (one combined process, SQLite on
local disk), the Vercel client hosting, Firebase auth, the CI workflow, the
prod-shape gate, or the staging soak and guest probe in
`scripts/verify-staging-realtime.mjs`. The soak and probe are what caught this
problem, so they stay as the acceptance test.

### Target architecture (per environment)

```
Vercel client ──wss──▶ api[-staging].borderempires.com (A record → VPS IPv4)
                         │
                   ┌─────▼──────────────── Hetzner VPS (HEL1) ─────────────────┐
                   │ caddy:2 (ports 80/443, auto Let's Encrypt, WS passthrough)│
                   │   └─▶ app: ghcr.io/benjaminwaye/border-empires-combined:<sha>
                   │         127.0.0.1:8080 · /data bind-mounted from           │
                   │         /srv/border-empires/data · restart: unless-stopped │
                   │ systemd timer: hourly VACUUM INTO → zstd → Backblaze B2    │
                   └────────────────────────────────────────────────────────────┘
```

| Item | Choice | Why |
|---|---|---|
| Server | **CX23** (2 vCPU Intel/AMD, 4GB, 40GB NVMe), one per environment | Cheapest x86 plan; same `linux/amd64` image CI already builds. Fallback **CAX11** (2 vCPU ARM, same RAM and disk; there are no native deps, so the image builds for arm64). Upgrade path: **CPX22** or **CX33** |
| Location | **HEL1** (Helsinki) | Closest to Fly's `arn` (Stockholm), so player latency barely changes. NBG1 is the fallback if CX23 is out of stock |
| Ingress/TLS | Caddy 2 container | Automatic certificates, WebSockets with no extra config, about 10 lines of config |
| Image registry | GHCR, public package | Repo is public, so storage and pulls are free. The image holds no secrets |
| Process supervision | Docker `restart: unless-stopped` | Matches Fly's restart-on-exit; the watchdog's SIGKILL (exit 137) triggers it |
| Backups | Hourly `VACUUM INTO` + zstd → Backblaze B2 (first 10GB free) | Reuses the consistent-snapshot approach in `scripts/ops/clone-prod-sqlite-snapshot.mjs`. Avoids Litestream, whose checkpoint control conflicts with the simulation's own `wal_checkpoint` calls |
| Optional | Hetzner server backups (+20% of server price) | Whole-disk daily image for fast full-box restore |
| Monitoring | UptimeRobot or Better Stack free tier on `/health` | Fly's check UI goes away; this alerts when the server is down |
| Access | SSH key only. The deploy key is restricted by `command=` to `/opt/border-empires/bin/deploy` | GitHub Actions IPs are dynamic, so the key restriction is the control that matters |

### Cost (verify prices in the Hetzner console before ordering; their site renders prices client-side)

| Line | Staging | Production |
|---|---|---|
| CX23 server incl. primary IPv4 | ≈ €4–6 | ≈ €4–6 |
| Hetzner server backups (optional, +20%) | ≈ €1 | ≈ €1 |
| Backblaze B2 (< 10GB, uploads free) | $0 | $0 |
| GHCR, Caddy/Let's Encrypt, uptime monitor | $0 | $0 |
| **Total** | **≈ $5–8** | **≈ $5–8** |

Separate from this migration: production has three unattached 6GB Fly volumes
(`be_combined_prod_data` original plus two `_restore` volumes from about a
week ago), costing about $2.70/month. Delete them once confirmed unneeded.
They're also gone automatically at Phase 7.

## Phases

Each phase is independently shippable. Fly stays the live backend until its
environment's cutover step.

### Phase 0: accounts and decisions (Benjamin)

Agents cannot create accounts, so these steps are yours:

1. Create a Hetzner Cloud project. Add your SSH public key.
2. Create a Backblaze B2 bucket per environment
   (`be-backups-staging`, `be-backups-prod`), private, with lifecycle rule
   "keep prior versions 14 days". Create an application key scoped to each
   bucket.
3. Create an UptimeRobot or Better Stack account (free).
4. Decide: CX23 (x86) or CAX11 (ARM); whether to add Hetzner backups; and the
   hostnames. Default: `api.borderempires.com` and
   `api-staging.borderempires.com`.

### Phase 1: stable hostnames, still on Fly

Decouples clients from `*.fly.dev` before any server moves. After this, each
cutover is a single DNS record change, and old cached client bundles follow it.

1. `fly certs add api-staging.borderempires.com -a border-empires-combined-staging`
   (and `api.borderempires.com` on `border-empires-combined`). At Namecheap
   (`registrar-servers.com` is the DNS host), add CNAMEs to the `*.fly.dev`
   names. Set TTL to 300s.
2. One PR (agent) switching every default from `*.fly.dev` to the new
   hostnames:
   - `packages/client/src/client-app-runtime-env/client-app-runtime-env.ts` (staging/prod WS defaults)
   - `packages/client/admin-app/admin-environment.ts`
   - `packages/client/src/client-rally-links/client-rally-links.ts`
   - `packages/client/src/client-auth-ui/client-auth-ui.ts` (diagnostic label: rename "fly app" to "backend host")
   - `scripts/deploy-client-staging.mjs`, `deploy-client-preview.mjs`, `deploy-client-prod.mjs`, `deploy-prod-all.mjs`
   - `.github/workflows/deploy-prod.yml` (`VITE_GATEWAY_WS_URL`/`VITE_WS_URL`), `daily-activity-digest.yml` (`ACTIVITY_API_URL`)
   - `scripts/verify-staging-realtime.mjs`, `scripts/staging-login-latency-probe.mjs`, `apps/llm-player/src/config.ts`
   - the tests that assert those URLs
   - Leave the legacy `border-empires.fly.dev` parity-replay scripts alone; they target the retired legacy app.
3. Vercel env `BACKEND_URL` (used by `api/rally/[code].ts`) → new hostnames,
   for both Production and Preview.
4. Verify that staging and prod clients connect through the new hostnames.
   Fly is still serving.

### Phase 2: repo changes for the VPS (agent PR)

New `deploy/` directory:

- `deploy/compose.yml`: `app` service (image `${IMAGE}`, `env_file` =
  `env/${BE_ENV}.env` + `/etc/border-empires/secrets.env`,
  `/srv/border-empires/data:/data`, `127.0.0.1:8080:8080`,
  `restart: unless-stopped`, `stop_grace_period: 30s` to cover the 12s sim
  shutdown, json-file logging capped at `max-size: 50m`, `max-file: 5`) and a
  `caddy` service (80/443, persistent `caddy_data` volume).
- `deploy/Caddyfile`: `{$BE_HOSTNAME} { reverse_proxy app:8080 }`.
- `deploy/env/staging.env`, `deploy/env/production.env`: the non-secret
  `[env]` blocks from `fly.combined*.toml`, moved verbatim. Committed. This
  makes `scripts/check-staging-fly-env-drift.mjs` obsolete.
- `deploy/bin/bootstrap-server.sh` (idempotent, run once as root): creates the
  `deploy` user, installs Docker and unattended-upgrades, sets
  `PasswordAuthentication no` and `PermitRootLogin prohibit-password`, enables
  the ufw/Hetzner firewall (22, 80, 443), creates `/srv/border-empires/data`
  owned by the image's `borderempires` uid, installs rclone, and installs the
  backup timer.
- `deploy/bin/deploy` (the forced-command target): takes `<sha>`, runs
  `docker pull`, writes the previous tag to `/srv/border-empires/previous-image`,
  runs `docker compose up -d`, then polls `127.0.0.1:8080/health` until
  `ok:true` or 15 min. Prints the outcome. `deploy rollback` redeploys the
  previous tag.
- `deploy/bin/backup`, plus a systemd `.service`/`.timer` (hourly): runs
  `docker compose exec -T app node -e` with a `node:sqlite` `VACUUM INTO`
  writing to `/data/backups/`, then `zstd`, then rclone to B2. Keeps the last
  3 locally. Retention lives in B2: 48 hourly, 14 daily.

Workflow and script changes:

- `.github/workflows/deploy-staging.yml`: replace `flyctl deploy` with:
  `docker/build-push-action` (`Dockerfile.combined`,
  `CACHE_BUST`/`BUILD_SHA` build args, push to `ghcr.io/…:<sha>` and `:staging`),
  then `ssh deploy@$STAGING_SSH_HOST <sha>`. Gate the whole thing on repo
  variable `STAGING_BACKEND=hetzner|fly`, so rollback to Fly during the trial
  is a variable flip, not a revert. Everything from the soak step onward stays
  as is.
- `.github/workflows/deploy-prod.yml`: same pattern behind `PROD_BACKEND`. Its
  "Clone prod SQLite snapshot" step switches to the SSH-based clone below.
- `scripts/ops/clone-prod-sqlite-snapshot.mjs`: add `--ssh <host>`. Run the
  same `VACUUM INTO` through `ssh … docker compose exec`, then `scp` the file
  back. Keep `--app` for Fly until Phase 7.
- `scripts/fly-logs-tail.sh` → `scripts/ops/backend-logs.sh <env>`
  (`ssh … docker compose logs -f app`). Port `deploy-staging-all.mjs`,
  `deploy-staging-fly.mjs` and `deploy-prod-all.mjs` behind the same backend
  switch.
- Repo secrets: `STAGING_SSH_HOST`, `STAGING_SSH_KEY`,
  `STAGING_SSH_KNOWN_HOSTS`, and the `PROD_*` equivalents. GHCR push uses the
  workflow's `GITHUB_TOKEN` with `packages: write`.

Code (small, typed):

- Add `DEPLOY_APP_NAME` as the environment label next to `FLY_APP_NAME` in
  `apps/simulation/src/simulation-service/ownership-change-alert.ts`.
  `NODE_ENV=staging|production` already marks the runtime as managed in both
  `runtime-env.ts` files and `process-bootstrap.ts`, so nothing else depends
  on Fly env vars. Hardcoded `/data/...` paths keep working because `/data`
  is the bind mount.
- Add or update tests for the label fallback.

Docs, in the same PR: a "Hetzner backend" section in
`docs/agents/deploys.md` (deploy, logs, rollback, restore, SSH tunnel to
metrics port 50052); `README.md` deploy section;
`docs/agents/topics/agent-gameplay-testing.md` (clone command);
`.claude/settings.json` allowlist (`fly *` → `ssh`/`scp` equivalents).

### Phase 3: provision staging

1. Order a CX23 in HEL1 with your SSH key. Attach a Hetzner Cloud Firewall
   (22/80/443). Run `deploy/bin/bootstrap-server.sh`.
2. Create `/etc/border-empires/secrets.env` (root, mode 600) with the Fly
   staging secret names: `ADMIN_API_TOKEN`, `ADMIN_EMAIL`,
   `GATEWAY_EMAIL_ALERTS_RESEND_API_KEY`,
   `GATEWAY_SLOW_LOGIN_ALERT_SLACK_WEBHOOK`, `PROBE_FIREBASE_REFRESH_TOKEN`,
   `SIMULATION_ENABLE_AI_AUTOPILOT`, `SIMULATION_ENABLE_SYSTEM_AUTOPILOT`,
   `SIMULATION_MAP_STYLE`, `SIMULATION_SEED_PROFILE`. Fly secrets aren't
   readable through the API. Copy each value with
   `fly ssh console -a border-empires-combined-staging -C 'printenv NAME'`
   straight into the file, and never into chat, git or CI logs. Fly secrets
   override `[env]`, so check those last four against `deploy/env/staging.env`.
3. Rehearse the restore before it matters: clone the current staging DB
   (`pnpm ops:prod-shape:clone-snapshot --app border-empires-combined-staging`),
   upload it to `/srv/border-empires/data/`, deploy the current `develop` SHA,
   and hit it with `curl --resolve api-staging.borderempires.com:443:<ip>`.
   Run `scripts/verify-staging-realtime.mjs` against it using
   `--resolve`/hosts-file pinning. Expect: boot in under 2 min, soak plus
   guest probe green, steal under 5% (`/proc/stat`).
4. Run one backup and one restore drill: download the latest B2 object,
   decompress, and boot it locally against `pnpm dev`.

### Phase 4: staging cutover (downtime OK, about 30 min)

1. Disable the deploy-staging workflow (`gh workflow disable`) so nothing
   deploys mid-move.
2. Final data copy with no lost writes: stop the Fly machine (SIGTERM flushes
   persistence). Restart it with the app disabled: override the entrypoint to
   `sleep infinity` with `fly machine update`, checking the exact flag on the
   current flyctl. Then checkpoint the WAL and `VACUUM INTO`, sftp the file
   down, and upload it to the VPS. No process is writing, so it's consistent.
3. `deploy <sha>` on the VPS with the SHA Fly was running. Confirm `/health`.
4. Change the `api-staging` record from CNAME (Fly) to A (VPS IPv4). Wait out
   the TTL.
5. Set `STAGING_BACKEND=hetzner`, re-enable the workflow, and push a trivial
   commit to `develop` through a PR. The full pipeline must go green,
   including the soak, guest probe, and Vercel alias.
6. Leave the Fly machine stopped, not destroyed. Add the uptime monitor.

**Rollback:** stop the VPS app, copy its DB back to the Fly volume (reverse of
step 2), start Fly, point the record back to the CNAME, and set
`STAGING_BACKEND=fly`.

### Phase 5: staging trial (1 week)

- Every staging deploy green, including the guest probe. Zero watchdog kills
  in `/data/.death-forensics.json.history.json`.
- Check steal and CPU daily (`head -1 /proc/stat` twice, 10s apart). Sustained
  steal above 10% means the host is noisy: ask Hetzner to migrate the server,
  or move to CPX22.
- Backups appear hourly in B2. Perform one more restore drill.

### Phase 6: production cutover (about 15–30 min downtime, at a low-traffic hour)

Same as Phases 3–4, for `border-empires-combined` / `api.borderempires.com`,
plus:

- Announce the maintenance window to players in advance.
- Copy the production-only secrets too: `BARBARIAN_PURGE`,
  `ROUTINE_LAG_ALERT_FIRE_TOKEN`, `ROUTINE_LAG_ALERT_FIRE_URL`,
  `SIMULATION_SEASON_SCHEDULED_START_AT`, `DAILY_ACTIVITY_DIGEST_SLACK_WEBHOOK`.
- Run the prod-shape gate in `deploy-prod.yml` against an SSH clone of the new
  server before the first post-cutover deploy (`PROD_BACKEND=hetzner`).
- Same rollback path as staging. Keep Fly stopped for 14 days.

### Phase 7: decommission Fly

After 14 days of green production: `fly apps destroy` both apps, including
all volumes. Remove `fly.combined*.toml`, the `flyctl` steps and `--app`
paths, `scripts/check-staging-fly-env-drift.mjs`, and the `FLY_APP_NAME`
fallback. Remove the `FLY_API_TOKEN` secret. Archive this plan to
`docs/archive/`.

## Risks

| Risk | Mitigation |
|---|---|
| Split-brain writes: Fly and VPS both live | The final copy only happens after Fly is stopped, and the DNS change follows the data move. Never start both |
| Noisy neighbour on shared vCPU | Phase 5 steal checks; CPX22 or CX33 upgrade path still fits the budget |
| No managed TLS/proxy | Caddy auto-renews certificates; the uptime monitor alerts within minutes if TLS or proxying fails |
| Ops burden (OS patches, disk) | unattended-upgrades; 40GB disk vs ~0.5GB data; logs capped by json-file rotation |
| Deploy SSH key compromise | Forced command limits it to `deploy <sha>` with images from our GHCR namespace; rotate via repo secret |
| Deploy downtime | Same as today: Fly's single machine with a volume already stops and starts on each deploy |

## Acceptance criteria

- Five consecutive green staging deploys, including the 10-minute soak and the
  guest AUTH→INIT probe.
- Staging boot from a snapshot under 2 minutes, and steady-state steal under
  5%.
- An hourly backup lands in B2, and a restore drill boots locally.
- Monthly invoice at or under $10 per environment.
- `git grep -E 'fly\.dev|flyctl'` finds only archived or legacy-parity
  references after Phase 7.
- `docs/agents/deploys.md` and `README.md` describe the Hetzner flow.

## Verification

Phase 1: client and unit tests for the URL defaults, plus a live connection
through the new hostnames. Phase 2: `pnpm ci:local`, plus a dry-run deploy to
the staging VPS before cutover. Phases 4 and 6: the existing
`scripts/verify-staging-realtime.mjs` soak, the prod-shape gate, and
`/proc/stat` steal sampling. When production is delivered, the canonical
reference is `docs/agents/deploys.md`.
