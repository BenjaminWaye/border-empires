# Combat lock timing plan

Status: proposed (2026-10-03). Follow-up to the incoming-attack fixes branch
(`agent/incoming-attack-fixes`). Two server changes, shipped as separate PRs
in this order.

## Background: what the combat lock does today

- An accepted ATTACK/EXPAND creates one `LockRecord`, stored under **both** its
  origin and target tile keys in `locksByTile`
  (`apps/simulation/src/runtime-frontier-command.ts`), plus `locksByCommandId`.
  `locksByTile` holds **one record per tile**.
- `validateFrontierCommand` (`packages/game-domain/src/index/index.ts`) rejects
  `LOCKED` when the *target* tile has any lock (as origin or target of another
  fight), or when the *origin* is locked by someone else.
- The outcome is rolled at accept time (`buildLockedCombatResolution`) and
  applied at `resolvesAt`. A losing attacker also **loses the origin tile**
  and any muster flag on it (`runtime-combat-support.ts` result `changes`,
  `runtime-lock-resolution-lost-origin.ts`). That stake is why the origin is
  locked.
- `resolveLock` treats a lock as stale and drops it without resolving if
  either tile key no longer points at it (`originMatches`/`targetMatches`).

## Problem A: auto-fire locks the tiles for the whole march

A manual muster attack waits out its march **on the client**
(`armMusterTransit`), and only then sends ATTACK, so the lock and the
defender's ATTACK_ALERT start on arrival. ADVANCE/MARCH auto-fire (which is
how AI empires attack) creates the lock and sends ATTACK_ALERT **at launch**
and adds the march time to `resolvesAt`. The defender gets a red cross and
locked tiles for the whole march, with nothing visibly approaching. The
incoming-attack branch caps the march at 15 tiles (30 s) but keeps the order.

### Change

Accept → march → lock, matching manual attacks:

1. **Accept (fire time).** Run `validateFrontierCommand` as today so bad
   commands still fail fast. Reserve muster (`musterReservedByKey`) but do
   **not** touch `locksByTile` and do **not** send ATTACK_ALERT. Store a
   `PendingMarch` { commandId, playerId, musterSourceKey, origin, target,
   manpowerCost, commitManpower, arrivesAt } in a new
   `pendingMarchesByCommandId` map. It is bounded:
   at most `MUSTER_MAX_CONCURRENT_ACTIONS` per flag. Add a gauge for its size,
   per `docs/agents/state-and-persistence-discipline.md`. Emit
   COMMAND_ACCEPTED with `transitEndsAt` as now, so the attacker's march
   animation is unchanged.
2. **Arrival (`arrivesAt`).** Re-run validation, because tiles may have changed
   hands or been locked during the march. On failure, release the
   reservation, delete the pending march, and send a rejection with a clear
   reason ("target changed hands while your company marched"). Count it with
   a counter, per the "counter for every skip" rule. On success, create the
   lock with `resolvesAt = now + combat lock` and roll
   `buildLockedCombatResolution` **now**, so odds reflect arrival-time
   state. Then send ATTACK_ALERT (no `transitEndsAt` needed any more) and
   COMBAT_START.
3. **Flag concurrency.** `locksSourcedFromMusterTile` must also count
   pending marches, or a flag can fire unlimited marches while none are
   locked yet. The same goes for `inFlightCount` / `nextActionAt` in
   `maybeAdvanceFire` and `runtime-muster-march.ts`.
4. **Cancel / flag removed / player eliminated.** Pending marches need the same
   teardown paths as locks: cancel-capture, muster flag removal, and the
   orphaned-lock sweep. Release the reservation in each.
5. **Persistence.** Decide between persisting `pendingMarches` in the
   snapshot (next to `activeLocks`) and dropping them at boot with the
   reservation released. Dropping is simpler and loses at most 30 s of
   marching; recommend dropping, plus a boot counter.
6. **Client.** Check `handleMusterAdvanceCombatStart` and
   `outgoingMusterAttacksByTile` with COMBAT_START arriving at arrival
   instead of launch. The defender branch of `syncBattleOverlayFx` and the
   incoming claim plates already handle "no `transitEndsAt`".
7. **AI.** Check every AI read of `locksByTile` for "already busy"
   decisions (`runtime-player-debug-snapshot.ts` `plannerBlocked`, the
   muster scan's locked-tile skips). Pending marches should count as busy
   where locks do. Load-test per
   `feedback_tick_frequency_commands_need_accumulated_state_test`: auto-fire
   is per-tick.

### Tests

- Auto-fire: no `locksByTile` entry and no ATTACK_ALERT before `arrivesAt`;
  both appear at arrival with `resolvesAt = arrival + COMBAT_LOCK_MS`.
- Target captured mid-march: rejected at arrival, reservation released.
- Flag at `MUSTER_MAX_CONCURRENT_ACTIONS` pending marches: does not fire again.
- Boot with pending marches: dropped and reservation released.

## Problem B: you can't counter-attack the tile you're being attacked from

The defender's counter-attack on the attacker's origin is rejected `LOCKED`.
The units have already left that tile, but it's locked because it's the
attacker's stake.

### Step 0: confirm a suspected existing bug

The validator explicitly allows a second attack from your own origin while
the first is pending ("Attacking again from your own recently used origin
tile is allowed"). `locksByTile.set(originKey, …)` then **overwrites** the
first lock's origin entry. At resolution, `originMatches` is false for the
first lock, so it suspectedly takes the stale branch: dropped, never
resolved, its muster reservation released. **Unverified.** Write a sim
test (two ATTACKs from one origin at two targets, check both resolve) before
anything else. If confirmed, the storage change below fixes it too.

### Change

1. **Storage.** Split `locksByTile` into `targetLockByTile: Map<tileKey,
   LockRecord>` (one fight per target, unchanged rule) and
   `originLocksByTile: Map<tileKey, Set<commandId>>` (any number). Update the
   ~18 `locksByTile` readers (`grep -rn locksByTile apps/simulation/src`)
   to ask the question they actually mean: "is this tile being fought
   over?" (target map) versus "is something launching from here?" (origin map).
   Snapshot/hydration (`activeLocks`) is unchanged because it serializes
   `locksByCommandId`.
2. **Validation.** `LOCKED` only when the target tile is the **target** of
   another fight. Being some other fight's origin no longer blocks attacking
   it.
3. **Resolution when the origin changed hands mid-fight.** This is a design
   decision for the user. Options:
   - **Cancel:** the pending attack is dropped (reservation refunded) the
     moment its origin is captured. Counter-attacking the launch tile becomes
     a real defensive tactic.
   - **Resolve anyway:** a win still captures the target; on a loss, the
     "defender takes the origin" payout is skipped because the origin is
     already gone.
   Either way, `resolveLock` must stop treating "origin key no longer
   points at me" as stale.
4. **Client.** Remove the up-front "locked, try again in m:ss" refusal added
   in `client-queue-target-selection.ts` (`incomingAttackLaunchedFrom`), since
   that tile becomes attackable.

### Tests

- Defender attacks the attacker's origin while the attack is pending: accepted.
- A second attack on a tile that is already a target is still `LOCKED`.
- The chosen option from step 3, for both win and loss.
- Two attacks from one origin both resolve (step 0 regression).

## Order and risk

Ship B's step 0 test first (it's cheap and may reveal a live bug), then A,
then B. A changes when locks exist, and B changes how they're stored.
Landing them separately keeps each diff reviewable. Both touch per-tick
auto-fire, so run the prod-shape load gate before merge.
