# Deploys

Read this before any deploy or Vercel/Fly CLI work. AGENTS.md links here.

## Stack targets (critical)

- **Staging** (`https://staging.borderempires.com`, fly app `border-empires-combined-staging`) runs the **combined rewrite stack**: `apps/realtime-gateway` + `apps/simulation` in one process, built by `Dockerfile.combined` / `fly.combined.staging.toml`.
- **Production** (`https://play.borderempires.com`, fly app `border-empires-combined`) runs the **combined rewrite stack**: `apps/realtime-gateway` + `apps/simulation` in one process, built by `Dockerfile.combined` / `fly.combined.toml`.
- "Deploy to staging" = deploying the rewrite stack. Use `pnpm deploy:staging:all` from any worktree on any branch — it fast-forwards `origin/staging` to `origin/main`, deploys the combined Fly app, then publishes the client to Vercel and flips the staging alias. Fly escape hatch: `fly deploy --config fly.combined.staging.toml --strategy rolling --remote-only`. Piecemeal split gateway/simulation staging deploys are obsolete.
- "Deploy to production" = deploying the combined rewrite stack plus the prod client. Use `pnpm deploy:prod:all` from a clean checkout at `origin/main`; it requires a recent successful prod-shape gate JSON for the exact target SHA, deploys `fly.combined.toml`, tags the release, updates `origin/production`, and publishes the client with the gateway backend default.
- When a user says "deploy" without naming an environment, treat that as **staging by default**. Do not assume production unless the user explicitly says `production`, `prod`, or otherwise makes it unambiguous.
- Before any production deploy, make sure this checkout is updated to the latest `origin/main`, then run the prod-shape gate against an isolated clone of the latest production map. Set `PROD_SHAPE_GATE_RESULT_JSON` to that result before running `pnpm deploy:prod:all`. Bypass only for emergency rollback with `SKIP_PROD_SHAPE_GATE=1`.

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
#    (replace <CLONE_DIR> with the path the previous step printed).
GATEWAY_SQLITE_PATH="<CLONE_DIR>/border-empires.db" \
SIMULATION_SQLITE_PATH="<CLONE_DIR>/border-empires.db" \
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

The clone script runs `VACUUM INTO` on the remote server to produce a single consistent, defragmented SQLite file — no WAL/SHM coordination needed. The `VACUUM INTO` holds a read lock for ~30-60s on a ~1GB database; the simulation's writes queue during that window and resume after (no user-visible impact). Server-side temp files are cleaned up after the SFTP pull. Cloned snapshots are git-ignored under `.prod-shape-clones/`.

`pnpm deploy:prod:all` runs the same verification internally. The result must be `ok: true`, recent by default within 6 hours, and stamped with the exact deploy SHA.

## Vercel

- Use exactly one Vercel project: `border-empires-client` (`projectId` `prj_QczQjhdpgV6Mu8Q03r4Ot6KWD1va`, `orgId` `team_GdmtYDKeSISxfvppIgLt4Rma`).
- `pnpm vercel:link:client` from the repo root rewrites the current worktree's `.vercel/project.json` to that pinned project before any manual Vercel CLI work.
- Reserve the `staging` branch for `https://staging.borderempires.com`; `pnpm deploy:client:staging` must run from `staging` unless an explicit one-off override env var is set.
- For production client deploys: `pnpm deploy:client:prod` from the repo root. Must run from `main` and verifies the public Vercel aliases serve the new bundle without capturing the staging alias.
- Do not create or link additional Vercel projects for this repo. Reuse `border-empires-client` and prefer the stable production domain `https://border-empires-client.vercel.app/` when reporting deploy results.

## Fly

- Production app name: `border-empires-combined`.
- Use `fly status -a border-empires-combined`, `fly logs -a border-empires-combined`, and `pnpm deploy:prod:all` for production runtime checks and deploys. Direct Fly escape hatch: `fly deploy --config fly.combined.toml --strategy rolling --remote-only`.

## Deploy safety

- Treat the following as serialized — only one agent at a time: `git push origin main`, `vercel deploy --prod`, `vercel env rm`/`add`, `vercel alias set`, `fly deploy -a border-empires-combined`, `fly secrets set`, any database migration. If you cannot guarantee you are the only agent running these, surface the deploy to the user.
- Production env vars are global mutable state. Prefer `printf '<value>' | vercel env add` over interactive prompts (avoids stray newlines), and re-read with `vercel env pull && cat .vercel/.env.production.local` to verify it round-trips clean.
- After any prod deploy, verify by hitting the live URL: confirm `wss://border-empires-combined.fly.dev/ws` round-trips a valid handshake (`wsReadyState` reaches `1`) within 5s. A successful build is not a successful deploy.
- If a deploy fails or smoke check is red, do not roll forward by re-running. Roll back to the previous Vercel/Fly release, then investigate.
