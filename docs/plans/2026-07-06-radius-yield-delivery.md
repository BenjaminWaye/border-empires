# Radius-Yield Delivery, Latent Yield Bugs, and Harbor Exchange

**Branch:** `agent/radius-yield-delivery` — worktree under `.codex-worktrees/`, run `pnpm install` after creating it.
**Stack:** rewrite only (`apps/simulation`, `packages/game-domain`, `packages/shared`, `packages/client`). Never touch `packages/server`.

## Root cause
Radius/neighbor yield bonuses are computed server-side but never reach the client, and no trigger re-emits affected neighbor tiles:
- `buildTileYieldView` computes the Waterworks→Farmstead boost (`tile-yield-view.ts:146-167`) but tile deltas/bootstrap omit `yieldRate`, so the client derives the un-boosted value in `yield-derivation.ts` (108 instead of 162).
- No handler re-emits neighbor tiles when a radius source toggles; accrual emits only `TILE_YIELD_ANCHOR_BATCH`, never `TILE_DELTA_BATCH` (`runtime-economy-accrual.ts:252-254`) — so there is no self-healing.

## Locked design decisions
1. **Deliver via existing `yieldRate`/`yieldCap` wire fields**, emitted **only** for tiles where the client can't derive yield: tiles with an active strategic-affecting economic structure (FARMSTEAD, MINE, CAMP, IRONWORKS, FUR_SYNTHESIZER, CRYSTAL_SYNTHESIZER + ADVANCED variants) **or** a `dockId`. Not all settled tiles — preserves the bootstrap-payload-shrink saving (`docs/plans/2026-05-30-bootstrap-payload-shrink.md`) for the ~99% structure-less tiles.
2. **Do not embed the value in `economicStructureJson`** — it's ref-memoized in `TileDeltaStringifyCache` (`tile-delta-stringify-cache.ts:115`) by the structure object, which doesn't change when a *neighbor* source changes → stale. `yieldRate` is not ref-memoized.
3. **Neighbor re-emission via a single central hook in `replaceTileState`** (the mandated mutation choke point), not per-handler edits — auto-covers build/remove/settle/capture/aether-purge/bombard/worldbreaker and future abilities.

## Current branch state to reconcile
Uncommitted changes on this checkout already added `waterworksKeys` threading (**keep**) plus **unconditional** `yieldRate`/`yieldCap` emission in `tileDeltaFromState` + `buildSnapshotTileYieldFields` (**revert to scoped** per decision 1). Also a changelog bump and a `runtime.ts:2563` type-annotation fix (**keep both**).

## Phase 1 — Radius/topology context
- Keep `waterworksKeys` threading in `runtime.ts` `tileDeltaFromState` + `collectTileYield` and the three `live-snapshot-view.ts` paths.
- In `tileYieldEconomyContextForPlayer` (`runtime.ts:2669-2693`) add parallel `foundryKeys` (active FOUNDRY tiles) and the data needed for dock income (dock link map + a per-dock "supported by active owned CUSTOMS_HOUSE" flag). Cache per-player.

## Phase 2 — Scoped emission (replace the unconditional spreads)
- Add predicate `tileYieldNeedsServerAuthority(tile)` = active strategic-affecting economicStructure **or** has `dockId`.
- In `tileDeltaFromState` (`runtime.ts`) and `buildSnapshotTileYieldFields` (`live-snapshot-view.ts:84-89`): emit `yieldRate`/`yieldCap` **only when the predicate is true**.

## Phase 3 — Central neighbor re-emission (`replaceTileState`)
Detect, by comparing old vs new tile, any change to a **projection source's** active/settled/owned status, and enqueue the affected beneficiary tiles into a per-command `pendingYieldRefresh` set; flush as a `TILE_DELTA_BATCH` at the command/tick emit boundary. Sources → beneficiaries:
- **WATERWORKS** (active, settled, owned) → owner's FARMSTEAD tiles within `WATERWORKS_RADIUS` (10).
- **FOUNDRY** (active, settled, owned) → owner's MINE tiles within `FOUNDRY_RADIUS` (5).
- **CUSTOMS_HOUSE / Harbor Exchange** (active, settled, owned) → adjacent owned dock tile(s) it supports.
- **DOCK tile** settled/owned status change → its connected owned dock tiles (dock-chain + customs both depend on connected-dock count).
Enqueue beneficiaries for **both** the new owner and, on ownership change, the previous owner. Re-emission calls `tileDeltaFromState` (no mutation → no loop). Model the flush on `applyBreachToNeighbors` (`runtime-lock-resolution.ts:180-188`); reuse Chebyshev helpers (`territory-automation.ts:9,52`). Note: encirclement needs nothing (cut-off only touches FRONTIER tiles, which weren't projecting — verified `runtime-encirclement-application.ts:146`).

## Phase 4 — Client
- `yieldRate`/`yieldCap` delta merge already exists (`client-gateway-sync.ts:428-435`) — leave.
- Add: when a delta changes `economicStructureJson`, `resource`, or `dockId`, clear cached `yieldRate`/`yieldCap` before `ensureTileYield` so a removed structure/dock re-derives instead of stranding a stale server value.
- Fix local fallbacks in `yield-derivation.ts` to match Phase 5 server values (ADVANCED synth values, MINE/CAMP ×1.5). Waterworks/Foundry/dock stay server-authoritative (client keeps its dock proxy only as a last-resort fallback).

## Phase 5 — Fix latent yield bugs + implement missing structures (balance change — approved)
In `tile-yield-view.ts` (cross-check parity with `legacy-snapshot-economy.ts:199-256`):
- **MINE/CAMP ×1.5** base resource (`STRUCTURE_OUTPUT_MULT`, `server-game-constants.ts:136`).
- **FOUNDRY ×2** nearby MINE iron/crystal (`FOUNDRY_RADIUS`=5, `FOUNDRY_OUTPUT_MULT`=2), mirroring the waterworks block via `foundryKeys`.
- **ADVANCED_*** synths use advanced constants (`server-game-constants.ts:117-122`) not basic.
In the dock income path (`economy-network.ts` `dockBaseGoldPerMinuteForPlayer`):
- **Harbor Exchange (CUSTOMS_HOUSE):** when a dock is supported by an adjacent owned active CUSTOMS_HOUSE, **add +1 gold/min per connected owned dock** (`connectedOwnedDockCount`). This is currently all-cost/no-benefit — upkeep is charged (`CUSTOMS_HOUSE_GOLD_UPKEEP=15`) but no income exists in the rewrite. Reuse the legacy adjacency notion (`supportedStructureAtDock`, `legacy-snapshot-economy.ts:529`) but with the additive `+1 × connectedOwnedDockCount` formula, not the legacy ×1.5.
Mirror the LOCAL fixes (MINE/CAMP, ADVANCED) in client `yield-derivation.ts`; Foundry/Harbor-Exchange stay server-only.

## Phase 6 — Tests (regression-first: fail before, pass after; live beside their module)
- **Q1 case (explicit):** building a FARMSTEAD on a FARM that is already within range of an active WATERWORKS emits `yieldRate` FOOD = 162 on the farmstead's own build-completion delta (no neighbor scan).
- Waterworks build/remove/settle/unsettle/capture/aether-purge/bombard/worldbreaker re-emits the owner's neighbor farmsteads with corrected yield.
- Foundry×2 + neighbor re-emission; MINE/CAMP ×1.5; ADVANCED synth values.
- Harbor Exchange: supported dock income = base + (1 × connectedOwnedDockCount); re-emits adjacent dock when the Harbor Exchange or a connected dock toggles.
- Predicate scoping: bare resource / empty settled tiles carry **no** `yieldRate`; dock and strategic-structure tiles do.
- Client: server `yieldRate` overrides derivation; structure/resource/dock change clears stale value; corrected local fallbacks.

## Phase 7 — Changelog (last file touched)
Update `packages/client/src/client-changelog/client-changelog.ts` (bump `version`, keep structure, prune to ~6-day window, stay ≤500 lines). Cover: waterworks food, foundry/mine iron-crystal, advanced structures, and Harbor Exchange income now working.

## Constraints
- `runtime.ts` (~4.6k lines) is over the 500 cap and **must not grow** (`pnpm check:file-lines`). Put new logic in new files (e.g. `radius-yield-refresh.ts`, a dock-income helper); combine spreads to stay net-neutral.
- Strict TS: explicit types on new context fields/helpers; no `any`/`Record<string,any>`.
- Run `pnpm lint`, targeted `pnpm --filter` tests, and `pnpm check:file-lines` before finishing.
- Pre-existing unrelated failures (do not chase, do not add to): `automation-command-planner*`, `spawn-placement`, one flaky `simulation-service.startup` timeout.

## Acceptance criteria
1. Building a waterworks next to an existing settled farm+farmstead updates that farm to 162/day on the client with no manual poke; destroying/capturing/purging/bombarding it reverts to 108/day.
2. Adding a farmstead to a farm already in waterworks range shows 162 immediately (Q1).
3. Foundry/mine/camp/advanced strategic yields match legacy; client fallback matches server for local bonuses.
4. Harbor Exchange grants +1 gold/min per connected owned dock (was zero benefit); updates when the exchange or a connected dock changes.
5. Bootstrap shows correct boosted values but carries **no** `yieldRate` for structure-less/dock-less tiles.
6. New regression tests pass; `pnpm lint` and `pnpm check:file-lines` pass; changelog bumped.

## Out of scope (follow-ups)
- "Lockworks Port" upgrade tier (`client-tile-menu-view.ts:98`) — not implemented; separate.
- Reconciling the contradictory client copy for Harbor Exchange (tile-menu ×1.5 vs map "+1/dock") — align all client text to the chosen +1/connected-dock formula as part of Phase 4/7.
