# Fix: cannot expand onto an active Aether Bridge target

## Symptom
Player casts Aether Bridge, sees the cast animation/pylon, but tapping the bridged
(far, across-sea) tile does nothing — the EXPAND/ATTACK never lands.

## Root cause (two independent bugs, BOTH must be fixed)

The Aether Bridge stores a `from` (the player's settled coastal origin) and a `to`
(the far coastal landing tile). For the crossing to work, both the client and the
sim must treat `from → to` as a legal, non-adjacent crossing. Neither does today.

1. **Sim hardcodes the bridge crossing to false.**
   `apps/simulation/src/runtime.ts:3444` passes `isBridgeCrossing: false` into
   `validateFrontierCommand`. The validator at
   `packages/game-domain/src/index.ts:223` already supports `isBridgeCrossing`
   (`if (!input.isAdjacent && !input.isDockCrossing && !input.isBridgeCrossing) → NOT_ADJACENT`),
   but because the runtime always passes `false`, any EXPAND/ATTACK whose origin is
   not physically adjacent (or a dock crossing) to the target is rejected
   `NOT_ADJACENT`. Active bridges are stored in
   `this.activeAetherBridgesByPlayer` but never consulted during frontier validation.

2. **Client origin picker is unaware of bridges.**
   `packages/client/src/client-origin-selection.ts` `pickOriginForTarget`
   (line 160) only considers the 8 adjacent tiles and dock crossings
   (`pickDockOriginForTarget`). For a far bridge target it returns `undefined`, so:
   - the tile is treated as not "reachable" (used at
     `client-tile-action-logic.ts:935,2150,2168`), so the expand action/highlight
     may not even appear, and
   - in `client-queue-logic.ts:1037`, `from` is `undefined`, the queue logs
     `action-queue-drop-no-origin` and silently drops the command — so nothing is
     ever sent to the sim.

   The client already receives and stores active bridges:
   `state.activeAetherBridges: ActiveAetherBridgeView[]`
   (`client-state.ts:218`, populated in `client-network.ts:1332` and
   `client-network.ts:2513` on `AETHER_BRIDGE_UPDATE`). Shape (`client-types.ts:366`):
   `{ bridgeId, ownerId, from:{x,y}, to:{x,y}, startedAt, endsAt }`.

## Required behavior
While a bridge owned by the player is active (`endsAt > now`), expanding/attacking
the bridge's `to` tile from the bridge's `from` tile is legal even though they are
not adjacent. Applies to both EXPAND (neutral coastal landing) and ATTACK (enemy
coastal landing), mirroring how dock crossings work for both.

---

## Change 1 — Sim: compute `isBridgeCrossing` from active bridges
File: `apps/simulation/src/runtime.ts`

a. Add a helper near `isDockCrossingTarget` (around line 6008). It returns true
   when an active bridge for `playerId` connects `from`→`(toX,toY)`:

```ts
private isAetherBridgeCrossingTarget(
  playerId: string,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): boolean {
  for (const bridge of this.activeAetherBridgesForPlayer(playerId)) {
    if (
      bridge.from.x === fromX && bridge.from.y === fromY &&
      bridge.to.x === toX && bridge.to.y === toY
    ) {
      return true;
    }
  }
  return false;
}
```
   Note: `activeAetherBridgesForPlayer` (line 5706) already filters expired bridges
   and is the correct accessor (do NOT read the raw map).

b. Replace the hardcoded value at `runtime.ts:3444`:
```ts
//  isBridgeCrossing: false,
    isBridgeCrossing: this.isAetherBridgeCrossingTarget(actor.id, from.x, from.y, to.x, to.y),
```
   (`actor` and `from`/`to` are all in scope at this point — see lines 3351, 3379, 3366.)

c. (Robustness, recommended) Bridge origin recovery, mirroring the dock path at
   `runtime.ts:3379-3384`. If the client sends a stale/non-owned origin, fall back
   to the bridge origin so the crossing still resolves. Add a helper paralleling
   `findOwnedDockOriginForCrossing` (line 6013):
```ts
private findOwnedAetherBridgeOriginForCrossing(
  playerId: string, toX: number, toY: number
): DomainTileState | undefined {
  for (const bridge of this.activeAetherBridgesForPlayer(playerId)) {
    if (bridge.to.x !== toX || bridge.to.y !== toY) continue;
    const origin = this.tiles.get(simulationTileKey(bridge.from.x, bridge.from.y));
    if (origin?.ownerId === playerId) return origin;
  }
  return undefined;
}
```
   and add it to the `from` recovery chain at line 3382-3384:
```ts
      this.adjacentTileStates(...).find(...) ??
      this.findOwnedDockOriginForCrossing(actor.id, to.x, to.y) ??
      this.findOwnedAetherBridgeOriginForCrossing(actor.id, to.x, to.y) ??
      submittedFrom;
```

d. **Decision to confirm with a human, do NOT guess:** the dock branch sets
   `targetShielded: isDockCrossing ? false : ...` at `runtime.ts:3445`, i.e. dock
   crossings ignore Aether Walls. Leave bridge crossings subject to walls (do not
   add bridge to that ternary) unless told otherwise. Flag this in the PR
   description rather than silently changing wall interaction.

## Change 2 — Client: make bridge targets reachable + pick the bridge origin
File: `packages/client/src/client-origin-selection.ts`

In `pickOriginForTarget` (line 160), after the adjacent + dock checks fail, fall
back to an active-bridge origin. Add before the final `return pickDockOriginForTarget(...)`
(line 180) or chain after it:

```ts
    const dockOrigin = pickDockOriginForTarget(tx, ty, allowAdjacentToDock, allowOptimisticExpandOrigin);
    if (dockOrigin) return dockOrigin;
    return pickAetherBridgeOriginForTarget(tx, ty, allowOptimisticExpandOrigin);
```

Add the helper alongside `pickDockOriginForTarget` (line 134):
```ts
  const pickAetherBridgeOriginForTarget = (
    tx: number,
    ty: number,
    allowOptimisticExpandOrigin = true
  ): Tile | undefined => {
    const now = Date.now();
    const candidates: Tile[] = [];
    for (const bridge of state.activeAetherBridges) {
      if (bridge.ownerId !== state.me || bridge.endsAt <= now) continue;
      if (bridge.to.x !== tx || bridge.to.y !== ty) continue;
      const origin = state.tiles.get(keyFor(bridge.from.x, bridge.from.y));
      if (!origin || origin.ownerId !== state.me || origin.fogged) continue;
      if (!allowOptimisticExpandOrigin && origin.optimisticPending === "expand") continue;
      candidates.push(origin);
    }
    return pickBestOrigin(candidates);
  };
```
This single change makes the tile count as `reachable`
(`client-tile-action-logic.ts:935,2150,2168`) AND gives `client-queue-logic.ts:1037`
a valid `from`, so the EXPAND/ATTACK is actually dispatched.

Note: `state` and `keyFor` are already in scope in this module (`deps`, lines 14-15);
`pickBestOrigin` is defined at line 42.

---

## Mandatory project chores (do not skip)
- **Client changelog hook**: any push touching `packages/client/src/` is BLOCKED
  unless `packages/client/src/client-changelog.ts` is bumped with a new entry.
  Add an entry describing "Aether Bridge: can now expand/attack onto the bridged
  tile."
- **Work in a git worktree**, not the primary checkout (primary must stay on
  `main`). Commit early.
- **500-line file max**: `runtime.ts` is already huge — only ADD the small helpers
  described; do not refactor. If a touched file would cross 500 lines, stop and ask.
- Verify a clean Docker `tsc` build (stricter than local:
  `noUncheckedIndexedAccess` etc.).

## Tests to add / update
1. Sim unit test (near existing aether tests, e.g. a `runtime` frontier test):
   - Cast a bridge (or seed `activeAetherBridgesByPlayer`), then submit an EXPAND
     `from = bridge.from`, `to = bridge.to` (non-adjacent, neutral coastal). Assert
     `COMMAND_ACCEPTED` (was `COMMAND_REJECTED / NOT_ADJACENT`).
   - Same with an enemy-owned landing → ATTACK accepted.
   - Negative: after `endsAt` (advance clock past `AETHER_BRIDGE_DURATION_MS`), the
     same EXPAND is rejected `NOT_ADJACENT`.
   - Negative: a target that is NOT a bridge endpoint is still `NOT_ADJACENT`.
2. Game-domain validator already covered (it honors `isBridgeCrossing`); add a case
   asserting `isBridgeCrossing: true` alone yields `ok: true` if not already present.
3. Client: extend an origin-selection test so `pickOriginForTarget(to.x, to.y)`
   returns the bridge origin when `state.activeAetherBridges` contains a matching,
   unexpired, owned bridge — and `undefined` once expired.

## Manual verification (use the `/verify` or `/run` workflow, preview tools)
1. Start a game with `navigation` tech + a ready observatory + ≥30 CRYSTAL and a
   settled coastal tile within `AETHER_BRIDGE_MAX_SEA_TILES` of a neutral coastal
   tile across water.
2. Cast Aether Bridge on the far coastal tile — pylon/animation appears.
3. Tap the far tile → expand. EXPECT: it is now claimable and the claim resolves;
   previously it did nothing.
4. Confirm no `action-queue-drop-no-origin` / `NOT_ADJACENT` in logs for that action.

## Files touched (summary)
- `apps/simulation/src/runtime.ts` — compute `isBridgeCrossing`, add 1-2 helpers.
- `packages/client/src/client-origin-selection.ts` — bridge-aware origin pick.
- `packages/client/src/client-changelog.ts` — required changelog bump.
- tests in sim + client + (optionally) game-domain.
- No protocol/type changes needed — `isBridgeCrossing` and `activeAetherBridges`
  already exist end-to-end.
