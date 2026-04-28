# Rewrite Supabase Cutover Runbook

## Purpose

This is the execution document for running the split rewrite stack on Supabase Postgres while keeping storage safely bounded under the free-tier `500MB` cap.

Use this document for:

- finishing the remaining bounded-storage implementation work
- rehearsing staging cutover
- executing production cutover
- deciding whether the system is safe to merge or deploy

This document is intentionally repo-specific. Every phase below names the actual files, scripts, and tests in this checkout.

## Scope

This runbook covers the rewrite stack only:

- `border-empires-gateway`
- `border-empires-simulation`
- staging siblings of those apps

It does not cover the legacy monolith except as rollback target.

## Environment Model

- `prod`: Supabase project in account A
- `staging`: Supabase project in account B
- Fly is compute-only:
  - production gateway + simulation stay deployed
  - staging gateway + simulation are on-demand and may auto-stop

## Hard Invariants

The implementation is only considered complete when all of these are true:

1. `DATABASE_URL` is the only database connection contract used by rewrite runtime.
2. Operational storage is bounded:
   - exactly one active `world_snapshots` row in steady state
   - `world_events` contains only the post-snapshot tail
   - `*_projection_current` tables contain current state only
3. Restart recovery does not depend on full historical command/event retention.
4. Season-end replay survives operational compaction.
5. Crash during checkpoint/compaction always leaves at least one valid recoverable snapshot.
6. Migrations and seed/import scripts are idempotent and safe to rerun.

## Current Repo State

The following pieces are already present in `main` and should be treated as the starting point, not re-designed from scratch:

- schema and tooling
  - `apps/simulation/sql/0008_bounded_storage.sql`
  - `scripts/rewrite-db-migrate.mjs`
  - `scripts/rewrite-db-size.mjs`
  - `scripts/rewrite-db-import-legacy-snapshot.ts`
  - `scripts/rewrite-db-seed-snapshot.mjs`
  - `provision-fly-staging.command`
  - `provision-fly-prod.command`
- bounded snapshot write path
  - `apps/simulation/src/postgres-snapshot-store.ts`
  - `apps/simulation/src/postgres-projection-writer.ts`
  - `apps/simulation/src/snapshot-checkpoint-manager.ts`
- bounded recovery building blocks
  - `apps/simulation/src/postgres-command-store.ts`
  - `apps/simulation/src/startup-recovery.ts`
  - `apps/simulation/src/snapshot-store.ts`

The major remaining question is not whether bounded storage exists. It is whether the runtime, recovery, replay, and cutover behavior are complete and verified enough to trust.

## Repo Ownership Map

Use this file map when implementing or reviewing work.

### Simulation DB schema and migration scripts

- `apps/simulation/sql/0001_world_events.sql`
- `apps/simulation/sql/0002_command_store.sql`
- `apps/simulation/sql/0003_world_snapshots.sql`
- `apps/simulation/sql/0004_player_projection.sql`
- `apps/simulation/sql/0005_tile_projection.sql`
- `apps/simulation/sql/0006_combat_lock_projection.sql`
- `apps/simulation/sql/0007_visibility_projection.sql`
- `apps/simulation/sql/0008_bounded_storage.sql`
- `scripts/rewrite-db-migrate.mjs`
- `scripts/rewrite-db-size.mjs`
- `scripts/rewrite-db-import-legacy-snapshot.ts`
- `scripts/rewrite-db-seed-snapshot.mjs`

### Simulation write path and recovery

- `apps/simulation/src/postgres-snapshot-store.ts`
- `apps/simulation/src/postgres-projection-writer.ts`
- `apps/simulation/src/snapshot-checkpoint-manager.ts`
- `apps/simulation/src/snapshot-store.ts`
- `apps/simulation/src/startup-recovery.ts`
- `apps/simulation/src/postgres-command-store.ts`
- `apps/simulation/src/postgres-event-store.ts`
- `apps/simulation/src/simulation-service.ts`
- `apps/simulation/src/runtime.ts`
- `apps/simulation/src/main.ts`
- `apps/simulation/src/runtime-env.ts`

### Gateway runtime and compatibility

- `apps/realtime-gateway/src/runtime-env.ts`
- `apps/realtime-gateway/src/gateway-app.ts`
- `apps/realtime-gateway/src/reconnect-recovery.ts`
- `apps/realtime-gateway/src/postgres-command-store.ts`
- `apps/realtime-gateway/src/postgres-player-profile-store.ts`
- `apps/realtime-gateway/sql/0001_command_store.sql`
- `apps/realtime-gateway/sql/0002_player_profiles.sql`

### Replay and shared types

- `packages/shared/src/types.ts`
- `packages/game-domain/src/server-shared-types.ts`
- `packages/client/src/client-types.ts`
- `packages/client/src/client-map-facade.ts`
- `packages/client/src/client-minimap.ts`
- `packages/client/src/client-state.ts`
- `packages/client/src/client-changelog.ts`

## Storage Contract

### Operational tables

These are current-season operational tables:

- `commands`
- `command_results`
- `world_events`
- `world_snapshots`
- `checkpoint_metadata`
- `player_projection_current`
- `tile_projection_current`
- `combat_lock_projection_current`
- `visibility_projection_current`

### Archive tables

- `season_archive`

### Expected steady-state shape

- `world_snapshots`: 1 row
- `checkpoint_metadata`: 1 row for active season
- `world_events`: only events after `checkpoint_metadata.last_applied_event_id`
- current projection tables: bounded by current player/tile cardinality
- `commands` and `command_results`: current season only
- `season_archive`: latest 12 seasons only

## Delivery Order

Do not cut directly to deployment work. Land changes in the order below.

### Phase 0: Baseline and freeze

Purpose: establish a stable starting point before touching runtime behavior.

#### Work

- Freeze staging deploys unrelated to rewrite persistence.
- Record current staging and prod runtime config:
  - `fly.gateway.staging.toml`
  - `fly.simulation.staging.toml`
  - `fly.gateway.toml`
  - `fly.simulation.toml`
- Confirm scripts exist and are runnable:
  - `pnpm rewrite:db:migrate`
  - `pnpm rewrite:db:size`

#### Commands

```bash
pnpm install
test -f scripts/rewrite-db-migrate.mjs
test -f scripts/rewrite-db-size.mjs
DATABASE_URL="postgres://...sslmode=require" pnpm rewrite:db:size
```

#### Exit criteria

- repo installs cleanly
- migration runner exists
- DB size script exists
- staging/prod config files are identified and current

### Phase 1: Verify additive schema and tooling

Purpose: confirm the database contract is complete before changing runtime code.

#### Files

- `apps/simulation/sql/0008_bounded_storage.sql`
- `scripts/rewrite-db-migrate.mjs`
- `scripts/rewrite-db-import-legacy-snapshot.ts`
- `scripts/rewrite-db-seed-snapshot.mjs`
- `provision-fly-staging.command`
- `provision-fly-prod.command`

#### Required behavior

- migrations create:
  - `checkpoint_metadata`
  - `season_archive`
  - `player_projection_current`
  - `tile_projection_current`
  - `combat_lock_projection_current`
  - `visibility_projection_current`
- migration runner applies gateway + simulation SQL in fixed order
- DB size script returns threshold classification
- import/seed scripts can build one canonical snapshot plus metadata row

#### Commands

```bash
DATABASE_URL="postgres://...sslmode=require" pnpm rewrite:db:migrate
DATABASE_URL="postgres://...sslmode=require" pnpm rewrite:db:size
DATABASE_URL="postgres://...sslmode=require" npx tsx scripts/rewrite-db-import-legacy-snapshot.ts /absolute/path/to/snapshot
DATABASE_URL="postgres://...sslmode=require" node scripts/rewrite-db-seed-snapshot.mjs
```

#### Exit criteria

- migrations rerun cleanly
- importer seeds `world_snapshots`, projections, and `checkpoint_metadata`
- seed script produces a bounded baseline world
- staging provision script no longer references Fly Postgres

### Phase 2: Checkpoint write path and compaction invariants

Purpose: make the simulation authoritative on the bounded schema.

#### Files

- `apps/simulation/src/postgres-snapshot-store.ts`
- `apps/simulation/src/postgres-projection-writer.ts`
- `apps/simulation/src/snapshot-checkpoint-manager.ts`
- `apps/simulation/src/snapshot-store.ts`
- `apps/simulation/src/runtime.ts`

#### Required behavior

On each checkpoint, the simulation must:

1. load `lastAppliedEventId`
2. export snapshot sections
3. insert new `world_snapshots` row
4. refresh all `*_projection_current` tables
5. upsert `checkpoint_metadata`
6. delete stale snapshot rows
7. delete compacted `world_events`
8. commit transaction

#### Existing implementation to keep

- `PostgresSimulationSnapshotStore.saveSnapshot()` already:
  - inserts a snapshot
  - writes `*_projection_current`
  - updates `checkpoint_metadata`
  - deletes old snapshots
  - deletes compacted events
- `writeCurrentProjections()` already uses `TRUNCATE + INSERT`
- `buildSimulationSnapshotCommandEvents()` already keeps only non-terminal command chains

#### Required review checks

- projection refresh runs inside the same transaction as snapshot pointer update
- old snapshot is never deleted before new snapshot + metadata are durable
- pruning `world_events` is based on the new snapshot pointer
- `commandEvents` payload only contains recoverability-critical chains

#### Exit criteria

- one successful checkpoint leaves:
  - exactly one snapshot row
  - one metadata row
  - no compacted events at or below the checkpoint pointer
- projection tables match runtime export

### Phase 3: Startup recovery and recoverable command contract

Purpose: guarantee restart recovery does not depend on full historical retention.

#### Files

- `apps/simulation/src/startup-recovery.ts`
- `apps/simulation/src/postgres-command-store.ts`
- `apps/simulation/src/command-store.ts`
- `apps/simulation/src/postgres-event-store.ts`
- `apps/simulation/src/simulation-service.ts`

#### Required behavior

Startup must recover using:

1. `checkpoint_metadata.current_snapshot_id`
2. pointed snapshot in `world_snapshots`
3. `commandStore.loadRecoverableCommands()`
4. event tail strictly after `snapshot.lastAppliedEventId`

Fallback behavior:

- if metadata table is missing or empty, fall back to latest snapshot
- if no usable snapshot exists, recover from full event log or explicit bootstrap state

#### Existing implementation to keep

- `loadSimulationStartupRecovery()` already prefers:
  - `loadRecoverableCommands()`
  - latest usable snapshot
  - event replay after `lastAppliedEventId`
- `PostgresSimulationCommandStore.loadRecoverableCommands()` already limits to `QUEUED` + `ACCEPTED`
- `PostgresSimulationSnapshotStore.loadLatestSnapshot()` already prefers `checkpoint_metadata`

#### Remaining checks

- verify no boot path calls `loadAllCommands()` for authoritative recovery
- verify restart parity still holds after event pruning
- verify pending combat / settlement chains survive restart

#### Exit criteria

- cold restart reproduces the same exported world state
- unresolved commands survive restart
- fully resolved commands are not required for recovery

### Phase 4: Season archive and replay preservation

Purpose: preserve season-end replay after operational truncation.

#### Files

- `apps/simulation/sql/0008_bounded_storage.sql`
- `apps/simulation/src/runtime.ts`
- `apps/simulation/src/simulation-service.ts`
- `packages/shared/src/types.ts`
- `packages/client/src/client-map-facade.ts`
- `packages/client/src/client-state.ts`
- `packages/client/src/client-minimap.ts`

#### Required behavior

At season rollover:

1. build season summary payload
2. build `StrategicReplayEvent[]`
3. insert `season_archive` row
4. verify insert success
5. truncate/reset operational current-season tables
6. seed next-season baseline snapshot + metadata
7. delete archives older than latest 12 seasons

#### Important note

`season_archive` exists in schema, but replay persistence is not complete until runtime writes to it and replay reads use it as source after rollover. This is a real implementation gate, not a documentation checkbox.

#### Exit criteria

- archived replay still renders in client after operational tables are truncated
- season rollover reduces DB back near baseline
- retention limit of 12 seasons is enforced

### Phase 5: Staging Supabase cutover

Purpose: move rewrite staging onto Supabase and verify bounded runtime behavior before prod.

#### Files

- `provision-fly-staging.command`
- `fly.gateway.staging.toml`
- `fly.simulation.staging.toml`
- `apps/realtime-gateway/src/runtime-env.ts`
- `apps/simulation/src/runtime-env.ts`

#### Required staging secrets

- `DATABASE_URL` on `border-empires-gateway-staging`
- `DATABASE_URL` on `border-empires-simulation-staging`
- `SIMULATION_ADDRESS` on `border-empires-gateway-staging`

#### Commands

```bash
export STAGING_DATABASE_URL="postgres://...sslmode=require"
./provision-fly-staging.command
DATABASE_URL="$STAGING_DATABASE_URL" pnpm rewrite:db:migrate
DATABASE_URL="$STAGING_DATABASE_URL" pnpm rewrite:db:size
DATABASE_URL="$STAGING_DATABASE_URL" npx tsx scripts/rewrite-db-import-legacy-snapshot.ts /absolute/path/to/snapshot
fly deploy --config fly.simulation.staging.toml
fly deploy --config fly.gateway.staging.toml
```

If you want a synthetic seed instead of importing a real snapshot:

```bash
DATABASE_URL="$STAGING_DATABASE_URL" node scripts/rewrite-db-seed-snapshot.mjs
```

#### Staging rehearsal checklist

1. authenticate a human player
2. confirm initial map loads from DB-backed snapshot
3. submit frontier expansion
4. submit settlement
5. submit attack
6. restart simulation
7. reconnect client
8. verify no state loss
9. force one checkpoint
10. verify one-snapshot bounded state in DB
11. verify DB size remains below `300MB`

#### Exit criteria

- staging boots against Supabase without local snapshot fallback
- restart parity survives actual Fly restart
- no recovery dependence on stale event history
- DB size is within guardrail after repeated activity

### Phase 6: Production cutover

Purpose: switch production rewrite runtime onto Supabase with a live rollback path.

#### Files

- `provision-fly-prod.command`
- `fly.gateway.toml`
- `fly.simulation.toml`

#### Pre-flight

- logical backup exists
- `DATABASE_URL` secrets are available for both prod apps
- staging rehearsal passed on the current commit
- latest merged `main` is checked out in `/Users/benjaminwaye/Sites/border-empires-container/border-empires`

#### Commands

```bash
export SUPABASE_DB_URL="postgres://...sslmode=require"
./provision-fly-prod.command
fly secrets set DATABASE_URL="$SUPABASE_DB_URL" --app border-empires-gateway
fly secrets set DATABASE_URL="$SUPABASE_DB_URL" --app border-empires-simulation
fly deploy --config fly.simulation.toml -a border-empires-simulation
fly deploy --config fly.gateway.toml -a border-empires-gateway
DATABASE_URL="$SUPABASE_DB_URL" pnpm rewrite:db:size
```

#### Production smoke checks

1. gateway `/healthz`
2. simulation ping / internal readiness
3. login
4. command acceptance
5. checkpoint occurs
6. simulation restart
7. reconnect recovery
8. DB size check

#### Exit criteria

- production runtime serves commands and reconnects correctly
- bounded-storage invariants hold after first checkpoint
- rollback remains available for one release cycle

### Phase 7: Cleanup and deprecation

Purpose: remove obsolete historical assumptions only after stable cutover.

#### Cleanup candidates

- old projection-table readers that still assume snapshot-keyed history
- any lingering Fly Postgres setup text in docs or scripts
- any runtime code that still treats `loadAllCommands()` as normal recovery path

#### Do not do during cutover

- do not drop old historical tables in the same deploy as first production cutover
- do not remove fallback recovery until staging + prod restart parity are proven

## Validation Matrix

These are the required automated checks before merge or deploy when the corresponding area changes.

### Schema and migration

```bash
pnpm --filter @border-empires/simulation test -- src/migration-idempotent.test.ts
pnpm --filter @border-empires/simulation test -- src/postgres-snapshot-store.test.ts
pnpm --filter @border-empires/simulation test -- src/snapshot-projection.test.ts
```

### Recovery and checkpointing

```bash
pnpm --filter @border-empires/simulation test -- src/startup-recovery.test.ts
pnpm --filter @border-empires/simulation test -- src/restart-parity.integration.test.ts
pnpm --filter @border-empires/simulation test -- src/snapshot-checkpoint-manager.test.ts
pnpm --filter @border-empires/simulation test -- src/postgres-command-store.test.ts
```

### Gateway compatibility

```bash
pnpm --filter @border-empires/realtime-gateway test -- src/reconnect-recovery.test.ts
pnpm --filter @border-empires/realtime-gateway test -- src/rewrite-stack.integration.test.ts
pnpm --filter @border-empires/realtime-gateway test -- src/gateway-auth-timeout.integration.test.ts
```

### Client and user-visible behavior

If replay behavior or user-visible runtime behavior changes:

```bash
pnpm --filter @border-empires/client test
pnpm --filter @border-empires/client build
pnpm --filter @border-empires/client lint
pnpm check:client-changelog
```

## Database Checks

### Size guardrail

```bash
DATABASE_URL="postgres://...sslmode=require" pnpm rewrite:db:size
```

Interpretation:

- `ok`: below `300MB`
- `warn`: `>=300MB`
- `critical`: `>=400MB`
- `emergency`: `>=450MB`

### Steady-state boundedness queries

```sql
SELECT COUNT(*) FROM world_snapshots;
SELECT * FROM checkpoint_metadata;
SELECT COUNT(*) FROM world_events;
SELECT COUNT(*) FROM player_projection_current;
SELECT COUNT(*) FROM tile_projection_current;
SELECT COUNT(*) FROM season_archive;
```

Expected post-checkpoint shape:

- `world_snapshots = 1`
- `checkpoint_metadata = 1`
- `world_events` count reflects only event tail since latest snapshot

## Rollback

If cutover fails:

1. stop deploying further commits
2. roll Fly apps back to last known-good images
3. restore previous `DATABASE_URL` secrets if needed
4. restore logical backup if schema/data shape is incompatible
5. document exact failure before retrying

Rollback target is the previous known-good runtime, not an in-place hotfix on a broken cutover.

## Merge Gate

The migration is only ready to merge when all of the following are true:

- staging rehearsal passed on the exact merge commit
- restart parity passed after a real staging restart
- bounded snapshot + projection invariants are confirmed in DB
- season archive behavior is either implemented and tested or explicitly deferred with no user-facing dependency
- DB size monitor reports `ok` under realistic load
- docs and changelog are updated for any user-visible behavior change

## Short Version

If you need the minimal execution sequence, it is:

1. verify schema/tooling already present
2. finish or confirm checkpoint + recovery invariants in simulation
3. finish season archive persistence if replay must survive rollover
4. rehearse staging on Supabase
5. pass restart parity and DB boundedness checks
6. cut prod with rollback ready

If any of those steps is not demonstrably complete, the migration is not ready to deploy.
