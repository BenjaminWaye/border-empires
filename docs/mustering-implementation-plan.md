# Mustering System — Implementation Plan (step-by-step)

> **Audience:** an implementing agent who has NOT been part of the design
> discussion. Follow the phases **in order**. Do **not** skip ahead. After every
> phase, run the **Verify** block and do not continue until it passes.
>
> **Companion docs:** `docs/mustering-feature-story.md` (the design, in plain
> language) and `docs/defense-consolidation-exploration.md` (a SEPARATE future
> exploration — **out of scope here**, do not implement it).
>
> **What this plan delivers:** attacks are no longer an instant spend from a
> global manpower pool. Manpower must be **mustered onto a tile over time**
> (drawn from your pool, rate-limited by a logistics throughput, accelerated by
> outposts). Forts become **garrison containers** that fill over time and are
> worn down by attacks. Outposts stop auto-fighting and become muster depots.
> Barbarians are cheap fast raids.

---

## Golden rules (read first, obey always)

1. **Everything ships behind a feature flag** (`MUSTER_SYSTEM_ENABLED`, Phase 0).
   When the flag is OFF, the game must behave EXACTLY as it does today. Every
   phase must preserve this.
2. **Run `pnpm test` after every phase.** If a previously-passing test breaks and
   the flag is OFF, you did something wrong — fix it before continuing.
3. **All authoritative tile changes go through `SimulationRuntime.replaceTileState()`**
   (`apps/simulation/src/runtime/runtime.ts`, search for `replaceTileState(`). Never
   mutate a tile object in the canonical map directly.
4. **Line numbers in this doc may have drifted.** Always locate code by the quoted
   symbol/string via grep, not by line number alone.
5. **Do not optimize prematurely, but respect the AI CPU guardrails** in
   `AGENTS.md` and `docs/game-mechanics.md` §13. Per-tick work must be bounded.
6. **Commit after each phase** with a message like `muster: phase N - <summary>`.
7. If a step is ambiguous or a file looks nothing like described, **STOP and ask**
   rather than guessing.

---

## Key facts about the current code (so you don't get lost)

- **Manpower today** is a single per-player number: `DomainPlayer.manpower`
  (`packages/game-domain/src/index.ts`), cap & regen derived from the player's
  towns. Regen: `SimulationRuntime.playerManpowerRegenPerMinute()`
  (`apps/simulation/src/runtime/runtime.ts`, ~line 1175). Constants in
  `packages/shared/src/config.ts`: `MANPOWER_BASE_CAP`, `TOWN_MANPOWER_BY_TIER`,
  `ATTACK_MANPOWER_COST = 60`, `ATTACK_MANPOWER_MIN = 60`.
- **Attack validation** is `validateFrontierCommand()` in
  `packages/game-domain/src/index.ts`. It currently checks
  `actor.manpower < manpowerMin`. This is the gate we change in Phase 5.
- **Attack execution** is `SimulationRuntime.handleFrontierCommand(command, actionType)`
  (`apps/simulation/src/runtime/runtime.ts`, ~line 2828). It deducts manpower today.
- **Combat math** is `buildFrontierCombatPreview()` /
  `defenseMultiplierForTile()` in `packages/shared/src/frontier-combat/frontier-combat.ts`.
- **The existing outpost auto-attack ("sweep")** is `tickSweepStructure()`
  (`apps/simulation/src/runtime-sweep-structure-tick/runtime-sweep-structure-tick.ts`), called from
  `tickTerritoryAutomation()` (`apps/simulation/src/runtime-territory-automation-tick/runtime-territory-automation-tick.ts`,
  ~lines 252 and 284). **It already implements a per-tile budget that accumulates
  and auto-attacks** — we reuse its accumulation half and delete its auto-attack
  from outposts.
- **A "set per-tile mode" command already exists**: `SET_SIEGE_OUTPOST_SWEEP`
  (search `SET_SIEGE_OUTPOST_SWEEP` across `apps/`). Copy its end-to-end wiring
  for the new muster commands.
- **Client→server command types** are whitelisted in
  `apps/realtime-gateway/src/supported-client-messages/supported-client-messages.ts` and validated in
  `packages/sim-protocol/src/index.ts`.
- **Tile shape** is `Tile` in `packages/shared/src/types.ts`; its sim-side mirror
  is `DomainTileState` in `packages/game-domain/src/index.ts`; the client mirror
  is in `packages/client/src/client-types.ts`; wire deltas in
  `apps/simulation/src/runtime-types.ts` (`SimulationTileWireDelta`).

---

## Phase 0 — Feature flag + constants

**Goal:** a single switch that gates the whole system, plus all tunable numbers
in one place.

**Files:**
- `packages/shared/src/config.ts`

**Steps:**
1. Add to `config.ts`:
   ```ts
   // --- Mustering system (Phase 0) ---
   // Master switch. When false, the game behaves exactly as before.
   export const MUSTER_SYSTEM_ENABLED =
     process.env.MUSTER_SYSTEM_ENABLED === "true";

   // How much mustered manpower one ordinary attack costs (placeholder).
   export const MUSTER_ATTACK_COST = 60;
   // Max manpower a single muster tile can hold (placeholder).
   export const MUSTER_TILE_CAP = 120;
   // Base muster inflow a single tile gets if it had the WHOLE pipeline (per min).
   export const MUSTER_BASE_RATE_PER_MIN = 180; // ~20s per 60 with full pipeline
   // Multiplier to muster inflow when the tile is inside an outpost depot zone.
   export const MUSTER_DEPOT_SPEED_MULT = 2.0;
   // Chebyshev radius of an outpost depot's effect (5x5 => radius 2).
   export const OUTPOST_DEPOT_RADIUS = 2;

   // --- Barbarian raids ---
   export const BARBARIAN_RAID_COST = 10; // cheap, no muster wind-up

   // --- Fort garrison (Phase 7) ---
   export const FORT_GARRISON_CAP_BY_VARIANT: Record<string, number> = {
     WOODEN_FORT: 120,
     FORT: 120,
     IRON_BASTION: 240,
     THUNDER_BASTION: 360,
   };
   // Fraction of the attacking force the garrison loses on a REPULSED assault.
   export const FORT_GARRISON_ATTRITION_MIN = 0.05;
   export const FORT_GARRISON_ATTRITION_MAX = 0.15;
   ```
2. **Verify:** `pnpm -w build` (or `pnpm --filter @border-empires/shared build`)
   compiles. `grep MUSTER_SYSTEM_ENABLED packages/shared/src/config.ts` returns
   the const.

**Done when:** the flag and constants exist and compile. No behavior change yet.

---

## Phase 1 — Per-tile muster data model

**Goal:** tiles can carry a muster reservoir. Pure data plumbing; nothing reads it
yet.

**Files (add the same `muster` shape to each layer):**
- `packages/shared/src/types.ts` — add to `Tile`:
  ```ts
  muster?: {
    ownerId: string;
    amount: number;          // manpower currently mustered here
    mode: "HOLD" | "ADVANCE";
    targetX?: number;        // optional aimed target (for ADVANCE steering)
    targetY?: number;
    updatedAt: number;       // ms; for accumulation math
  } | undefined;
  ```
- `packages/game-domain/src/index.ts` — add the identical optional `muster` field
  to `DomainTileState`.
- `packages/client/src/client-types.ts` — add the identical field to the client
  tile type.
- `apps/simulation/src/runtime-types.ts` — ensure `SimulationTileWireDelta`
  carries `muster` (follow how `siegeOutpost`/`fort` are carried).
- Wherever a tile is serialized to a wire delta (search
  `tileDeltaFromState`), include `muster`.

**Steps:** add the field in each file. Do not write any logic that sets it yet.

**Verify:** `pnpm test` is green (no behavior change). `pnpm -w build` compiles.

**Done when:** all four layers know about `muster` and the project builds.

---

## Phase 2 — Logistics throughput (player stat)

**Goal:** a per-player number = manpower/min that can flow from the pool into
musters. Derived from the player's economy, mirroring how manpower regen is
derived.

**Files:**
- `apps/simulation/src/runtime/runtime.ts`

**Steps:**
1. Find `playerManpowerRegenPerMinute(player)` (~line 1175) and the helper it
   calls (`playerManpowerRegenPerMinuteFromSummary`). Add a sibling:
   ```ts
   private playerLogisticsThroughputPerMinute(player: RuntimePlayer): number {
     // Placeholder: tie to the same town summary as manpower regen.
     // Start simple = same as manpower regen; tune later.
     return this.playerManpowerRegenPerMinute(player);
   }
   ```
2. Export it in the player snapshot the same way `manpowerRegenPerMinute` is
   exported (search `manpowerRegenPerMinute:` in `runtime-state-export.ts` and
   `player-snapshot.ts`) so the client can display it later. Add a
   `logisticsThroughputPerMinute` field alongside it in those snapshot builders
   and in `packages/sim-protocol/src/index.ts` where `manpowerRegenPerMinute?` is
   declared.

**Verify:** `pnpm test` green; `pnpm -w build` compiles.

**Done when:** the runtime can compute a per-player throughput and it appears in
the player snapshot type.

---

## Phase 3 — Muster commands (place / update / clear a flag)

**Goal:** a player can set a muster flag on an owned tile with a mode, and clear
it. Copy the `SET_SIEGE_OUTPOST_SWEEP` wiring exactly.

**Files:**
- `apps/realtime-gateway/src/supported-client-messages/supported-client-messages.ts` — add `"SET_MUSTER"`
  and `"CLEAR_MUSTER"` to the whitelist (next to `SET_SIEGE_OUTPOST_SWEEP`).
- `packages/sim-protocol/src/index.ts` — add payload validation for the two new
  command types (mirror the existing per-tile command payloads:
  `{ x, y, mode }` for SET_MUSTER, `{ x, y }` for CLEAR_MUSTER).
- `apps/simulation/src/runtime/runtime.ts` — in the command dispatch (search the big
  `command.type !== "..."` guard list ~line 7167 AND the place where
  `SET_SIEGE_OUTPOST_SWEEP` is actually handled) add handling for `SET_MUSTER` /
  `CLEAR_MUSTER`.

**Steps (handler logic):**
1. On `SET_MUSTER {x,y,mode}`:
   - Look up the tile. Reject if not owned by the actor, or not LAND. (Reuse the
     same ownership/terrain checks the sweep command uses.)
   - If `!MUSTER_SYSTEM_ENABLED`, reject with a clear code (`MUSTER_DISABLED`).
   - Set `tile.muster = { ownerId: actor.id, amount: existing?.amount ?? 0,
     mode, updatedAt: now }` via `replaceTileState`. Emit a tile delta (copy how
     the sweep command emits `TILE_DELTA_BATCH`).
2. On `CLEAR_MUSTER {x,y}`:
   - Clear `tile.muster` (set to `undefined`) via `replaceTileState`. **Mustered
     manpower is destroyed, not refunded** (design decision — do not return it to
     the pool). Emit a tile delta.

**Verify:**
- Add a unit test `apps/simulation/src/runtime-muster-tick/muster-command.test.ts`: with the flag ON,
  SET_MUSTER on an owned tile sets `tile.muster`; CLEAR_MUSTER removes it;
  SET_MUSTER on an enemy tile is rejected.
- `pnpm test` green.

**Done when:** you can set and clear a muster flag and see the tile state change
in a test.

---

## Phase 4 — Muster accumulation tick

**Goal:** each tick, active muster tiles pull manpower from the player pool at a
rate = their share of the player's logistics throughput (×depot bonus), capped at
`MUSTER_TILE_CAP`. The pulled amount is **subtracted from `player.manpower`**.

**Reference implementation to copy from:** the accumulation half of
`tickSweepStructure()` (`apps/simulation/src/runtime-sweep-structure-tick/runtime-sweep-structure-tick.ts`,
lines ~47–64) already does "regen a per-tile budget over elapsed time, capped,
emit delta." Mirror it.

**Files:**
- New: `apps/simulation/src/runtime-muster-tick/runtime-muster-tick.ts`
- `apps/simulation/src/runtime/runtime.ts` (wire the new tick into the loop)

**Steps:**
1. Write `tickMuster(input, nowMs)` that:
   - Gathers all tiles where `tile.muster?.ownerId === playerId` for each player
     (you can iterate the player's owned-tile index; see how
     `tickTerritoryAutomation` enumerates player tiles, and prefer the existing
     `PlayerCandidateIndex` / owned-tile sets — do NOT scan the whole world map).
   - Computes `throughput = playerLogisticsThroughputPerMinute(player)`.
   - **Splits throughput across the active muster tiles** for that player:
     `sharePerTile = throughput / activeMusterTileCount`. (This is the
     "concentration beats spreading" rule.)
   - For each muster tile: `rate = sharePerTile × depotMult(tile)` where
     `depotMult` is `MUSTER_DEPOT_SPEED_MULT` if the tile is within
     `OUTPOST_DEPOT_RADIUS` of one of the player's outposts, else 1. (Reuse
     `coordsInChebyshevRadius` from `territory-automation.ts` and the outpost
     lookup; or add an outpost-depot index in Phase 6.)
   - `inflow = min(rate × elapsedMin, player.manpower, MUSTER_TILE_CAP - amount)`.
     Subtract `inflow` from `player.manpower`; add to `tile.muster.amount`; set
     `updatedAt`. Persist via `replaceTileState`, emit delta.
   - **Guard:** if `!MUSTER_SYSTEM_ENABLED`, return immediately (no-op).
2. Call `tickMuster` from the same place `tickTerritoryAutomation` is invoked
   (`SimulationRuntime.tickTerritoryAutomation`, runtime.ts ~line 913), AFTER
   manpower regen has been applied for the tick.

**Verify:**
- Test `apps/simulation/src/runtime-muster-tick/muster-tick.test.ts`: a player with a known
  throughput and one ADVANCE/HOLD flag accumulates the expected manpower after N
  simulated minutes; manpower is removed from the pool; amount caps at
  `MUSTER_TILE_CAP`; two flags each fill at half rate.
- `pnpm test` green.

**Done when:** muster tiles fill from the pool at the right (split, depot-boosted)
rate and the pool drains accordingly.

---

## Phase 5 — Gate attacks on local muster (the core switch)

**Goal:** with the flag ON, an ATTACK is only allowed if the **origin tile's
muster `amount`** covers the cost, and the cost is **deducted from that tile**,
not the global pool. HOLD fires on player command; ADVANCE auto-fires.

**Files:**
- `packages/game-domain/src/index.ts` (`validateFrontierCommand`)
- `apps/simulation/src/runtime/runtime.ts` (`handleFrontierCommand` — deduction)
- `apps/simulation/src/runtime-muster-tick/runtime-muster-tick.ts` (ADVANCE auto-fire)

**Steps:**
1. **Validation.** In `validateFrontierCommand`, add an input field
   `musterSystemEnabled: boolean` and `originMuster: number` (the origin tile's
   `muster.amount`). When `musterSystemEnabled` and `actionType === "ATTACK"`:
   - Replace the `actor.manpower < manpowerMin` check with
     `originMuster < requiredMuster`, where `requiredMuster` is computed in
     Phase 7 (fort garrison) — for now use `MUSTER_ATTACK_COST`.
   - Return a `code: "INSUFFICIENT_MUSTER"` failure when short.
   - When the flag is OFF, keep the existing `actor.manpower` logic untouched.
2. **Deduction.** In `handleFrontierCommand`, when the flag is ON and the action
   is ATTACK: on a resolved attack, subtract `requiredMuster` from the **origin
   tile's** `muster.amount` (via `replaceTileState`) instead of from
   `player.manpower`. (Leave the OFF path exactly as-is.)
3. **HOLD vs ADVANCE.**
   - HOLD: firing happens only via an explicit player ATTACK command (already the
     normal command path). No change beyond the gate above.
   - ADVANCE: in `tickMuster`, after accumulation, if `tile.muster.mode ===
     "ADVANCE"` and `amount >= requiredMuster` for an adjacent valid enemy target,
     **issue an ATTACK** by calling `handleFrontierCommand` exactly like
     `tickSweepStructure` does today (it builds a synthetic `CommandEnvelope` with
     `sessionId: "system-runtime:..."`). Pick the target with the existing
     candidate sort (`sweepAttackCandidates` / `PlayerCandidateIndex`), but with
     **radius 1** (a muster flag only hits adjacent tiles; to reach further it must
     advance — reuse `chooseSweepExpansionStep`).
   - **Never auto-fire into a target you can't out-muster** (respect fort garrison,
     Phase 7): only fire when `amount >= requiredMuster(target)`.

**Verify:**
- Test: flag ON, an owned tile with `muster.amount = 60` adjacent to an enemy
  FRONTIER tile can ATTACK; the same tile with `amount = 0` is rejected with
  `INSUFFICIENT_MUSTER`; a successful attack subtracts from the tile, not the
  pool.
- Test: flag OFF → old behavior (global pool) unchanged. (Run the existing
  frontier/combat tests; they must stay green.)
- `pnpm test` green.

**Done when:** with the flag ON, attacks consume tile muster; with it OFF, nothing
changed.

---

## Phase 6 — Outposts: remove auto-sweep, become muster depots

**Goal:** outposts stop auto-attacking. They (a) speed up mustering in a 5×5
(already used by Phase 4's depot bonus) and (b) keep boosting attack power.

**Files:**
- `apps/simulation/src/runtime-territory-automation-tick/runtime-territory-automation-tick.ts` (the two
  `tickSweepStructure(...)` calls, ~lines 252 and 284)
- `apps/simulation/src/runtime-sweep-structure-tick/runtime-sweep-structure-tick.ts`
- `packages/shared/src/outpost-aura/outpost-aura.ts` (attack-power aura — keep)

**Steps:**
1. Gate the two `tickSweepStructure(...)` calls behind `!MUSTER_SYSTEM_ENABLED`
   so that, when the muster system is ON, **outposts no longer auto-attack**.
   (Keep the OFF path so today's behavior is preserved.)
2. Confirm the attack-power aura in `outpost-aura.ts` (`targetOutpostMult`) still
   feeds `attackerOutpostMult` in combat — leave it on regardless of flag.
3. The muster depot speed bonus is already consumed in Phase 4 (`depotMult`). If
   you didn't build an outpost-position index there, build a small per-player
   "outpost tiles" set now and use it for the `coordsInChebyshevRadius` depot
   check.
4. **Do not delete** the `sweepBudget`/`sweepActive` fields yet (existing seasons
   may carry them); just stop driving auto-attacks from them when the flag is ON.

**Verify:**
- Test: flag ON, an outpost adjacent to enemies does NOT auto-capture over several
  ticks; a muster tile inside its 5×5 fills faster than one outside.
- Flag OFF: existing sweep tests still pass.
- `pnpm test` green.

**Done when:** outposts are depots (speed + power) and never auto-fight under the
new flag.

---

## Phase 7 — Fort garrison containers

**Goal:** forts hold a garrison that (a) fills from the player's **overflow**
regen, (b) IS the manpower an attacker must out-muster, (c) scales fort defense by
fill ratio, (d) loses 5–15% of the attacking force on a repulsed assault, (e)
heals slower when many forts are attacked at once (shared overflow).

**Files:**
- `packages/shared/src/types.ts`, `packages/game-domain/src/index.ts`,
  `packages/client/src/client-types.ts` — extend the `fort` object with
  `garrison: number`, `garrisonCap: number`, `garrisonUpdatedAt: number`.
- New: `apps/simulation/src/runtime-fort-garrison-tick.ts`
- `packages/shared/src/frontier-combat/frontier-combat.ts` — garrison-based defense
- `packages/game-domain/src/index.ts` (`validateFrontierCommand`) — `requiredMuster`
- `apps/simulation/src/runtime/runtime.ts` (`handleFrontierCommand`) — attrition on loss

**Steps:**
1. **Garrison cap** = `FORT_GARRISON_CAP_BY_VARIANT[variant]`. Set
   `garrisonCap` when a fort is created/upgraded; start `garrison` at ~25% of cap
   (the "trickle started during construction" rule).
2. **Overflow fill tick** (`tickFortGarrison`):
   - Only runs when `MUSTER_SYSTEM_ENABLED`.
   - A player's "overflow" = the manpower regen they would have wasted because the
     pool is already at cap. Compute: if `player.manpower >= playerManpowerCap`,
     the regen for this interval becomes available as overflow.
   - Gather the player's forts with `garrison < garrisonCap`. **Split the overflow
     across them** (this gives the "many depleted forts heal slower" behavior).
   - Add each fort's share to `garrison`, cap at `garrisonCap`, persist via
     `replaceTileState`, emit delta.
   - Wire it into the tick loop next to `tickMuster`.
3. **`requiredMuster(target)`** (used in Phases 5): if the target has an active
   fort, `requiredMuster = max(MUSTER_ATTACK_COST, fort.garrison)`. Else
   `MUSTER_ATTACK_COST`. (Barbarians handled in Phase 8.)
4. **Defense scales with fill.** In `frontier-combat.ts` `defenseMultiplierForTile`,
   when the flag is ON and `target.hasFort`, replace the flat `fortDefenseMult`
   with a value proportional to `garrison / garrisonCap` (e.g.
   `defMult *= 1 + (maxFortDefenseBonus × garrison / garrisonCap)`). Pass
   `garrison`/`garrisonCap` through `FrontierCombatModifiers`. Keep the OFF path
   using the old flat multiplier.
5. **Attrition on repulse.** In `handleFrontierCommand`, when an ATTACK on a fort
   **fails** (attacker did not win), reduce that fort's `garrison` by
   `rand(FORT_GARRISON_ATTRITION_MIN, FORT_GARRISON_ATTRITION_MAX) ×
   attackingForce`, where `attackingForce` is the muster spent. Persist + emit.
   (On a win, the fort is captured as usual; garrison resets/clears.)
6. **Also delete the dead MOUNTAIN branch** in `defenseMultiplierForTile`
   (`if (target.terrain === "MOUNTAIN")`) — mountains can never be attack targets
   (`validateFrontierCommand` rejects non-LAND), so it never executes. (Safe in
   both flag states.)

**Verify:**
- Test: a fort fills from overflow only when the pool is at cap; two depleted
  forts each fill at half rate; a fort at half garrison gives ~half the defense
  bonus; a repulsed assault reduces garrison; required muster to attack a fort
  equals its current garrison.
- Flag OFF: forts behave as before. `pnpm test` green.

**Done when:** forts are wear-down-able garrison containers under the flag, and
unchanged with the flag off.

---

## Phase 8 — Barbarian raids

**Goal:** attacking a barbarian tile is a cheap, fast raid — no muster wind-up.

**Files:**
- `packages/game-domain/src/index.ts` (`validateFrontierCommand`)

**Steps:**
1. In `validateFrontierCommand`, when the flag is ON and the target is a barbarian
   tile (`target.ownershipState === "BARBARIAN"` or
   `target.ownerId === "barbarian-1"`), set `requiredMuster = BARBARIAN_RAID_COST`
   and allow the attack to be funded **directly from the player pool**
   (`actor.manpower >= BARBARIAN_RAID_COST`) rather than from tile muster. Deduct
   from the pool on resolution. This keeps barb clearing snappy.
2. Make sure ADVANCE auto-fire (Phase 5) treats barbarian targets with the raid
   cost too, so a muster flag near barbs still works without a full wind-up.

**Verify:**
- Test: flag ON, a player with ≥10 pool manpower can attack an adjacent barbarian
  tile with no muster on the origin; cost is deducted from the pool.
- `pnpm test` green.

**Done when:** barbarians can be raided cheaply and fast under the flag.

---

## Phase 9 — Client visualization

**Goal:** players can SEE muster filling, fort garrisons, and toggle flag mode.

**Files (client):** `packages/client/src/` — tile rendering, tile menu/overlay,
HUD. Search for how `siegeOutpost` sweep state and `fort` are currently rendered
and mirror it.

**Steps:**
1. **Muster meter:** on any tile with `muster`, draw a fill bar
   `amount / MUSTER_TILE_CAP` with the owner color. Show it whenever the tile is
   in the viewer's vision (so an enemy massing against you is visible — no special
   building required).
2. **Fort garrison meter:** on any tile with an active fort, draw
   `garrison / garrisonCap` (e.g. `⚙ 180 / 360`).
3. **Flag controls:** in the tile menu for an owned tile, add "Muster here"
   (sends `SET_MUSTER` with default mode) and a HOLD/ADVANCE toggle and "Stop
   mustering" (`CLEAR_MUSTER`). For ADVANCE, optionally let the player click a
   target tile to set `targetX/targetY`.
4. **HUD:** show `logisticsThroughputPerMinute` next to the manpower readout.
   Keep the manpower number = the pool only (do NOT subtract garrison — garrison
   lives on forts).

**Verify:** manual — run the client (`pnpm dev` per `README.md` / project run
skill), set a muster flag, watch it fill, toggle modes, watch a fort garrison.
Confirm the manpower HUD number stays honest. Add a client unit test if the
rendering layer has them.

**Done when:** the three visuals work and the controls send the right commands.

---

## Phase 10 — AI parity

**Goal:** AI players use mustering instead of instant attacks, without blowing the
planner CPU budget.

**Files:**
- `apps/simulation/src/ai/automation-goap.ts` (action catalog)
- `apps/simulation/src/ai/automation-strategic-snapshot.ts` (preconditions)
- `apps/simulation/src/ai/frontier-command-planner.ts` (target selection — the known
  CPU hot spot; do not make it heavier)

**Steps:**
1. Add a `place_muster` GOAP action: precondition "has a profitable attack target
   AND no muster flag there yet"; effect: emit `SET_MUSTER` (ADVANCE) on the best
   border origin. Let the muster tick + ADVANCE auto-fire do the actual attacking.
2. Add a `musterReady` snapshot signal: the AI should not try to ATTACK directly
   under the flag; it should place flags and let them fire. Make the existing
   `attack_enemy_border_tile` action a no-op (or remove from the catalog) when the
   flag is ON.
3. **CPU:** AI should place a *bounded* number of muster flags per tick and reuse
   `PlayerCandidateIndex`. Do NOT add a new O(owned × candidates) scan. Respect
   the guardrails in `AGENTS.md`.

**Verify:**
- Run a headless sim (search for an existing sim harness/bench under
  `apps/simulation/src/__bench__/` or a sim integration test) with the flag ON and
  confirm AI players gain/lose tiles over time (i.e., they actually fight) and the
  planner does not exceed its budget. `pnpm test` green.

**Done when:** AI plays the muster game and the planner stays within budget.

---

## Phase 11 — Rollout

1. Keep `MUSTER_SYSTEM_ENABLED=false` in all committed configs. Enable it only in
   a dev/staging environment via the env var for playtesting.
2. Run a full season-sim soak on staging with the flag ON; watch for: stuck
   musters, forts that never fill or never fall, AI stalls, and the
   `goldIncomePausedReason: MANPOWER_NOT_FULL` interaction (it should no longer be
   triggered by building forts, since forts no longer cost a manpower lump).
3. Only after a clean soak, consider flipping the default. Migration: existing
   tiles may carry stale `sweepBudget`/`sweepActive` — they are ignored under the
   flag, so no data migration is required; you may strip them in a later cleanup.

---

## Quick reference — files you will touch

| Area | File |
|---|---|
| Constants + flag | `packages/shared/src/config.ts` |
| Tile shape | `packages/shared/src/types.ts`, `packages/game-domain/src/index.ts`, `packages/client/src/client-types.ts`, `apps/simulation/src/runtime-types.ts` |
| Attack validation | `packages/game-domain/src/index.ts` (`validateFrontierCommand`) |
| Attack execution / commands | `apps/simulation/src/runtime/runtime.ts` (`handleFrontierCommand`, command dispatch) |
| Command whitelist + schema | `apps/realtime-gateway/src/supported-client-messages/supported-client-messages.ts`, `packages/sim-protocol/src/index.ts` |
| Muster accumulation | NEW `apps/simulation/src/runtime-muster-tick/runtime-muster-tick.ts` |
| Fort garrison | NEW `apps/simulation/src/runtime-fort-garrison-tick.ts` |
| Outpost sweep removal | `apps/simulation/src/runtime-territory-automation-tick/runtime-territory-automation-tick.ts`, `runtime-sweep-structure-tick.ts` |
| Combat math | `packages/shared/src/frontier-combat/frontier-combat.ts` |
| Reference for per-tile budget + auto-attack | `apps/simulation/src/runtime-sweep-structure-tick/runtime-sweep-structure-tick.ts`, `territory-automation.ts` |
| Client visuals | `packages/client/src/` |
| AI | `apps/simulation/src/ai/automation-goap.ts`, `automation-strategic-snapshot.ts`, `frontier-command-planner.ts` |
