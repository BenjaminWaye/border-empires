# Combat lock timing plan

Status: B implemented (2026-10-04); A proposed (2026-10-03). Follow-up to the incoming-attack fixes branch
(`agent/incoming-attack-fixes`). Two server changes, shipped as separate PRs
in this order.

## Background: what the combat lock did before B (storage described here is now `CombatLockIndex`)

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

Status: **implemented** on `agent/origin-counter-attack` (2026-10-04), ahead of A.

The defender's counter-attack on the attacker's origin was rejected `LOCKED`.
The units have already left that tile, but it was locked because it's the
attacker's stake. The goal is **not** to save the tile under attack (the
outcome is rolled at accept time and the attack was accepted first, so it
resolves first). It is to let the defender start the answer immediately and
run it in parallel with the enemy's lock, instead of waiting out ~30 s before
they can hit back. During a long auto-fire march it also lets them hit the
launch tile before the attack has even arrived.

### Step 0 (done): the suspected bug was real

Two ATTACKs from one origin to two targets: the second `locksByTile.set(originKey)`
overwrote the first lock's origin slot, `resolveLock` saw `originMatches ===
false` and dropped the first lock as stale -- no `COMBAT_RESOLVED`, reservation
released. Confirmed by `runtime-lock-same-origin.test.ts`, which failed before
the storage change.

### Change (done)

1. **Storage.** `CombatLockIndex` (`apps/simulation/src/combat-lock-index.ts`)
   replaces the `Map<tileKey, LockRecord>`: a `targets` map (one fight per
   target tile) and an `origins` map (`tileKey -> Set<LockRecord>`, any number).
   `locksByTile` keeps its field name. `values()` yields each lock once,
   `has()` still means "this tile is the target or an origin of any fight", so
   the busy-tile readers (structure builds, auto-settle, muster pathing,
   respawn, barbarians) behave as before. Only the readers that mean one role
   specifically use `targetLockAt` / `originLocksAt`. Snapshot/hydration is
   unchanged (it serializes `locksByCommandId`).
2. **Validation.** `LOCKED` only when the target tile is the **target** of
   another fight, or the origin tile is itself under attack (or is another
   player's launch tile, which only applies to allied dock-crossing origins).
   Being some other fight's origin no longer blocks attacking it.
3. **Resolution when the origin changed hands mid-fight: resolve anyway.**
   `resolveLock` treats a lock as stale only when it no longer owns its
   **target** slot. A win still captures the target. On a loss, the "defender
   takes the origin" payout is skipped when the origin is no longer the
   attacker's, so a launch tile captured by anyone mid-fight is never handed
   back to the defender.
   *Rejected: cancel the pending attack when its origin is captured.* The
   counter-attack is accepted after the original, so it locks and resolves
   after it; cancelling on capture would almost never save the tile, and
   cancelling on start would let a cheap decoy attack stop any fight.
4. **Client.** Removed the up-front "locked, try again in m:ss" refusal in
   `client-queue-target-selection.ts` (`incomingAttackLaunchedFrom`).

### Tests (done)

- `runtime-lock-same-origin.test.ts`: two attacks from one origin both resolve.
- `runtime-lock-origin-counter-attack.test.ts`: counter-attack on a launch
  tile is accepted; a second attack on an already-targeted tile and a launch
  from a tile under attack are still `LOCKED`; original attack still resolves
  after its origin is captured (win); a captured origin is not handed to the
  defender when the original attack loses.
- `client-queue-target-selection.test.ts`: the launch tile is queued.

## Order and risk

B (with its step 0 test) was done first because it is what players hit most.
A is still to do. A changes when locks exist and B changed how they're stored,
so landing them separately keeps each diff reviewable. Both touch per-tick
auto-fire, so run the prod-shape load gate before merge.
