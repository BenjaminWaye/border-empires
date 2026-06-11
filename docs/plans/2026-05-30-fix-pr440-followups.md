# Fix two PR #440 regressions — 2026-05-30

> Single-PR agent hand-off. Tight scope. Read all of it before coding.

## Context

PR #440 merged with two known issues that need a follow-up fix. Both
are in `packages/client/src/yield-derivation/yield-derivation.ts` and its call site in
`packages/client/src/client-gateway-sync/client-gateway-sync.ts`.

## Issue 1 — Income multiplier applied to enemy tiles

`applyGatewayTileUpdate` (client-gateway-sync.ts:~448) calls:
```ts
ensureTileYield(resolved, deps.state.mods?.income ?? 1.0);
```

`deps.state.mods.income` is **the viewer's** income mod. Applied
unconditionally to every tile, including enemy tiles. Enemy tile
yields display the viewer's tech-bonus value, not the owner's.

Reality: the client does not have other players' `mods.income`. Best
we can do is **only apply the multiplier when the tile is owned by
the viewer**.

### Fix

Change the call site in `client-gateway-sync.ts` to:
```ts
const ownIncomeMultiplier =
  resolved.ownerId && deps.state.me && resolved.ownerId === deps.state.me
    ? deps.state.mods?.income ?? 1.0
    : 1.0;
ensureTileYield(resolved, ownIncomeMultiplier);
```

Leave `ensureTileYield`'s signature (multiplier as 2nd arg) alone —
no need to change the function. Just don't pass the wrong value at
the call site.

**Verify:** test that clicking an enemy tile shows the same yield
HTML as the sim would compute for that tile (no viewer income mod).

## Issue 2 — `ADVANCED_*` converter constants diverge from sim

`yield-derivation.ts` defines three local consts:
```ts
const ADVANCED_FUR_SYNTHESIZER_SUPPLY_PER_DAY = 21.6;
const ADVANCED_IRONWORKS_IRON_PER_DAY = 21.6;
const ADVANCED_CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY = 14.4;
```

These are the **theoretically correct** advanced values, BUT the sim
(`apps/simulation/src/tile-yield-view/tile-yield-view.ts:converterDailyOutput`) has a
bug: it falls through `ADVANCED_*` cases to the **basic** constants
(18, 18, 12). So the sim displays/produces basic values for advanced
structures.

Until the sim is fixed (separate gameplay PR), the **client must
match the sim's current behavior** so display == production.

### Fix

In `yield-derivation.ts`:

1. Delete the three local `ADVANCED_*` consts.
2. In `converterDailyOutput`, fall through advanced → basic:
   ```ts
   case "FUR_SYNTHESIZER":
   case "ADVANCED_FUR_SYNTHESIZER":
     return { SUPPLY: FUR_SYNTHESIZER_SUPPLY_PER_DAY };
   case "IRONWORKS":
   case "ADVANCED_IRONWORKS":
     return { IRON: IRONWORKS_IRON_PER_DAY };
   case "CRYSTAL_SYNTHESIZER":
   case "ADVANCED_CRYSTAL_SYNTHESIZER":
     return { CRYSTAL: CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY };
   ```
3. Add an inline comment explaining the parity:
   ```ts
   // Sim's tile-yield-view.ts:converterDailyOutput currently returns
   // the basic value for ADVANCED_* too. Match that here so the
   // client display equals what the sim produces. If/when the sim is
   // fixed to honor ADVANCED_* constants, update this in lockstep.
   ```

### Follow-up issue to file separately (NOT part of this PR)

After this fix ships, file a sim issue:
**"Sim converterDailyOutput ignores ADVANCED_* constants"**
Decision needed:
- Fix the sim to use ADVANCED_* constants → economy buff for advanced
  converters (gameplay change, needs balance review).
- OR delete the unused ADVANCED_* constants from
  `packages/game-domain/src/server-game-constants/server-game-constants.ts`.

Either way, the client port in `yield-derivation.ts` updates in
lockstep with the sim.

## Scope discipline

- **Single PR**, both fixes together. They're both client-only,
  same file area.
- **Do not touch the sim.** Issue 2's sim fix is a separate PR with
  gameplay implications.
- **Do not refactor `ensureTileYield`'s signature.** The bug is at
  the call site, not in the helper.
- **No new files.** Just edit the two existing ones
  (`yield-derivation.ts`, `client-gateway-sync.ts`).

## Tests to add or update

`packages/client/src/yield-derivation/yield-derivation.test.ts` (or wherever the
existing tests for this file live — check first; if no test file
exists, create one with just these two cases):

1. **Enemy tile**: tile.ownerId !== state.me → derived yield uses
   incomeMultiplier=1, not state.mods.income.
2. **Advanced converter parity**: tile with
   economicStructure.type="ADVANCED_FUR_SYNTHESIZER",
   status="active" → strategicPerDay.SUPPLY === 18 (NOT 21.6).
3. (Should still pass) **Own tile with income mod**: tile.ownerId ===
   state.me, state.mods.income = 1.25 → yield includes the 1.25×
   multiplier on settlement-fallback gold + dock gold.

## Validation

```
pnpm --filter @border-empires/client typecheck
pnpm --filter @border-empires/client test
```

Then local smoke:
- Load a save with an enemy empire that has an advanced fur synthesizer.
- Click their tile. Confirm `SUPPLY 18.0/day` displays (not 21.6).
- Click your own tile (with income mod from tech). Confirm your yield
  reflects the mod.
- Click another player's tile while you have an income mod. Confirm
  the displayed yield does NOT include your mod.

## Client changelog

This PR touches `packages/client/src/`. **The pre-push hook will
block** unless `packages/client/src/client-changelog.ts` is bumped
with a new entry. Add an entry describing the fix.

## Self-review checklist

- [ ] Both fixes in one PR, no separate splits.
- [ ] No sim-side files modified.
- [ ] No new files created.
- [ ] Local ADVANCED_* consts deleted.
- [ ] Call site uses ownership-gated multiplier.
- [ ] Tests cover both fixes.
- [ ] Client changelog entry added.
- [ ] PR body cites this plan doc and PR #440 as parent.
