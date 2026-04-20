# Rewrite Supabase Cutover Runbook

## Purpose

This runbook defines how to run the split rewrite stack (`gateway` + `simulation`) on Supabase Postgres while keeping operational storage bounded for free-tier safety.

## Environments

- `prod`: Supabase project in account A
- `staging`: Supabase project in account B
- Fly remains compute-only for rewrite services:
  - `border-empires-gateway`
  - `border-empires-simulation`
  - staging siblings on-demand only

## Required Secrets

Set `DATABASE_URL` on both gateway and simulation apps in each environment.

- Must be a direct Postgres connection string.
- Must include TLS requirement (`sslmode=require`).

Example:

```bash
fly secrets set DATABASE_URL="postgres://...sslmode=require" --app border-empires-gateway
fly secrets set DATABASE_URL="postgres://...sslmode=require" --app border-empires-simulation
```

## Migration

Apply all rewrite migrations:

```bash
DATABASE_URL="postgres://...sslmode=require" pnpm rewrite:db:migrate
```

Optional target migration:

```bash
DATABASE_URL="postgres://...sslmode=require" REWRITE_MIGRATION_TARGET=0008_bounded_storage.sql pnpm rewrite:db:migrate
```

## Bounded Storage Invariants

- `world_snapshots`: one active row in steady state
- `world_events`: post-checkpoint tail only
- current-state projections in `*_current` tables
- checkpoint pointer in `checkpoint_metadata`
- seasonal replay in `season_archive`

## DB Size Guardrail

Query current database size:

```bash
DATABASE_URL="postgres://...sslmode=require" pnpm rewrite:db:size
```

Thresholds:

- warn: `>= 300MB`
- critical: `>= 400MB`
- emergency: `>= 450MB`

## Staging Rehearsal

1. Set staging `DATABASE_URL` secrets on staging gateway and simulation apps.
2. Run `pnpm rewrite:db:migrate` against staging DB.
3. Import seed/snapshot:
   - `scripts/rewrite-db-import-legacy-snapshot.ts` for real snapshot bootstrap
   - or `scripts/rewrite-db-seed-snapshot.mjs` for synthetic world bootstrap
4. Deploy simulation then gateway.
5. Validate:
   - command acceptance
   - restart parity
   - checkpoint compaction
   - replay archive visibility
   - DB size remains under guardrail

## Production Cutover

1. Take logical DB backup.
2. Set prod `DATABASE_URL` secrets on rewrite apps.
3. Run `pnpm rewrite:db:migrate`.
4. Import snapshot if needed.
5. Deploy simulation, then gateway.
6. Run smoke checks and `pnpm rewrite:db:size`.

## Rollback

If cutover fails:

1. Roll Fly apps back to previous known-good deploy images.
2. Restore previous `DATABASE_URL` secrets.
3. Restore logical backup when schema/data mismatch prevents safe restart.
4. Document failure and root cause before the next cutover attempt.
