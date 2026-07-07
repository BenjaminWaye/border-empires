# Nightly Load Harness

## Scope

How the nightly load harness (`.github/workflows/nightly-load-harness.yml`,
`scripts/rewrite-load-harness.mjs`) works, why it runs against a local fixture
instead of staging, and how to update the fixture. Does not cover reading
live metrics/admin endpoints from the combined staging/prod app — see
`docs/combined-stack-admin-access.md` for that (separate mechanism).

## Why local fixture, not staging

Earlier versions of this workflow authenticated as `player-1` against live
staging (`border-empires-combined-staging`) via a Firebase refresh token and
ran EXPAND/ATTACK commands there. Every run visibly mutated a real player's
territory on a shared environment, and the harness had never actually passed
CI since creation — first on DNS/auth failures, later on aspirational gate
thresholds, and (once those were fixed) on a silent `git add` no-op because
`docs/load-results/` is gitignored.

As of 2026-07, the workflow instead starts `apps/simulation` +
`apps/realtime-gateway` as background `tsx watch` processes directly on the
GitHub Actions runner, loaded from a DB snapshot published as a GitHub
Release asset. No Fly secrets, no Firebase auth, zero staging interaction.

## Entry points

- `.github/workflows/nightly-load-harness.yml`: the workflow itself — download
  fixture, start sim+gateway, wait for readiness, run harness, check gates,
  commit results (only pushes to `main` when actually running on `main`).
- `scripts/rewrite-load-harness.mjs`: drives soak batches via
  `scripts/rewrite-local-soak.mjs`, scrapes gateway/simulation metrics, writes
  `docs/load-results/YYYY-MM-DD.json`, computes the `gates` object.
- `scripts/rewrite-local-soak.mjs`: the actual WebSocket client. Sends
  `AUTH_TOKEN` (default `"player-1"`) — accepted directly by the gateway only
  when `defaultHumanPlayerId` is set, which happens automatically in
  unmanaged/local runtime mode (no `FLY_APP_NAME`, `NODE_ENV` not
  production/staging) — see `apps/realtime-gateway/src/runtime-env/runtime-env.ts`.

## The fixture

- Published as a GitHub Release: tag `load-harness-fixture-v1`, asset
  `harness-fixture-v1.db`.
- Captured from `border-empires-combined-staging` at a point with ~1900+
  tiles, 20 AI autopilot players, islands map (`SIMULATION_MAP_STYLE=islands`,
  `SIMULATION_SEED_PROFILE=season-20ai`).
- Pulled via `fly ssh sftp get`, then WAL-checkpointed with the system
  `sqlite3` CLI (`PRAGMA wal_checkpoint(TRUNCATE)`) into a single
  self-contained `.db` file so no `-wal`/`-shm` companion files are needed.
- It is a single point-in-time capture, not automatically refreshed. To
  publish a fresher/larger one: pull+checkpoint a new snapshot the same way,
  `gh release create <new-tag> <file>`, then bump `FIXTURE_TAG` /
  `FIXTURE_ASSET` in the workflow.

## Known non-fatal noise

Two workers crash-loop harmlessly under `tsx watch` because worker_threads
spawned via `new Worker(...)` don't inherit tsx's ESM loader hook, so their
own relative `.js`-suffixed imports fail to resolve to the `.ts` source:

- `apps/simulation/src/snapshot-build-worker.ts` — bypassed entirely by
  `SIMULATION_SNAPSHOT_BUILD_INLINE=1` (falls back to a synchronous inline
  snapshot build; see `apps/simulation/src/simulation-service/simulation-service.ts`).
- `apps/realtime-gateway/src/gateway-stringifier/gateway-stringify-worker.ts`
  — no inline bypass currently exists; it just respawns and the gateway falls
  back to whatever synchronous path it has. Did not block a full green
  harness run, but is a latent bug worth fixing properly (register tsx's
  loader for the worker via `execArgv`, or ship a compiled `.js` alongside
  the `.ts` source for dev mode).

## Runtime requirement

`apps/simulation` uses `node:sqlite`, added in Node 22.5. The workflow's
`actions/setup-node` step must stay on Node 22+; Node 20 fails with
`ERR_UNKNOWN_BUILTIN_MODULE`.

## Reproducing locally

```bash
mkdir -p .local-data
gh release download load-harness-fixture-v1 --pattern harness-fixture-v1.db \
  --output .local-data/harness-fixture-v1.db

SIMULATION_SQLITE_PATH="$(pwd)/.local-data/harness-fixture-v1.db" \
SIMULATION_SNAPSHOT_BUILD_INLINE=1 \
SIMULATION_ENABLE_AI_AUTOPILOT=1 \
SIMULATION_ENABLE_SYSTEM_AUTOPILOT=1 \
pnpm --filter @border-empires/simulation run dev &

PORT=13101 SIMULATION_ADDRESS=127.0.0.1:50051 \
pnpm --filter @border-empires/realtime-gateway run dev &

# wait for: curl -s http://127.0.0.1:13101/healthz | grep '"connected":true'

WS_URL=ws://127.0.0.1:13101/ws \
GATEWAY_METRICS_URL=http://127.0.0.1:13101/metrics \
SIMULATION_METRICS_URL=http://127.0.0.1:50052/metrics \
node scripts/rewrite-load-harness.mjs
```
