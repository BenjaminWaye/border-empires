# Code cleanup: handover and remaining work

Status: active proposal
Owner: next maintainer picking up the dead-code / duplication cleanup (handover from the October 2026 cleanup pass)
Last verified: 2026-10-15
Replaces: none. Supersedes the remaining scope of [`tile-overlay-generic-codec-plan.md`](tile-overlay-generic-codec-plan.md).

This document records what the October 2026 cleanup pass changed and why. It
also lists what is left, in priority order, so the next person can continue
without rediscovering the codebase.

## Summary of what shipped

Six PRs, each green on the full CI matrix (lint, `check:file-lines`, build,
sharded client/simulation/worldgen tests) before merge. The first five are
behaviour-preserving; #2375 also fixes the two bugs listed under the table.

| PR | What | Why |
|---|---|---|
| #2356 | Deleted 8 orphaned modules, a committed `vite.config.ts.timestamp-*.mjs` build artifact, ~90 never-imported exports/types, ~400 unused imports/locals/private members, dead helpers, and the unused `zod` dependency of `apps/simulation` and `apps/realtime-gateway` (~1,900 lines). | Dead code was hiding which code is live. Several orphaned files were stale copies of helpers that now live elsewhere. |
| #2359 | Turned on `noUnusedLocals` in `tsconfig.base.json` (every package inherits it) and fixed the last offenders, including storybook. Added one clause to `AGENTS.md`. | Locks in #2356: unused imports, locals and private members now fail `pnpm lint` and the build instead of accumulating again. |
| #2370 | Removed fields from `*Deps` / `*Context` types (and their call sites) that no consumer reads. Biggest case: 17 stub fields in `ServerWorldgenTerrainDeps`. Removed stale `packages/server` references from `AGENTS.md` and docs (240 lines). | Every caller was building and passing values nothing used. The world-generation call sites built stubs "only to satisfy the shared deps type". |
| #2372 | One list of tile-overlay keys for the simulation. The persisted snapshot (`mapTile`), the login projection, the delta builders and the proto table derive from it. Also removed the never-used `fallbackTiles` paths of the player and world-status snapshot builders. | Hand-written copies of the overlay list had drifted into production bugs: natural wonders invisible (#1157, #1160/#1162), muster flags missing on reconnect, AFCs dropped from saves on every restart. |
| #2374 | Moved that table into `packages/sim-protocol` as `TILE_OVERLAY_WIRE_FIELDS` (`{ key, camel, snake }`). The simulation, the gateway's proto decoder and its clear-signalling, and sim-protocol's own event/snapshot types all derive from it. Tests check it against `simulation.proto`. | Closed the same drift risk on the gateway side of gRPC. |
| #2375 (this plan) | Finished the overlay migration (former items 1 and 2) and fixed two live bugs it turned up. Every remaining hand-written overlay list now derives from `TILE_OVERLAY_WIRE_FIELDS`: event recovery, the full-world export, `SimulationTileWireDelta`, `RuntimeExportState`, snapshot-cache types, the proto serializer types and helpers, and the client parser and routing gate. The client is tied to the table by a test, because it can't import `sim-protocol` at build time. Also fixed the #2374 review nits: typed helpers with no casts, renamed the clashing type names, removed a duplicate test, moved tests beside their source, removed a per-tile allocation. | Removes the last drift risk and fixes the bugs below. |

**Bugs found and fixed in #2375** (both have regression tests and a changelog entry):

- **Muster flags were lost on every server restart.** Startup recovery runs
  every snapshot tile through `cloneRecoveredTile` (`event-recovery.ts`).
  That function's hand-written overlay list had no `muster` line, so active
  muster flags disappeared on every deploy unless a later event touched the
  tile. Muster set by a replayed event was dropped too, at finalize.
- **Watchtowers and waystations were missing from the full-world export.**
  `toRuntimeExportTile` (`runtime-state-export.ts`) left them out of
  `exportState()` / `exportStateAsync()`. That export becomes the player
  snapshot for full-visibility logins (season ended, admin spectator), so
  those sites vanished from the map in that view.

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

Former items 1 (finish the tile-overlay migration) and 2 (#2374 review
follow-ups) shipped in #2375; see the summary above. To add an overlay now,
follow the checklist on `TILE_OVERLAY_WIRE_FIELDS`
(`packages/sim-protocol/src/tile-overlay-fields/tile-overlay-fields.ts`). The
compiler or a test fails at every step you skip. The simulation's
`tile-delta-stringify-cache.ts` is still hand-unrolled per field for
performance; its slot list is compile-checked against the table through
`OVERLAY_JSON_FIELDS`.

### 1. Split oversized files (effort: large; do it incrementally)

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

### 2. Optional: reduce module surface (effort: mechanical; value: moderate)

knip reports about 375 exported values and 755 exported types that are only
used inside their own file. Dropping their `export` keyword makes each
module's real public surface clearer. It is a large, noisy diff with no
runtime effect, so it is only worth doing together with item 3. Otherwise it
grows back.

### 3. Optional: add knip to CI (effort: small)

Commit a `knip.json` with the entry points from method step 1, and run
`knip --include files,dependencies` as a CI step. Start with files and
dependencies only; exports are too noisy until item 2 is done. That would
have caught every orphaned file and unused dependency removed in #2356.

### 4. Loose ends noticed and left alone

- `packages/sim-protocol/src/index.js` is a hand-kept JS copy of part of
  `index.ts`, and it is committed. Three ops scripts
  (`scripts/rewrite-sim-stream-raw.mjs`, `rewrite-sim-subscribe-raw.mjs`,
  `rewrite-restart-fidelity-check.mjs`) import it for
  `SIMULATION_PROTO_PATH`. Point them at the `.proto` file directly and
  delete the shim.
- Several simulation integration tests run close to their timeouts on
  `develop` itself and time out when a full local `pnpm test` competes for
  CPU. They pass in CI's sharded runs and when run alone, with the same
  timings on `develop`:
  - `simulation-service/season-participation-rollover.integration.test.ts`:
    53–82 s for one case, 120 s limit
  - `simulation-service/season-rollover-client-seq.integration.test.ts`:
    92–106 s, 120 s limit
  - `simulation-service/simulation-service.startup-ai-repair.test.ts`:
    57–60 s for one case, 60 s limit

  Speed them up, or raise their timeouts, before they start flaking in CI.
- About 90 `client-changelog-data-earlier-N.ts` files are intentionally
  unreferenced (an archive, by convention in `client-changelog-data.ts`).
  They show up as unused files in knip; exclude them in the config rather
  than deleting them.
- `pnpm ci:local`'s `check:client-changelog` step fails on any
  `packages/client` or `packages/shared` source change, refactors included.
  It isn't in GitHub CI. None of the PRs above added a changelog entry,
  because none was user-visible.

## Acceptance criteria

- Item 1: `runtime.ts` is under 1,000 lines, with no behaviour change, and
  the full simulation suite is green after each step.
- Items 2 and 3: knip runs in CI and is green.

## Verification

Each item needs `pnpm build`, `pnpm lint`, `pnpm check:file-lines` and the
affected package tests locally, then green CI. Update this document's status
when the remaining items ship or are dropped.
