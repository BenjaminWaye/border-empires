# Code cleanup: handover and remaining work

Status: active proposal
Owner: next maintainer picking up the dead-code / duplication cleanup (handover from the October 2026 cleanup pass)
Last verified: 2026-10-15
Replaces: none. Updates the progress of [`tile-overlay-generic-codec-plan.md`](tile-overlay-generic-codec-plan.md).

This document records what the October 2026 cleanup pass changed and why. It
also lists what is left, in priority order, so the next person can continue
without rediscovering the codebase.

## Summary of what shipped

Seven merged PRs, all behaviour-preserving, each green on the full CI matrix
(lint, `check:file-lines`, build, sharded client/simulation/worldgen tests)
before merge:

| PR | What | Why |
|---|---|---|
| #2356 | Deleted 8 orphaned modules, a committed `vite.config.ts.timestamp-*.mjs` build artifact, ~90 never-imported exports/types, ~400 unused imports/locals/private members, dead helpers, and the unused `zod` dependency of `apps/simulation` and `apps/realtime-gateway` (~1,900 lines). | Dead code was hiding which code is live. Several orphaned files were stale copies of helpers that now live elsewhere. |
| #2359 | Turned on `noUnusedLocals` in `tsconfig.base.json` (every package inherits it) and fixed the last offenders, including storybook. Added one clause to `AGENTS.md`. | Locks in #2356: unused imports, locals and private members now fail `pnpm lint` and the build instead of accumulating again. |
| #2370 | Removed fields from `*Deps` / `*Context` types (and their call sites) that no consumer reads. Biggest case: 17 stub fields in `ServerWorldgenTerrainDeps`. Removed stale `packages/server` references from `AGENTS.md` and docs (240 lines). | Every caller was building and passing values nothing used. The world-generation call sites built stubs "only to satisfy the shared deps type". |
| #2372 | One list of tile-overlay keys for the simulation. The persisted snapshot (`mapTile`), the login projection, the delta builders and the proto table derive from it. Also removed the never-used `fallbackTiles` paths of the player and world-status snapshot builders. | Hand-written copies of the overlay list had drifted into production bugs: natural wonders invisible (#1157, #1160/#1162), muster flags missing on reconnect, AFCs dropped from saves on every restart. |
| #2374 | Moved that table into `packages/sim-protocol` as `TILE_OVERLAY_WIRE_FIELDS` (`{ key, camel, snake }`). The simulation, the gateway's proto decoder and its clear-signalling, and sim-protocol's own event/snapshot types all derive from it. Tests check it against `simulation.proto`. | Closed the same drift risk on the gateway side of gRPC. |

This handover PR also corrects two comments from #2374. The table's doc
comment claimed the compiler would point at every place a new overlay needs.
It won't yet; see item 1.

## How the dead code was found (reproducible)

The analysis scripts were throwaway and are not committed. The method:

1. **knip** (`npx knip@5`) with a config that marks the real entry points:
   each app's `src/main.ts`, worker files (`src/**/*worker*.ts`, loaded by
   path so knip cannot see them), `main-merged.ts`, tests, benches, storybook
   stories and `.storybook/*`, and each package's `src/index.ts`. Treat
   knip's "unused export" as dead only when the symbol is also unused inside
   its own file.
2. **`tsc --noEmit --noUnusedLocals`** per package. This flag is now on
   permanently, so `pnpm lint` reports these directly.
3. **TypeScript language service, `findReferences`** on every property of
   `*Deps` / `*Context` / `*Dependencies` types, flagging properties with no
   read reference. Then remove each one from the type and let `tsc` list the
   call sites that still pass it.
4. Repeat 1–3 until nothing new appears, because removing dead code exposes
   more dead code.

Lessons that will save the next person time:

- **knip gives wrong answers inside a nested worktree** (for example
  `.codex-worktrees/x`). It flagged script exports that are in use. Run it in
  the primary checkout.
- **"Unread" deps fields are often read through a different type.** Many
  context objects are passed whole to helpers typed with another context. For
  example, lock resolution goes to encirclement, combat support to
  weapons-factory multipliers, and the runtime loop to overlay drawing. `tsc`
  catches these only when the receiving field is *required*. If it is
  *optional* the value silently becomes `undefined`, so grep every removed
  field name for `name?:` elsewhere before dropping it.
- **Unused imports are safe to delete.** No tsconfig sets
  `verbatimModuleSyntax` / `preserveValueImports`, so tsc and esbuild were
  already eliding them.
- **Keep side-effecting initialisers.** Drop the binding, not the call (for
  example `seedBarbarianTiles(...)` is still called).
- **Variables that are written but never read** need a look before
  deleting. The heightfield gridline variables turned out to be a removed
  cache, not a bug.

## Remaining work, in priority order

### 1. Finish the tile-overlay migration (bug risk: high; effort: small to medium)

These places still hand-list overlay fields and are not tied to
`TILE_OVERLAY_WIRE_FIELDS`, so adding a row does not flag them:

- **`apps/simulation/src/runtime-state-export.ts` (`toRuntimeExportTile`)
  leaves out `watchtowerJson` and `waystationJson`.** This gap already
  exists. `exportState()` feeds season rollover, world-status building and
  replay `finalState`. Check whether any consumer reads those two fields; if
  so this is a live bug and needs a regression test plus a changelog entry
  per `AGENTS.md`. Then loop over the table using the cached values
  (`cached[camel]`).
- `apps/simulation/src/event-recovery/event-recovery.ts`: one hand-written
  block per overlay in event replay. A missing row means the overlay
  vanishes on restart.
- Hand-written types: `SimulationTileWireDelta` (`runtime-types.ts`),
  `RuntimeState` (`snapshot-tile-cache.ts`, already missing watchtower,
  waystation and muster), and the proto tile types in
  `simulation-service/proto-serialization.ts`. Use `TileOverlayJsonFields` /
  `TileOverlayProtoField` from `@border-empires/sim-protocol`.
- **Client:** `client-gateway-sync/client-gateway-sync.ts` (parse) and the
  overlay-field gate in `client-network/client-network.ts`. A new overlay
  that is not added here never renders, even though the server sends it.
  This needs both the 2D and 3D renderers checked (see the renderer-parity
  rule in `AGENTS.md`).

When this is done, update the comment on `TILE_OVERLAY_WIRE_FIELDS` to say
the compiler covers everything, and mark
[`tile-overlay-generic-codec-plan.md`](tile-overlay-generic-codec-plan.md)
delivered (or archive it). The shared-table approach covers that proposal's
goal without its riskier proto map-field migration.

### 2. Small follow-ups from the #2374 review (effort: small)

- `simulation-service/proto-overlay-fields.ts`: `OVERLAY_FIELDS` is now an
  alias typed as `{ camel: string; snake: string }`, which throws away the
  literal types. Iterate `TILE_OVERLAY_WIRE_FIELDS` directly with
  `TileOverlayJsonFields`-typed parameters, and drop the
  `Record<string, unknown>` / `as string` casts in its helpers.
- Name clash: sim-protocol and `apps/simulation/src/tile-overlay-fields/`
  both export `TileOverlayKey` / `TileOverlayJsonField` with different
  meanings. An auto-import could silently pick the wider one. Rename the
  simulation's versions, for example `DomainOverlayKey`.
- `apps/simulation/src/tile-overlay-fields/tile-overlay-fields.test.ts`
  repeats the `simulation.proto` check that sim-protocol's own test now
  owns, via a `../../../../packages/...` path. Remove the duplicate.
- `jsonSafeTileDeltaBatch`'s clear-signal tests sit in
  `sim-client/sim-client-tile-normalize.test.ts`. Move them next to
  `gateway-bootstrap-helpers.test.ts` (the tests-beside-source rule).
- `overlayClearSignals` allocates one object per tile on a path that
  serialises tens of thousands of tiles (full-visibility and reveal-chunk
  snapshots). Write the `""` clears into the already-spread result instead.

### 3. Split oversized files (effort: large; do it incrementally)

25 source files exceed the 500-line limit. `check:file-lines` only stops
them growing. The largest:

| Lines | File |
|---:|---|
| 4,000 | `apps/simulation/src/runtime/runtime.ts` |
| 2,881 | `apps/simulation/src/simulation-service/simulation-service.ts` |
| 2,726 | `apps/realtime-gateway/src/gateway-app/gateway-app.ts` |
| 2,723 | `packages/client/src/client-network/client-network.ts` |
| 1,901 | `packages/client/src/client-tile-action-logic/client-tile-action-logic.ts` |
| 1,781 | `packages/client/src/client-action-flow.ts` |
| 1,708 | `packages/client/src/client-runtime-loop.ts` |
| 1,625 | `packages/client/src/client-map-3d/client-map-3d.ts` |

`runtime.ts` already delegates most logic to `*Impl` modules. Most of its
bulk is context-builder methods (`xContext(): RuntimeXContext { return {...} }`)
and one-line private wrappers. A workable route:

1. Move each context builder into the module that owns that context, as a
   factory taking explicit deps.
2. Delete wrappers that only forward to an `*Impl`.

Do this one context per PR; merging `develop` often is essential, because
this file changes in most PRs. Re-run the deps-field scan
(method step 3) as you go, because several contexts still carry fields only
some consumers need.

### 4. Optional: reduce module surface (effort: mechanical; value: moderate)

knip reports about 375 exported values and 755 exported types that are only
used inside their own file. Dropping their `export` keyword makes each
module's real public surface clearer. It is a large, noisy diff with no
runtime effect, so it is only worth doing together with item 5. Otherwise it
grows back.

### 5. Optional: add knip to CI (effort: small)

Commit a `knip.json` with the entry points from method step 1, and run
`knip --include files,dependencies` as a CI step. Start with files and
dependencies only; exports are too noisy until item 4 is done. That would
have caught every orphaned file and unused dependency removed in #2356.

### 6. Loose ends noticed and left alone

- `packages/sim-protocol/src/index.js` is a hand-kept JS copy of part of
  `index.ts`, and it is committed. Three ops scripts
  (`scripts/rewrite-sim-stream-raw.mjs`, `rewrite-sim-subscribe-raw.mjs`,
  `rewrite-restart-fidelity-check.mjs`) import it for
  `SIMULATION_PROTO_PATH`. Point them at the `.proto` file directly and
  delete the shim.
- `apps/simulation/src/simulation-service/season-participation-rollover.integration.test.ts`
  takes 53–82 s for one case against a 120 s limit. It timed out once in a
  full local `pnpm test` run (CPU contention), and it has the same timing on
  `develop`. Speed it up or raise its timeout before it starts flaking in CI.
- About 90 `client-changelog-data-earlier-N.ts` files are intentionally
  unreferenced (an archive, by convention in `client-changelog-data.ts`).
  They show up as unused files in knip; exclude them in the config rather
  than deleting them.
- `pnpm ci:local`'s `check:client-changelog` step fails on any
  `packages/client` or `packages/shared` source change, refactors included.
  It isn't in GitHub CI. None of the PRs above added a changelog entry,
  because none was user-visible.

## Acceptance criteria

- Item 1: adding a row to `TILE_OVERLAY_WIRE_FIELDS` (plus the proto field
  and the stringify-cache slot) is the only hand edit needed for a new
  overlay to be saved, recovered, exported, sent and rendered. A test shows
  a 12th dummy row would fail to compile or fail a test anywhere it is not
  handled.
- Item 3: `runtime.ts` is under 1,000 lines, with no behaviour change, and
  the full simulation suite is green after each step.
- Items 4 and 5: knip runs in CI and is green.

## Verification

Each item needs `pnpm build`, `pnpm lint`, `pnpm check:file-lines` and the
affected package tests locally, then green CI. Item 1's
`runtime-state-export.ts` change needs a regression test that fails before
the fix. When item 1 ships, update or archive
[`tile-overlay-generic-codec-plan.md`](tile-overlay-generic-codec-plan.md)
and update this document's status.
