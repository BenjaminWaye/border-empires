# Rewrite Completion Plan (last updated 2026-04-20)

Companion docs:

- `docs/rewrite-hard-plan-2026-04-16.md` (architectural plan)
- `docs/rewrite-week-summary-2026-04-16.md` (honest status as of last week)

This document replaces those as the single source of truth for what remains. It is written so that a fresh coding thread can execute it without asking the author what was meant.

**Status at 2026-04-20:** Phases 0, 1, 2, 3 are merged to `main`. Phase 4 is in progress. Phases 5–7 not started. See §2 for a verified status breakdown and §§4–7 for what each completed phase actually delivered vs. what was planned.

---

## 1. Goals and non-goals

### Goals

1. Finish the split into `apps/realtime-gateway`, `apps/simulation`, `packages/game-domain`.
2. Cut the production client over to the new stack without interrupting the current beta testers.
3. Eliminate the class of regressions where acceptance and resolution disagree (Bug 2 class).
4. Eliminate the class of regressions where state does not survive a restart (Bug 1 class).
5. Fix the original problem: human frontier actions never share fate with AI, chunking, maintenance, snapshot IO, or any other background work.

### Non-goals

- We are not retaining snapshot files as the authoritative store. Postgres becomes source of truth; snapshot files become a recovery optimization only.
- We are not maintaining a dual-write compatibility shim between legacy and rewrite for gameplay data. A player session lives entirely on one backend or the other.
- We are not shipping new gameplay features during this plan. Any PR that adds player-visible gameplay changes is blocked until this plan closes.

### Cost budget — hard cap $10/month

Total Fly spend for Border Empires must stay at or below **$10/month**. This is a hard constraint and it shapes the decisions below; every phase's acceptance criteria include a cost check.

Approximate monthly cost of the Fly resources in play (shared-cpu-1x at ~$1.94/machine/month + ~$0.15/GB-month for volumes):

| Resource | Cost |
|---|---|
| `border-empires` (legacy monolith, 512MB) + 1GB volume | ~$2.10 |
| `border-empires-gateway` (512MB) | ~$1.94 |
| `border-empires-simulation` (512MB) | ~$1.94 |
| `border-empires-postgres` (shared-cpu-1x, 10GB volume) | ~$3.44 |
| `border-empires-gateway-staging` (512MB, auto-stop on) | ~$0.20 if idle most of the day |
| `border-empires-simulation-staging` (512MB, auto-stop on) | ~$0.20 if idle most of the day |

Constraints this forces:

- **Staging machines must have `auto_stop_machines = "on"`** and `min_machines_running = 0`. Running 24/7 alongside prod blows the budget. Staging wakes on demand for harness runs and CI nightly jobs.
- **One shared Postgres cluster** (`border-empires-postgres`) with two logical databases (`border_empires_staging`, `border_empires_prod`). We cannot afford a second cluster.
- **No HA / no read replica.** `--initial-cluster-size 1`. A second Postgres machine would add ~$2/month and isn't worth it for beta. Rollback story in §11 assumes the DB can be unavailable for minutes, not seconds.
- **Postgres volume stays at 10 GB** through Phase 6. We estimate the projection tables + recent event stream + last few snapshots fit comfortably; the snapshot retention policy in §6 is written around that budget.
- **Legacy app is deleted in Phase 7**, which recovers ~$2.10/month. Until then we are running both stacks.
- **Steady-state cost after Phase 7:** ~$7.32/month (gateway + sim + postgres + staging-idle). Room remains under cap but no room for a second region or a larger VM.

### Definition of "ship it"

All of the following must be true, proven by automated tests in CI and a 30-minute soak against a production snapshot copy:

- `ACTION_ACCEPTED` p95 < 100 ms, p99 < 250 ms, max < 500 ms under 40 AI + chunking + persistence + 1 human frontier-spamming client.
- Gateway event-loop max < 50 ms during the same soak.
- Simulation event-loop max < 100 ms during human attacks in the same soak.
- Restart parity test suite green for every migrated command type.
- Acceptance/resolution contract test green (every accepted command produces exactly one terminal event, no silent failures).
- Preview/resolution consistency test green (ATTACK_PREVIEW p(win) matches empirical win rate from `rollFrontierCombat`).
- Legacy/rewrite parity test green across the feature-parity checklist in §8.
- `/healthz` on gateway and simulation both return full runtime provenance (source type, season id, world seed, snapshot label, fingerprint, player count, seeded tile count).

---

## 2. Current honest state (2026-04-20 inspection)

Verified against the tree, not the handoff narrative. HEAD = `22b76c1` on `main`.

**Done and on `main`:**

- **Phase 0** landed as commit `2596eed` / PR #13 (`Phase 0: Land rewrite stack on main behind kill-switch`). Rewrite packages (`apps/realtime-gateway`, `apps/simulation`, `packages/game-domain`, `packages/sim-protocol`, `packages/client-protocol`) are tracked in git. Client kill-switch (`packages/client/src/client-backend-selector.ts`) is live: prod default stays on legacy, `?backend=gateway` URL param or `be-backend=gateway` cookie opt in to the new stack. HUD badge surfaces `state.activeBackend`.
- **Phase 1** landed as commit `e22be4c` / PR #14 (`Phase 1: Clean domain boundary — promote server modules to game-domain`). `packages/game-domain` absorbed `server-game-constants`, `server-shared-types`, `server-world-runtime-types`, 5 worldgen modules, `town-names`, and the tech/domain JSON trees. `apps/simulation` and `apps/realtime-gateway` no longer import `../../../packages/server/*`. `scripts/check-no-cross-package-imports.sh` + `packages/game-domain/src/boundary.test.ts` enforce it in CI. `Dockerfile.gateway` and `Dockerfile.simulation` no longer `COPY packages/server`.
- **Phase 2** landed as commit `4f24c70` / PR #15 (`Phase 2: Postgres-authoritative persistence — projections, staging configs, importer`). SQL migrations `0004_player_projection.sql` … `0007_visibility_projection.sql` added. `postgres-projection-writer.ts` writes all four projections at checkpoint time. `fly.gateway.staging.toml` and `fly.simulation.staging.toml` created for staging Fly apps. `scripts/rewrite-db-import-legacy-snapshot.ts` seeds world_snapshots + projections from a legacy snapshot directory. `provision-fly-staging.command` creates the Fly Postgres cluster and attaches it. Tests: `restart-parity.integration.test.ts`, `snapshot-projection.test.ts`, `migration-idempotent.test.ts`.
- **Phase 3** landed as commit `22b76c1` (`Phase 3: offload AI/system planning to worker threads`). AI planning runs in `apps/simulation/src/ai-planner-worker.ts` (Node worker thread). System jobs run in `apps/simulation/src/system-job-worker.ts`. Worker-backed producers (`ai-command-producer-worker.ts`, `system-command-producer-worker.ts`) pause on human_interactive backlog and resume on drain. Selection happens at startup via `SIMULATION_AI_WORKER=1` env flag. Tests: `ai-pause-resume.test.ts`, `system-job-worker.test.ts`.

**Production impact so far: none.** Client prod default `VITE_WS_URL` is still `wss://border-empires.fly.dev/ws` (legacy monolith). No beta testers have been flipped to the gateway yet.

**Concrete Phase 2 infrastructure decision:** Fly Postgres, one shared cluster `border-empires-postgres`, `--initial-cluster-size 1` (no HA), `--vm-size shared-cpu-1x`, 10 GB volume, region `arn`. One logical DB per environment (`border_empires_staging` provisioned; `border_empires_prod` will be created in Phase 6). `DATABASE_URL` attached via `fly postgres attach` on each app. Staging role password is `staging_changeme` in `provision-fly-staging.command` — must be rotated before Phase 6, see §13.

**What's still unfinished (Phase 4 and beyond):**

- **Parity is not proven.** The parity harness described in §9.3 (legacy vs. rewrite snapshot diff) does not exist yet. Neither does the coverage-enforcement test in §9.5, the load harness in §9.6, or the reconnect harness in §9.4.
- **The specific bugs in §9.1 and §9.2 are not yet guaranteed caught.** The Phase 2 `restart-parity.integration.test.ts` is a start but is not yet parameterized over every mutating command type. Bug 1 (settled town + tiles vanish after restart) and Bug 2 (100% win-chance attack neither captures nor charges) are exactly the classes that will break us if we cut over without §9.
- **Observability has not landed.** Neither service exposes `/metrics`. Phase 5 work.
- **Load gates have not been run.** The plan's p95/p99/backlog numbers in §1 are unverified. Phase 5 work.
- **Staging has not been deployed from `main` yet.** `provision-fly-staging.command` exists but has not been run end-to-end against the current main build to confirm both staging apps boot DB-only and pass health checks.
- **Prod deploy is blocked.** Even Phase 6 pre-flight requires a `border-empires-postgres-prod` logical DB, `DATABASE_URL` secrets on the prod gateway + simulation apps, and the budget accounting in §1 "Cost budget."
- **Legacy monolith (`border-empires`) is still the prod backend** and must remain untouched until Phase 6 succeeds.

Bug 1 (settled town and tiles vanish after restart) and Bug 2 (attack at 100% win chance neither captures nor charges manpower) are each diagnostic of a different unfinished acceptance area. They motivate the test architecture in §9 and are the gating reason Phase 4 must complete before Phase 6.

---

## 3. Plan shape

Seven phases. Each phase is mergeable on its own, each lands behind a kill-switch flag that keeps production on the legacy monolith until Phase 6. Phase 4 is in progress now.

| Phase | Title | Status | Prod risk | Mergeable behind flag |
|---|---|---|---|---|
| 0 | Land rewrite onto `main` behind a kill-switch | Done (`2596eed`, PR #13) | None | Yes |
| 1 | Clean the domain boundary | Done (`e22be4c`, PR #14) | None | Yes |
| 2 | Postgres-authoritative persistence (staging) | Done (`4f24c70`, PR #15) | None | Yes |
| 3 | AI and system jobs off the authoritative loop | Done (`22b76c1`) | None | Yes |
| 4 | Feature-parity sweep and test coverage | Done (`28d5d59`, PR #17) | None | Yes |
| 5 | Observability and load-test gates | Done (`67d41d3`, PR #19) | None | Yes |
| 6 | Beta cutover → full cutover | Not started | Controlled | No (this is the switch) |
| 7 | Delete legacy monolith | Not started | Low | N/A |

---

## 4. Phase 0 — Land the rewrite onto `main` behind a kill-switch

**Status: Done — merged as `2596eed` (PR #13) on 2026-04-20.**

What actually landed:

- Rewrite packages (`apps/realtime-gateway`, `apps/simulation`, `packages/game-domain`, `packages/sim-protocol`, `packages/client-protocol`) tracked in git.
- `packages/client/src/client-backend-selector.ts` implements the `?backend=` param / `be-backend` cookie / env-default priority chain. Localhost defaults to gateway; prod defaults to legacy. `VITE_GATEWAY_WS_URL` is undefined in prod until Phase 6.
- `state.activeBackend` exposed on `ClientState`; HUD bridge debug badge shows active backend.
- Tests: `client-backend-selector.test.ts`, `client-backend-selector.integration.test.ts`.
- `pnpm-workspace.yaml` and `tsconfig.base.json` updated.
- `packages/shared/src/frontier-combat.ts` promoted to the one true combat module.
- `packages/shared/src/messages.ts` carries `commandId` / `clientSeq` metadata.

Production impact: none. Client prod default `VITE_WS_URL` is unchanged.

The rest of this section is retained for historical reference.

### Goal

Stop working out of a dirty checkout. Get the rewrite stack into `origin/main` so CI runs against it, so drift against main stops accumulating, and so the next threads are not manually reconstructing state.

### Deliverables

1. Rebase `f69dfbf` onto current `origin/main`, resolving conflicts against the 10 intervening commits (alliance UX, HQ summary, settlement capture fix, barbarian maintenance, opportunistic AI tuning, server runtime split).
2. Commit all 45 untracked rewrite files and ~48 modifications from the working tree (see `git status` listing in §2).
3. Add a client-side backend kill-switch:
   - `packages/client/src/client-app-runtime-env.ts`: prod default `VITE_WS_URL` stays `wss://border-empires.fly.dev/ws` (legacy).
   - New env var `VITE_GATEWAY_WS_URL` (undefined in prod today).
   - New URL param `?backend=gateway|legacy` and cookie `be-backend=gateway|legacy` that override the default.
   - State on the client: `state.activeBackend: "legacy" | "gateway"` exposed in the HUD debug badge.
4. CI matrix update (`.github/workflows/*` if present; otherwise add `scripts/ci-rewrite-test.sh`):
   - `pnpm --filter @border-empires/{shared,game-domain,client-protocol,sim-protocol,realtime-gateway,simulation} test`
   - `pnpm --filter @border-empires/client test`
   - `pnpm --filter @border-empires/server test` (legacy stays green until Phase 7)
   - `pnpm lint` across the workspace.
5. README update: how to run `pnpm dev` (rewrite) vs `pnpm dev:legacy`, and how to open the client against either backend.

### Tests to add in this phase

- `packages/client/src/client-backend-selector.test.ts`: URL param overrides cookie overrides env default; default in prod is legacy; default on localhost is rewrite.
- `packages/client/src/client-backend-selector.integration.test.ts`: toggling the cookie mid-session is surfaced in the HUD badge on next reconnect.

### Acceptance

- `git status` is clean on `main`.
- `git diff origin/main --stat` is zero after push.
- CI is green.
- Opening the prod client with no override still connects to legacy.
- Opening with `?backend=gateway` against a local gateway connects to the rewrite stack.

### Rollback

Revert the merge commit. Production default was never changed.

---

## 5. Phase 1 — Clean the domain boundary

**Status: Done — merged as `e22be4c` (PR #14) on 2026-04-20.**

What actually landed:

- `packages/game-domain/src/` now contains `server-game-constants.ts`, `server-shared-types.ts`, `server-world-runtime-types.ts`, `server-worldgen-{clusters,docks,shards,terrain,towns}.ts`, and `town-names.ts`.
- `packages/game-domain/data/` contains `tech-tree.json` and `domain-tree.json`.
- `AuthIdentity` and `SystemSimulationCommand` are inlined into `packages/game-domain` so the domain has no `packages/server` imports.
- `apps/simulation/src/*` and `apps/realtime-gateway/src/*` import from `@border-empires/game-domain` instead of `../../../packages/server/*`.
- `Dockerfile.gateway` and `Dockerfile.simulation` no longer `COPY packages/server`.
- `packages/game-domain/src/boundary.test.ts` and `scripts/check-no-cross-package-imports.sh` enforce the boundary in CI.

Delta from plan: the legacy monolith still builds against `packages/server/src/server-*.ts` directly (the original files still exist there). No re-export shims were needed because nothing outside the legacy monolith imports from `packages/server/*` anymore. Phase 7 will delete the duplicated files from `packages/server`.

### Goal

Make the simulation independent of `packages/server`. Prevent `apps/*` from reaching into `packages/server/*`.

### Deliverables

1. Move these modules out of `packages/server` into a new package `packages/game-domain` (absorbing what's already there):
   - `packages/server/src/server-game-constants.ts`
   - `packages/server/src/server-shared-types.ts`
   - `packages/server/src/server-worldgen-clusters.ts`
   - `packages/server/src/server-worldgen-docks.ts`
   - `packages/server/src/server-worldgen-shards.ts`
   - `packages/server/src/server-worldgen-terrain.ts`
   - `packages/server/src/server-worldgen-towns.ts`
   - `packages/server/src/town-names.ts`
   - `packages/shared/src/frontier-combat.ts` (make this the one true combat module)
2. Leave re-export shims in `packages/server/src/*.ts` for back-compat so the legacy monolith still builds. Shims import from `@border-empires/game-domain` and re-export.
3. Replace every `../../../packages/server/src/server-*` import in `apps/simulation/src/*` and `apps/realtime-gateway/src/*` with `@border-empires/game-domain`.
4. Add a lint rule that forbids cross-package relative imports:
   - `eslint-plugin-import` `no-restricted-paths`, or equivalent tsconfig project-reference check.
   - Pattern: `apps/**` may not import from `packages/server/**` by any path.
5. Remove `COPY packages/server` from `Dockerfile.gateway` and `Dockerfile.simulation`. If the build still needs it, that is a boundary violation that must be fixed before this phase closes.

### Tests to add

- `packages/game-domain/src/boundary.test.ts`: no import of anything under `packages/server/src/*` from the domain package (parse imports statically).
- CI job `scripts/check-no-cross-package-imports.sh`: `rg "../../../packages/server" apps/` returns zero matches.
- Preserve every existing server test: moving the files must not break `packages/server/test` suites.

### Acceptance

- `grep -r "packages/server" apps/simulation/src apps/realtime-gateway/src` returns nothing.
- `docker build -f Dockerfile.simulation .` succeeds without `packages/server` in the context.
- Legacy monolith (`pnpm dev:legacy`) still boots and plays end-to-end.

### Rollback

Revert the phase branch. Re-export shims mean the legacy server keeps working either way.

---

## 6. Phase 2 — Postgres-authoritative persistence

**Status: Done — merged as `4f24c70` (PR #15) on 2026-04-20.**

What actually landed:

- SQL migrations `0004_player_projection.sql` … `0007_visibility_projection.sql`, each with an FK → `world_snapshots.snapshot_id`.
- `apps/simulation/src/postgres-projection-writer.ts` (252 lines) writes all four projection tables in parallel at checkpoint time.
- `PostgresSimulationSnapshotStore.saveSnapshot()` now accepts optional `projectionState` and writes projections in the same transaction as the snapshot INSERT.
- `SnapshotCheckpointManager` accepts an `exportProjectionState` callback; `simulation-service.ts` wires it to `runtime.exportState()`.
- `SimulationSnapshotStore` interface updated so `InMemorySimulationSnapshotStore` still satisfies it unchanged.
- `fly.gateway.staging.toml`, `fly.simulation.staging.toml`: new staging Fly apps (`border-empires-{gateway,simulation}-staging`).
- `scripts/rewrite-db-import-legacy-snapshot.ts`: one-shot importer that reads a legacy snapshot dir and seeds `world_snapshots` + all projections.
- `provision-fly-staging.command`: user-runnable script that creates the Fly Postgres cluster, creates the staging DB and role, creates the two staging Fly apps, and attaches `DATABASE_URL` via `fly postgres attach`.
- Tests: `restart-parity.integration.test.ts`, `snapshot-projection.test.ts`, `migration-idempotent.test.ts`.

**Provisioning decision that got made (this is the answer to the Phase 2 open question):**

- **Fly Postgres**, not Neon / Supabase / self-managed.
- **One shared cluster** `border-empires-postgres` in region `arn`, `--initial-cluster-size 1` (no HA), `--vm-size shared-cpu-1x`, 10 GB volume. Cost ≈ $3.44/month.
- **One logical database per environment**, same cluster: `border_empires_staging` (provisioned), `border_empires_prod` (to be created in Phase 6).
- **One role per environment** (`be_staging`, `be_prod` in Phase 6). `DATABASE_URL` is attached via `fly postgres attach`, not set by hand.
- `NODE_ENV=staging` on staging apps; production apps get `NODE_ENV=production` in Phase 6.
- Snapshot cadence on staging: `SIMULATION_SNAPSHOT_EVERY_EVENTS=1000`. Prod cadence in Phase 6 will be `5000` (matches legacy).

**Known residual work from Phase 2 that Phase 4/5/6 must finish:**

1. `provision-fly-staging.command` has not been end-to-end run against current `main` yet. Before Phase 4 closes, run it and confirm both staging apps pass health checks with DB-only boot (no snapshot file).
2. The role password in the script is `staging_changeme`. Rotate immediately after first provisioning and store in 1Password / Fly secret. Add a check to `provision-fly-prod.command` (to be written in Phase 6) that refuses to run with a placeholder password.
3. Prod equivalents do not exist yet:
   - `fly.gateway.toml` and `fly.simulation.toml` do not carry `DATABASE_URL`. `fly postgres attach` needs to happen on both during Phase 6.
   - No `provision-fly-prod.command` script exists. Write it as part of Phase 6 pre-flight using `provision-fly-staging.command` as the template.
4. Backup strategy is not implemented. Fly volume snapshots are on by default but retention is short. Before Phase 6 pre-flight:
   - Add a Fly scheduled job (or a tiny separate worker) that runs `pg_dump border_empires_prod | gzip` nightly and writes to a Fly Tigris bucket or R2 (whichever is cheaper at our volume; typically pennies per month for <1 GB).
   - Retain 7 daily + 4 weekly dumps.
   - Document the restore runbook in `docs/runbooks/postgres-restore.md`.
5. Staging apps must be configured with `auto_stop_machines = "on"` and `min_machines_running = 0` so they do not run 24/7. Current `fly.gateway.staging.toml` and `fly.simulation.staging.toml` must be audited and patched if needed. This is the $10/month-budget lever in §1.
6. `SIMULATION_ALLOW_SEED_RECOVERY_FALLBACK` handling: confirm that `NODE_ENV=staging` and `NODE_ENV=production` both refuse seed fallback; only `NODE_ENV=development` allows it. The runtime-env code enforces this but add an explicit test.

### Original Phase 2 plan (retained for reference)

### Goal

DB is source of truth for commands, events, and snapshots in staging and prod. Snapshot files become a warm-start optimization only.

### Deliverables

1. Provision Postgres in Fly:
   - One shared `border-empires-postgres` cluster (staging + prod separate databases, separate roles).
   - Staging DB name `border_empires_staging`, prod DB name `border_empires_prod`.
   - Fly secrets: `DATABASE_URL` set on both `border-empires-gateway` and `border-empires-simulation` (and their staging siblings — see below).
2. Create staging Fly apps:
   - `border-empires-gateway-staging` (`fly.gateway.staging.toml`)
   - `border-empires-simulation-staging` (`fly.simulation.staging.toml`)
   - Same Dockerfiles, separate DATABASE_URLs, `NODE_ENV=staging`, different memory/CPU if needed.
3. Run migrations on both DBs:
   - `apps/realtime-gateway/sql/0001_command_store.sql`
   - `apps/simulation/sql/0001_world_events.sql`
   - `apps/simulation/sql/0002_command_store.sql`
   - `apps/simulation/sql/0003_world_snapshots.sql`
   - New: `apps/simulation/sql/0004_player_projection.sql` (player projection table from the plan)
   - New: `apps/simulation/sql/0005_tile_projection.sql`
   - New: `apps/simulation/sql/0006_combat_lock_projection.sql`
   - New: `apps/simulation/sql/0007_visibility_projection.sql`
4. Snapshot-on-checkpoint writes the full authoritative world state to `world_snapshots` AND the per-projection tables. Recovery path: latest snapshot → replay `world_events` from snapshot's event_id forward.
5. Add a one-shot importer (`scripts/rewrite-db-import-legacy-snapshot.ts`) that reads a legacy snapshot file and writes it as `world_snapshots` row + projections. This is how we bootstrap staging from prod data and is how we eventually seed prod on cutover day.
6. Remove `GATEWAY_ALLOW_SEED_FALLBACK=0` assumption; require DB in non-dev environments. Keep seed fallback available only when `NODE_ENV=development`.

### Tests to add

**Persistence integrity (Bug 1 class — see §9.1 for details):**

- `apps/simulation/src/restart-parity.integration.test.ts`: parameterized over every mutating command type. For each:
  1. Boot sim with in-memory + optional pg-test container.
  2. Apply the command, let it resolve.
  3. Capture `PlayerSubscriptionSnapshot` and `WorldStatusSnapshot`.
  4. Kill the sim, drop the in-memory state, restart from DB only.
  5. Assert snapshots byte-equal.
- `apps/simulation/src/snapshot-projection.test.ts`: world_events + projections are consistent after every resolved command.
- `apps/simulation/src/crash-recovery.test.ts`: kill the process mid-checkpoint write; restart; no command or event is lost (every durable command either has a `command_results` row or is retried).
- `apps/simulation/src/migration-idempotent.test.ts`: running all migrations twice is a no-op.

**Command and event store:**

- Expand `postgres-command-store.test.ts` and `postgres-event-store.test.ts` to cover:
  - Duplicate `commandId` is rejected with the same row (idempotent submit).
  - `(playerId, clientSeq)` uniqueness violation maps to a named error the gateway can handle.
  - Event stream `event_id` is strictly monotonic per world.
  - Snapshot `eventId` watermark advances monotonically.

### Acceptance

- Staging stack boots purely from Postgres (no snapshot file needed).
- A command submitted via staging gateway round-trips through `commands` → `world_events` → projections, then the same state is visible on a fresh sim boot with no snapshot file.
- `SIMULATION_DATABASE_URL` set and working on both staging apps; running `fly deploy` against staging passes health checks.

### Rollback

Staging is isolated; nothing to roll back in prod. Legacy monolith keeps running unchanged.

---

## 7. Phase 3 — AI and system jobs off the authoritative loop

**Status: Done — merged as `22b76c1` on 2026-04-20.**

What actually landed:

- `apps/simulation/src/planner-world-view.ts`: serializable `PlannerWorldView` / `PlannerTileView` / `PlannerPlayerView` types. `buildPlannerWorldView()` strips heavy JSON blobs (fort, observatory, siege outpost, economic structure payloads) before `postMessage` to keep worker transfer cheap.
- `apps/simulation/src/ai-planner-worker.ts`: Node worker thread. Runs settle + frontier planning from `PlannerWorldView`. Handles pause / resume / shutdown protocol.
- `apps/simulation/src/system-job-worker.ts`: Node worker thread. Runs barbarian / upkeep frontier planning. Same message protocol.
- `apps/simulation/src/ai-command-producer-worker.ts`: worker-backed drop-in for `ai-command-producer.ts`. Skips tick when `human_interactive > 0` and sends `pause` to worker; resumes on drain.
- `apps/simulation/src/system-command-producer-worker.ts`: worker-backed drop-in for `system-command-producer.ts`. Skips tick when any queue backlog is non-empty.
- `simulation-service.ts` selects worker-backed or inline producers at startup based on the `useAiWorker` flag.
- `runtime-env.ts` / `main.ts` expose `SIMULATION_AI_WORKER=1` env flag.
- Tests: `ai-pause-resume.test.ts` (verifies backpressure pause/resume with mocked Worker), `system-job-worker.test.ts` (verifies system producer backpressure and command dispatch).

Delta from plan: the plan allowed either worker thread or sibling process. We went with Node worker threads because (a) cheaper than a sibling Fly app under the $10/month cap, (b) `postMessage` is simpler than gRPC for this traffic pattern, (c) the `PlannerWorldView` strip-heavy-blobs pattern keeps transfer cost manageable.

**Residual work for Phase 5 load-test gate:**

- The `ai-isolation.load.test.ts` (nightly) in §9.6 has not been written or run yet. That is where we prove the event-loop and p95 gates from §1, not in these unit tests.
- No CPU profile has been captured on a loaded sim to confirm "> 90% main-thread time in command ingress / < 10% in AI or planning." Phase 5 work.

### Goal

No AI or system planning work executes in the simulation event loop that hosts human command acceptance. This is the phase that actually fixes the original bug, not just relocates it.

### Deliverables

1. `apps/simulation/src/ai-planner-worker.ts` — new worker-thread entry point.
   - Receives `PlannerWorldView` (read-only subset) via `postMessage`.
   - Emits `CommandEnvelope`s back to the main thread, which submits them to the same command bus as humans.
   - Owns the AI autopilot tick (no more `setInterval` on the main thread).
2. `apps/simulation/src/system-job-worker.ts` — same pattern for barbarian maintenance, truce expiry, ability cooldown expiry, structure upkeep.
3. `apps/simulation/src/simulation-service.ts` main thread keeps only:
   - gRPC server
   - command bus (priority queue)
   - authoritative state mutation
   - event emission
   - snapshot/event persistence queue (already exists)
4. Backpressure rules, enforced and tested:
   - If `human_interactive` backlog is non-empty, AI worker is paused (`postMessage("pause")`).
   - If simulation event-loop max over the last 1s exceeds 75ms, system worker is paused.
   - Neither pause can starve humans; system and AI workers get explicit wake-up when human backlog drains.
5. Delete the legacy in-process AI planner orchestration from `runtime.ts`. If code is shared, extract it into `packages/game-domain/src/ai/*` first.

### Tests to add

- `apps/simulation/src/ai-isolation.load.test.ts` (slow, tagged): runs a seeded world with N=40 AI at full tick rate. Asserts:
  - simulation event-loop max < 100ms over 60s
  - `human_interactive` backlog age p99 < 250ms
  - Attack command p95 accept latency < 100ms
- `apps/simulation/src/ai-pause-resume.test.ts`: injecting a human command must pause AI within 50ms and resume after drain.
- `apps/simulation/src/system-job-worker.test.ts`: barbarian expiry runs to completion outside main thread; no long task blocks acceptance.

### Acceptance

- The load test above runs green in CI (nightly).
- `NODE_OPTIONS=--prof` CPU profile of the simulation process shows > 90% of main-thread time in command ingress/acceptance/event emission; < 10% in AI or planning.

### Rollback

Feature-flag `SIMULATION_AI_WORKER=0` keeps AI inline for a week while we watch staging.

---

## 8. Phase 4 — Feature-parity sweep

**Status: Done — landed 2026-04-20 via `b0258b1`, `7142882`, `96acbbb`, merge `28d5d59`.**

What actually landed:

- `b0258b1` Phase 4: command coverage rails (`apps/simulation/src/command-coverage.test.ts`) parameterized over all `DurableCommandTypeSchema` values; attack-preview combat-math aligned so `ATTACK_PREVIEW` p(win) matches `rollFrontierCombat` empirically.
- `7142882` Fix client fallback preview town type typing (regression fix surfaced by the parity tests).
- `96acbbb` Phase 4 review fixes: coverage rails widened; `restart-parity.integration.test.ts` parameterized over all mutating command types; reconnect suite wired.
- `28d5d59` Merge PR #17 — Phase 4 landed on `main`.

### Goal

Close the parity gaps called out in the week summary and prove they stay closed.

### Feature-parity checklist (every item needs a test; see §9)

Command and action surface — already routed in `command-lane.ts`, needs proof-of-correct-behavior per §9:

- `ATTACK`, `EXPAND`, `BREAKTHROUGH_ATTACK`, `ATTACK_PREVIEW`
- `SETTLE`, `CANCEL_CAPTURE`, `UNCAPTURE_TILE`
- `BUILD_FORT`, `BUILD_OBSERVATORY`, `BUILD_SIEGE_OUTPOST`, `BUILD_ECONOMIC_STRUCTURE`
- `CANCEL_FORT_BUILD`, `CANCEL_STRUCTURE_BUILD`, `CANCEL_SIEGE_OUTPOST_BUILD`, `REMOVE_STRUCTURE`
- `COLLECT_TILE`, `COLLECT_VISIBLE`, `COLLECT_SHARD`
- `CHOOSE_TECH`, `CHOOSE_DOMAIN`
- `SET_TILE_COLOR`, `SET_PROFILE`
- `OVERLOAD_SYNTHESIZER`, `SET_CONVERTER_STRUCTURE_ENABLED`
- `REVEAL_EMPIRE`, `REVEAL_EMPIRE_STATS`
- `CAST_AETHER_BRIDGE`, `CAST_AETHER_WALL`
- `SIPHON_TILE`, `PURGE_SIPHON`
- `CREATE_MOUNTAIN`, `REMOVE_MOUNTAIN`
- `AIRPORT_BOMBARD`
- `ALLIANCE_{REQUEST,ACCEPT,REJECT,CANCEL,BREAK}`
- `TRUCE_{REQUEST,ACCEPT,REJECT,CANCEL,BREAK}`

Render and UX parity — each gets a dedicated parity test (legacy vs rewrite snapshot diff):

- Town overview (town type, population tier, gold/min, support, population, is-fed)
- Economy breakdown (gold sources, per-minute rates, strategic production)
- Visibility (vision radius, revealed-state masks, observatory effect)
- Frontier ownership display (contested states, combat locks, attacker indicator)
- Structure render (forts, observatories, siege outposts, economic buildings, sabotage, shard sites)
- Docks and sea-tile rendering
- Leaderboard (by tiles, income, techs; self entry)
- Season victory cards (all paths, progress labels, hold remaining)
- Attack preview / win-chance display
- Frontier claim UX (capture timer, cancel, relocate)
- Bootstrap performance (time-to-first-playable-state)

Reconnect and persistence:

- Reconnect with in-flight command on every command type
- Reconnect mid-capture (settled, not yet resolved)
- Reconnect mid-combat (lock still live)
- Reconnect mid-structure-build
- Reconnect after siphon cast
- Reconnect across a simulation restart (requires Phase 2)

### Deliverables

1. `apps/simulation/src/*` and `apps/realtime-gateway/src/*` port or fix every item above. Whatever fails the parity test in §9.3 gets a bug fix with a regression test.
2. `packages/client/src/*` UX parity for the items that are render-driven.
3. Each checklist item moves from "unverified" to "test in CI" before being considered closed.

### Tests to add

All tests described in §9. Bug 2's failure mode specifically is covered by §9.2 and §9.3.

### Acceptance

- Every checklist item has a green test in CI.
- Parity harness output (legacy vs rewrite) diff is empty for a 5-minute canonical scenario replay.

---

## 9. Test architecture

This section exists because the prompt called out two bugs the author shouldn't have had to find manually. The tests below are written to catch each bug's *class*, not just the instance.

### 9.1 Bug 1 class — "state vanishes on restart"

**Diagnostic:** A command was accepted and visible, but after a server restart, the world shows as if the command never happened. This means one of:

- The event was not durably written before ack.
- The event was written but not replayed on recovery.
- The snapshot was written with stale projection state.
- The projection had a bug that's only visible after a cold start.

**Test pattern — `restart-parity.integration.test.ts`:**

```ts
describe.each(ALL_MUTATING_COMMAND_TYPES)("restart parity: %s", (cmdType) => {
  it("state is identical after a cold restart from DB", async () => {
    const { sim, db } = await bootFreshSim({ seed: CANONICAL_SEED });
    const setup = await applyPreconditions(sim, cmdType);
    const result = await submitAndResolve(sim, buildCommand(cmdType, setup));
    const before = await captureWorldState(sim, setup.playerId);
    await sim.shutdown();

    const { sim: sim2 } = await bootSimFromDb(db);
    const after = await captureWorldState(sim2, setup.playerId);
    expect(after).toEqual(before);
  });
});
```

**Required sub-tests:**

- Settle: settled tile, adjacent radius, town metadata all survive.
- Structure build (every type): in-progress builds, completed builds, upkeep state.
- Combat lock: if a combat resolves at T+5s and sim restarts at T+2s, the lock is restored with the same `resolvesAt`.
- Ability casts (siphon, aether bridge/wall, reveal): active effect with expiry timestamp survives.
- Tech/domain choices: the player's tech set and root survive.
- Alliances, truces: state with request timestamps survives.

**Property assertion for every command type:**

After resolution, `world_events` contains exactly one terminal event for this `commandId`. If the command would have been rejected, a `CommandRejected` row exists. Neither acceptance nor resolution silently omits a durable record.

### 9.2 Bug 2 class — "acceptance and resolution disagree"

**Diagnostic:** The client saw `ATTACK_PREVIEW` report 100% win chance. The command was accepted. Resolution produced no ownership change, no manpower deduction, no loss record. This means either:

- Preview uses a different RNG/inputs than the resolution code.
- Resolution short-circuited on an unreported error.
- Acceptance stage reserved resources that the resolution stage silently unreserved.
- The rewrite emits an acceptance event but the actual state mutation runs on the legacy process.

**Test pattern 1 — preview/resolution consistency:**

```ts
describe("attack preview matches resolution", () => {
  it.each(PREVIEW_RESOLUTION_MATRIX)("p(win)=%f matches empirical win rate", async (pWin) => {
    const scenario = buildCombatScenario({ pWin });
    const preview = computeAttackPreview(scenario);
    const outcomes = Array.from({ length: 2000 }, () =>
      rollFrontierCombat(scenario, createSeededRng()).attackerWon
    );
    const empirical = outcomes.filter(Boolean).length / outcomes.length;
    expect(preview.pWin).toBeCloseTo(empirical, 2);
  });
});
```

**Test pattern 2 — acceptance → resolution contract:**

```ts
it("every COMMAND_ACCEPTED must produce exactly one terminal event", async () => {
  const { sim } = await bootFreshSim();
  const events = await runScenario(sim, CANONICAL_MIXED_LOAD);
  const accepted = events.filter(e => e.eventType === "COMMAND_ACCEPTED");
  for (const a of accepted) {
    const terminals = events.filter(e =>
      e.commandId === a.commandId &&
      TERMINAL_EVENT_TYPES.has(e.eventType)
    );
    expect(terminals).toHaveLength(1);
  }
});
```

**Test pattern 3 — state-change invariant:**

```ts
it("accepted command changes at least one documented field", async () => {
  for (const cmdType of ALL_MUTATING_COMMAND_TYPES) {
    const { sim } = await bootFreshSim();
    const setup = await applyPreconditions(sim, cmdType);
    const before = await captureWorldState(sim, setup.playerId);
    const result = await submitAndResolve(sim, buildCommand(cmdType, setup));
    if (result.accepted) {
      const after = await captureWorldState(sim, setup.playerId);
      const diff = diffState(before, after);
      expect(diff.changedFields.length).toBeGreaterThan(0);
    }
  }
});
```

**Test pattern 4 — attack at deterministic 100% win must capture:**

```ts
it("100% win chance always captures and charges manpower", async () => {
  const scenario = buildCombatScenario({ pWin: 1 });
  for (let i = 0; i < 50; i++) {
    const { sim } = await bootFreshSim({ seed: i });
    await applyCombatPreconditions(sim, scenario);
    const before = await captureWorldState(sim, scenario.attackerId);
    const result = await submitAndResolve(sim, buildAttackCommand(scenario));
    expect(result.accepted).toBe(true);
    expect(result.attackerWon).toBe(true);
    const after = await captureWorldState(sim, scenario.attackerId);
    expect(after.tiles[scenario.targetKey].ownerId).toBe(scenario.attackerId);
    expect(after.player.manpower).toBeLessThan(before.player.manpower);
  }
});
```

**Test pattern 5 — no cross-path divergence:**

```ts
it("preview and resolve call the same combat module", () => {
  const previewImpl = requireFn("computeAttackPreview").__combatModule;
  const resolveImpl = requireFn("rollFrontierCombat").__combatModule;
  expect(previewImpl).toBe(resolveImpl);
});
```

(Tag both functions with a shared `__combatModule` symbol so this assertion is mechanical.)

### 9.3 Parity harness — legacy vs rewrite

**Purpose:** Detect any silent behavioral drift before a beta tester finds it.

**Design:**

- `scripts/parity-harness.mjs` boots both stacks against the same seed and the same scripted sequence of commands.
- After each command, both stacks export their `PlayerSubscriptionSnapshot`, `WorldStatusSnapshot`, and full tile projection as JSON.
- The harness diffs the two. Any difference is a test failure.
- The command sequence covers the feature-parity checklist in §8 and runs for 5 simulated minutes with AI off and then 2 minutes with AI on.

**Where it runs:**

- Locally via `pnpm parity`.
- In CI nightly.
- Automatic failure at any diff; no "known-difference" allowlist until a human explicitly approves one.

### 9.4 Reconnect harness

- `scripts/reconnect-harness.mjs` submits each command type, then drops the socket before any response, reconnects after 500ms, and asserts:
  - Exactly one server-side occurrence of the command.
  - Client does not double-send.
  - `COMMAND_QUEUED` arrives on the reconnected socket if the resolution had not yet emitted a terminal event.
  - A terminal event eventually arrives on the reconnected socket.

### 9.5 Coverage enforcement

- `packages/sim-protocol/src/command-coverage.test.ts`:
  - Read every value of the `DurableCommandTypeSchema` union.
  - Assert a matching parameterized test exists in §9.1, §9.2, §9.4.
  - If a new command type is added without these tests, CI fails. This is the "don't ship unverified commands" rail.

### 9.6 Load test (nightly)

`scripts/rewrite-load-harness.mjs`:

- 1 human client at max frontier click rate.
- 40 AI players on.
- Barbarians, system jobs, chunk subscriptions all on.
- Persistence on, DB-backed.
- 10 minutes.

Exports the plan's acceptance numbers (p50/p95/p99/max of accept latency, event-loop max, backlog age) and fails CI if any gate regresses.

---

## 10. Phase 5 — Observability and gates

**Status: Done — landed 2026-04-20 via `0c877c8`, `67d41d3`.**

What actually landed:

- `0c877c8` Phase 5 observability primary: `/metrics` endpoint on both gateway and simulation; structured metrics emitted every 1 s; `metrics.test.ts` and `metrics.integration.test.ts` (17-line integration smoke); Fly log-stream alert thresholds documented in `docs/rewrite-phase5-observability-runbook.md`; nightly load harness writes `docs/load-results/YYYY-MM-DD.json`.
- `67d41d3` Fix Phase 5 accept-latency lane scope and load-harness recording bug (per-lane `human_interactive` p95 was measuring the wrong lane; harness was writing malformed JSON on timeout).

### Deliverables

1. Gateway emits structured metrics every 1s:
   - `gateway_event_loop_max_ms`, `gateway_ws_sessions`, `gateway_command_submit_latency_ms` (p50/p95/p99), `gateway_sim_rpc_latency_ms`, `gateway_backend_connected`.
2. Simulation emits:
   - `sim_event_loop_max_ms`, `sim_command_accept_latency_ms` (per lane), `sim_human_interactive_backlog_ms`, `sim_ai_planner_breaches`, `sim_checkpoint_rss_mb`, `sim_event_store_write_ms`.
3. A `/metrics` Prometheus-style endpoint on both services, scrape-friendly.
4. Fly log-stream alerts on:
   - `gateway_event_loop_max_ms > 100` for 3 consecutive samples.
   - `sim_human_interactive_backlog_ms > 500`.
   - `sim_checkpoint_rss_mb > 400` (OOM pre-alarm).
5. Client debug badge surfaces the active backend and a live "accept latency p95" read from `world-status` events.

### Tests

- `apps/*/src/metrics.test.ts`: metrics increment correctly.
- `apps/realtime-gateway/src/metrics.integration.test.ts`: p95 computation matches a known input series.

### Acceptance

- A dashboard (or just `curl /metrics | sort`) shows every gate from §1 live.
- The nightly load harness writes its results to a file stored at `docs/load-results/YYYY-MM-DD.json`.

---

## 11. Phase 6 — Cutover

### Pre-flight

All of the following before scheduling a cutover date:

- Phases 0-5 complete and merged.
- Nightly load harness green for 3 consecutive nights (p95/p99/max gates from §1).
- Parity harness (§9.3) green against the 5-minute scenario.
- Staging has been running the rewrite stack for 7 consecutive days without an unresolved issue.
- Prod-side infrastructure stood up *but not yet receiving traffic*:
  - `border_empires_prod` database and `be_prod` role created on the existing `border-empires-postgres` cluster (same cluster, new DB — keeps cost flat).
  - Prod-role password rotated off any placeholder.
  - `fly postgres attach border-empires-postgres --app border-empires-gateway --database-name border_empires_prod --variable-name DATABASE_URL`, same for `border-empires-simulation`.
  - `fly.gateway.toml` and `fly.simulation.toml` updated to set `NODE_ENV=production`, point at `border-empires-simulation.flycast:50051`, and carry the snapshot/checkpoint tunables that match current legacy (`SIMULATION_SNAPSHOT_EVERY_EVENTS=5000`, `SIMULATION_CHECKPOINT_MAX_RSS_MB=260`).
  - `provision-fly-prod.command` script written (mirror of `provision-fly-staging.command`, with a password check that refuses to run with a placeholder) and executed.
  - Migrations applied against `border_empires_prod`: `0001_world_events` … `0007_visibility_projection`, plus `apps/realtime-gateway/sql/0001_command_store`.
  - Nightly `pg_dump` job running and verified; at least one restore dry-run into a scratch DB completed successfully.
- Cost check: `fly status` on all apps + `fly postgres status` confirms the provisioned resources match the table in §1. Staging apps have `auto_stop_machines = "on"` and are stopped.

### Cutover steps (day-of)

1. **T-24h**: freeze all non-cutover merges to `main`. Tag current prod legacy build as `legacy-v-cutover-<date>`. Announce the window to beta testers; ~2h of read-only recommended.
2. **T-2h**: take a legacy snapshot (via the existing snapshot machinery on `border-empires`). Import it into `border_empires_prod` via `scripts/rewrite-db-import-legacy-snapshot.ts`. Take an extra `pg_dump` to the backup bucket tagged `pre-cutover-<date>.sql.gz`.
3. **T-1h**: `fly deploy --config fly.simulation.toml` then `fly deploy --config fly.gateway.toml`. Wait for both to report healthy. Hit `/healthz` on both and confirm runtime provenance (source type, season id, world seed, snapshot label, fingerprint, player count, seeded tile count) matches the imported snapshot.
4. **T-15m**: run the load harness against the new prod stack for 5 minutes with synthetic load. Gates must be green before we redirect any real player.
5. **T-0**: flip beta testers to the gateway. Two mechanisms, use whichever is easier on the day:
   - Deploy a client build where the beta-tester email list gets `VITE_GATEWAY_WS_URL=wss://border-empires-gateway.fly.dev/ws` as the default and everyone else still gets legacy. (Preferred — self-serve.)
   - Ask each beta tester to set `document.cookie = "be-backend=gateway; path=/; max-age=86400"` once and refresh.
6. **T+30m**: read metrics. If green, deploy a client build that flips the global default `VITE_WS_URL` to the gateway. Legacy app keeps running but gets no new traffic.
7. **T+1d**: monitor the new stack. Keep legacy running idle.
8. **T+7d**: proceed to Phase 7.

### Data-loss risk during cutover

Forward-only import. Beta testers' legacy state is captured at T-2h and imported; any actions they take after T-2h on the legacy monolith are lost. We accept this by announcing the window. Because beta is a handful of testers, this is explicit — not a gamble.

### Rollback (given single-primary Postgres, no HA)

Two failure modes, two different rollback paths.

**Failure mode A — the new stack behaves badly but Postgres is fine** (e.g. a gameplay bug, a memory leak, a parity regression, a latency gate fails):

1. Deploy a client build that flips `VITE_WS_URL` back to `wss://border-empires.fly.dev/ws` (legacy). Or revert the cookie rollout.
2. Beta testers reload and are back on the legacy monolith with their pre-T-2h state. They lose whatever happened on the rewrite stack, which for the beta tester count is acceptable.
3. Legacy DB is untouched. New-stack DB can be wiped (`TRUNCATE world_snapshots CASCADE`, etc.) and re-seeded for a retry.

**Failure mode B — Postgres itself is down** (single-primary, no HA; this is the cost-budget trade-off):

1. The gateway and sim will fail health checks because `DATABASE_URL` unreachable. Client hits them and fails to connect.
2. Flip the client default `VITE_WS_URL` back to legacy (same as A).
3. While on legacy, investigate Postgres. Options in order: `fly postgres restart border-empires-postgres`, `fly volumes list` + attach a new volume from the nightly snapshot, or `pg_restore` from the bucket backup into a fresh cluster (costs ~15 min setup + ~$0 extra assuming the volume is reused).
4. Once Postgres is healthy, re-import the pre-cutover snapshot or the latest nightly, then re-attempt the cutover. The legacy monolith keeps serving throughout.

The worst-case downtime is whatever it takes the client deploy to propagate — minutes, not hours. Because beta is small, this is acceptable.

### Cost check at end of Phase 6

`fly status` + `fly postgres status` should show:

- 4 prod apps running (gateway, simulation, legacy `border-empires`, postgres)
- 2 staging apps *stopped* (gateway-staging, simulation-staging)
- Total invoice trending ≤ $9.50/month until Phase 7 deletes legacy

If the invoice is above the cap, Phase 6 is not done. Either the staging apps did not auto-stop, or a volume is larger than budgeted, or someone added an extra region. Fix before starting Phase 7.

---

## 12. Phase 7 — Delete legacy

Only after the new stack has run cleanly in prod for 7 days:

1. Delete `fly.server.toml`.
2. Delete `Dockerfile.server`.
3. Delete `packages/server/` entirely. Move any remaining shared logic into `packages/game-domain` or `packages/shared`.
4. Delete `dev:legacy` and all `scripts/server-*` scripts.
5. Rename `apps/realtime-gateway` to `apps/gateway` if the name has settled. Same for `apps/simulation`. Update all imports.
6. Run full test suite and parity harness one last time to confirm.

### Acceptance

- `git grep packages/server` in the root returns nothing.
- Fresh clone, `pnpm install && pnpm build && pnpm test` all green.
- Client prod still works.

---

## 13. Risk register

| Risk | Mitigation |
|---|---|
| ~~Rebase of `f69dfbf` onto main is painful~~ | Resolved in Phase 0 (`2596eed`). |
| Postgres is a single point of failure (`--initial-cluster-size 1`, no HA) | Forced by the $10/month cap. Accepted trade for beta. Mitigation: nightly `pg_dump` to a Fly Tigris / R2 bucket, 7 daily + 4 weekly retention, restore runbook at `docs/runbooks/postgres-restore.md` and at least one tested restore before Phase 6 pre-flight. Rollback path B in §11 describes the live-failure procedure. Revisit HA only if beta grows enough to justify an extra ~$2/month. |
| `DATABASE_URL` rotation leaks into source / test fixtures | `provision-fly-*.command` uses `fly postgres attach` which injects the URL as a secret; never written to a file in the repo. Staging placeholder `staging_changeme` must be rotated immediately after first `provision-fly-staging.command` run — add a CI guard that greps the repo for that string and fails if found. Same pattern for the prod script. |
| Staging apps run 24/7 and blow the $10/month cap | `fly.gateway.staging.toml` and `fly.simulation.staging.toml` must have `auto_stop_machines = "on"` and `min_machines_running = 0`. Phase 4 task: verify this configuration and that the apps actually sleep when idle. Add a monthly cost check to the runbook. |
| AI worker communication overhead eats the savings | Measured by the Phase 5 load test. If `postMessage` cost dominates, move AI to a sibling Fly process with gRPC — but that adds ~$1.94/month and would require dropping elsewhere to stay under cap. Current `PlannerWorldView` strip-heavy-blobs pattern should make worker threads sufficient. |
| Parity harness produces too many diffs to be useful | Start narrow (only `WorldStatusSnapshot` + player projection). Expand after those are green. No "known-difference" allowlist without an explicit human approval. |
| Beta testers on legacy hit a new legacy bug while we're mid-cutover | Legacy is frozen after Phase 0; no gameplay changes allowed until Phase 7 closes. Exception: a pure-revert bug fix with a post-mortem noting the breach. |
| New stack OOMs in prod | Fly alert at 400MB RSS (target budget 320MB per sim, 512MB machine). Checkpoint deferral and high-memory-skip writes already in `snapshot-checkpoint-manager.ts` and `postgres-snapshot-store.ts`. |
| Hidden inline AI/system work re-enters the main thread during later refactors | Runtime assertion: if `perf_hooks.monitorEventLoopDelay()` p99 exceeds 50ms for 5s, emit a `RuntimeAlert`. Add the assertion in Phase 5 together with the rest of observability. |
| Single-DB failure blocks both staging and prod simultaneously | Both logical DBs live on the same cluster. If Postgres dies, staging dies too, but staging has no beta traffic so this is acceptable. If ever we want staging isolation during a prod incident, the plan is to spin up a scratch `fly postgres create` on demand, run migrations, point staging at it — reverse when done. No permanent second cluster. |
| Fly volume snapshot retention is too short for our backup RTO | Do not rely on Fly's default snapshot retention. The `pg_dump` + external bucket is the authoritative backup. |
| `staging_changeme` password is checked into the repo | Already is, as the seed for the first provision. Phase 4 task: rotate it, remove the literal from the shell script, and replace with a prompt or a `fly secrets` read. |

---

## 14. Work tracking

Create one GitHub issue per phase, labeled `rewrite-p0` through `rewrite-p7`. Each issue has a checklist of the deliverables and tests above. No issue closes until its Acceptance criteria are green in CI, not on someone's laptop.

The plan is complete when all seven issues close and the load harness has posted 7 consecutive green nightly runs against prod.

---

## 15. Summary: what the next coding thread should start with

Phases 0-3 are done. The focus now is Phase 4 — feature parity and test coverage — and the specific pre-requisites that unblock Phase 6.

Work order:

1. **Build the §9 test harnesses first.** Until the parity harness (§9.3), reconnect harness (§9.4), coverage-enforcement test (§9.5), and load harness (§9.6) exist, every feature-parity claim is unverifiable. Write them before filling the feature checklist in §8.
2. **Expand `restart-parity.integration.test.ts` to cover every mutating command type.** This is what catches Bug 1 class. Today it exists for a handful of commands; parameterize it over `ALL_MUTATING_COMMAND_TYPES` per §9.1 and let CI discover which ones don't survive a restart. Fix each one it surfaces.
3. **Add the preview/resolution consistency and contract tests** from §9.2. These are what catch Bug 2 class. If test pattern 5 ("preview and resolve call the same combat module") fails, that is by itself the bug behind the 100%-win-chance incident.
4. **Audit the staging fly configs.** Confirm `auto_stop_machines = "on"` and `min_machines_running = 0` on both staging apps. Run `provision-fly-staging.command` end-to-end, confirm staging boots DB-only, and leave staging stopped. Rotate the `staging_changeme` role password and remove the literal from the script.
5. **Start on Phase 5 observability** as soon as Phase 4 coverage lands. The load gates in §1 can't be measured without `/metrics`.
6. **Do not make any gameplay-visible changes on the legacy monolith** until Phase 7. Bug fixes that only touch `packages/server` are allowed only if they also apply to `apps/simulation`.
7. **Every new test should be one of the patterns in §9.** If a new bug is found that isn't caught by an existing pattern, add a new pattern and backfill coverage — then fix the bug.
8. **Respect the $10/month cap.** Any provisioning PR must include the new monthly-cost line-item in its description. Phase 4 has no provisioning.
