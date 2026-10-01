# Barbarian activation and scheduling plan

Status: **implemented on this branch (PR #2191)**, pending staging verification.
Target stack: rewrite (`apps/simulation`). Delete this file once the staging
checks at the bottom pass (see `docs/README.md` lifecycle policy).

## Implementation status

Built (all with tests, `pnpm ci:local` green):

- **Phase 1** per-tile decisions, in-flight tracking, rest-after-settle, attack
  budget: `ai/system-job-barbarian-planner.ts`, `ai/barbarian-settle-relay.ts`,
  `ai/system-job-worker-core.ts` (`barb_settled`), `ai/system-command-producer-worker.ts`.
- **Phase 2** wake when seen, from the real fog coverage:
  `runtime-barb-activation-vision.ts`, `runtime.exportBarbTilesSeenByAnyPlayer`.
  The old signature + union code, the `territoryVersionByPlayer` map (bumped on
  every ownership change in the game) and the throttle metric were deleted.
- **Phase 3** cap: planner alternates actions for seen tiles with shedding unseen
  tiles; `runtime-barbarian-walk.ts` walks instead of multiplying at the cap.
- **Phase 4** local-dev parity: `runtime-barbarian-planner-bridge.ts` runs the
  same planner for the non-worker producer.
- **Phase 5** bounded state: planner maps are pruned; `barbarianTileProgress` is
  dropped when a tile leaves barbarian ownership by any route (and zero entries
  are no longer stored).
- **Phase 6** `docs/game-mechanics.md` and a client changelog entry.

Deliberately **not** done, with reasons:

- **Phase 0 staging baseline and the committed bench file.** The baseline needs
  staging metrics, which only the deployer can read. The numbers in this plan
  came from throwaway local benches. Record the baseline before merging.
- **`idleUntil` skipping of idle plan requests, and the `relevantTileKeys` copy
  fix.** Small wins that touch more of the worker protocol; measure first. The
  planner already skips a tile that had no command for 2s, which removes most of
  the idle analysis cost.
- **Dock reveals in the seen set.** `VisibilityCoverageTracker` doesn't hold
  them (the classifier derives them per export). A barb sitting behind a dock
  link wakes only when it is otherwise visible.
- **2c "act toward the player who sees it".** The barb worker only receives tile
  deltas near barb and player territory, so there is nothing reliable to measure
  distance against; revisit if barbarians still wander off-screen.
- **Constants:** only the ones the runtime and worker share went into
  `packages/shared/src/config.ts` (`MAX_BARBARIAN_TILES`,
  `BARBARIAN_TILE_REST_MS`, `BARBARIAN_ATTACKS_PER_MINUTE`,
  `BARBARIAN_INFLIGHT_TIMEOUT_MS`). The 60s "frozen" bound is a test invariant
  (`system-job-barbarian-planner.test.ts`) and the 1s seen-set refresh is local
  to the producer.

## Rules we want

1. **Wake when seen.** A barbarian tile can act whenever any non-barbarian
   player can see that tile in their actual fog of war. That includes every
   vision source the client shows, not just territory radius.
2. **Barbarians act independently.** Several barbarian tiles can be mid-action
   at once. One tile's 30-second fight must not freeze every other barbarian.
3. **15-second rest after the fight.** A tile's 15-second cooldown starts when
   its action *settles* (combat resolved, claim resolved or rejected), not when
   the command is issued.
4. **The 100-tile cap must not look frozen.** At the cap, barbarians that
   players can see keep fighting. The faction shrinks back under the cap by
   releasing tiles nobody can see, and wins at the cap are walks, not
   multiplies.

## What the code does today

| Area | Current behaviour | Where |
| --- | --- | --- |
| Wake check | Barb tile eligible iff it's in `exportBarbActivationVisibleUnion`. That is a re-implementation of vision: territory radius (`VISION_RADIUS = 1` × `mods.vision` + tech bonus) plus a +1 ring around settled towns. It **ignores** observatories, light/siege outposts (relay beacon), watchtower reveals, allied vision and dock reveals. It also gives FRONTIER tiles full radius, but in the real fog they only get a 1-tile halo. | `apps/simulation/src/runtime-visible-state.ts:100` |
| Why it feels like "one tile" | Base player vision is 1 tile, so for a player with no towns, tech or structures, "seen" really does mean adjacent. | `packages/shared/src/config.ts:21` |
| **Starvation (root cause of "seen but didn't move")** | The planner hands *all* eligible barb tiles to `chooseNextOwnedFrontierCommandFromLookup` at once, and that function returns an `ATTACK` if *any* tile has one before it considers any `EXPAND` (`frontier-command-planner.ts:417-418`). With one faction-wide slot, a barbarian touching any player anywhere on the map wins every pick. Every barbarian that can only walk, like one a tile off your border, never gets a turn until it touches you itself. **Reproduced:** the barb next to the gap expands at 0s, 31s and 62s when it's alone. Add one barbarian fighting elsewhere and the far one attacks 10/10 times while yours never moves. | `ai/system-job-barbarian-planner.ts:101-110` |
| One action slot | `pendingPlayers` (per **player**) blocks the whole faction until the command settles. The worker also returns `null` while `player.hasActiveLock`. The domain only locks per **tile**, so nothing in the rules requires this. | `ai/system-command-producer-worker.ts:430-445`, `ai/system-job-worker-core.ts:134` |
| Cooldown start | `until = now + 15s` is set inside `choose()`, at **issue** time. With a 30s combat lock, the cooldown has already expired when the fight ends, so there is effectively no rest between fights. | `ai/system-job-barbarian-planner.ts:117-132` |
| Cap | At ≥ 100 tiles the planner **only** erodes (`UNCAPTURE_TILE`). It doesn't check vision, and it never attacks or walks, so every barbarian a player is looking at stands still. | `ai/system-job-barbarian-planner.ts:88-90` |
| Multiply | At progress ≥ `BARBARIAN_MULTIPLY_THRESHOLD` (5), a win keeps the source tile, so territory grows by 1. There's no cap check. | `runtime-barbarian-walk.ts:20` |
| Local dev path | Without `SIMULATION_AI_WORKER`, `system-command-producer.ts` uses `runtime.chooseNextOwnedFrontierCommand`. That has no barb cooldown, no vision gate, no cap and the same one-slot gate. | `ai/system-command-producer.ts` |
| Unbounded maps | `cooldownByTileKey` is never pruned. `barbarianTileProgress` entries for tiles that left barbarian ownership by routes other than recapture are never pruned. | planner, `runtime-barbarian-walk.ts` |
| Docs | `docs/game-mechanics.md:29-30` says "adjacent to a non-barb owner", cites stale file/line refs, and says the multiply threshold is 3 (code: 5). | |

## Tunables (new or moved)

Put these in `packages/shared/src/config.ts`, next to the existing
`BARBARIAN_*` constants, so the runtime and the AI worker share them:

```ts
export const MAX_BARBARIAN_TILES = 100;                 // moved from system-job-barbarian-planner.ts
export const BARBARIAN_TILE_REST_MS = 15_000;           // rest after an action settles (replaces BARBARIAN_TILE_COOLDOWN_MS)
export const BARBARIAN_MAX_IDLE_MS = 60_000;            // a seen barb tile must act at least this often ("frozen" = longer)
export const BARBARIAN_ATTACKS_PER_MINUTE = 12;         // TOTAL attacks started per minute by ALL barb tiles on the whole map (perf budget), not per tile; walks are not budgeted
export const BARBARIAN_INFLIGHT_TIMEOUT_MS = 45_000;    // > COMBAT_LOCK_MS; safety net if no settle event arrives
export const BARBARIAN_VISION_RECOMPUTE_MS = 1_000;     // floor between seen-set recomputes
```

`BARBARIAN_ACTION_INTERVAL_MS` (config.ts:318) is only referenced by the
legacy `server-world-runtime-types.ts`. Leave it alone; don't reuse it for the
rewrite.

**Per tile vs. whole map.** A single tile can attack at most once per ~45s
(30s fight + 15s rest), so about 1.3 times a minute. The budget of 12/min is
the **total across every barbarian on the map**. It only matters when about 9
or more barb tiles are fighting players at the same moment. For example, 3
barbs touching you each attack about every 45s, which is about 4/min in total,
well under the budget.

**No fixed concurrency cap.** Each tile is limited by its own rules instead:
one action in flight per tile, then a 15s rest. So a seen tile's cycle is at
most 45s for a fight (30s + 15s) and 22.5s for a walk (7.5s + 15s), both under
the 60s "frozen" line. The in-flight count is naturally ≤ the number of seen
barb tiles (≤ 100). The only faction-wide limit is the **attack budget**,
because attacks are the expensive action (see the performance budget). A seen
tile that wants to attack while the budget is used up **walks or shuffles
instead** (expand into a neutral neighbour). It still moves, so it doesn't look
frozen. The only tile that can still look frozen is one with no neutral
neighbour at a moment when the budget is spent. That only happens when more
than 12 barb tiles are touching players at the same moment.

## Performance budget: net cost must not go up

Hard requirement: the main-thread time the simulation spends on barbarians must
not increase. These changes add work: more barbarian actions in flight and a
fresher seen-set. The vision rewrite in Phase 2 removes far more work than that
adds, so **Phase 2 ships first** and the later phases spend from its savings.

### Measured (local `vitest bench`, 25 players × 1,500 tiles, 100 barb tiles)

| Main-thread work | Per call | How often today | Main-thread ms per minute |
| --- | --- | --- | --- |
| `exportBarbActivationVisibleUnion`, cache miss (current) | **~11.3 ms** | every ≤ 3s; the cache misses whenever *any* player's territory changes, which is nearly always | **~225** |
| `getBarbActivationVisionSignature` (current) | ~0.005 ms | every 500ms tick | ~0.6 |
| `exportPlannerPlayerViews(["barbarian-1"])`, cached | ~0.006 ms | each barb sync (≤ 2/s) | < 1 |
| Proposed seen-set (barb tiles × viewers, `VisibilityCoverageTracker.isVisible`) | **~0.09 ms** | every 1s | **~5.5** |
| One barb **attack** on a player (submit + resolve) | **~14.5 ms** | ~2/min today | ~29 today |
| One barb **walk** (EXPAND into neutral, submit + resolve) | **~0.47 ms** | rare today | ~0 today |

The attack figure is a worst case: the defender in the bench is a solid
1,521-tile block. About 85% of it is the encirclement flood-fill
(`computeEncirclementDeltas`, `bfsCap: 2000`). That runs on **every** capture
in the game, players included, so it's not barbarian waste, but it is what
makes attacks expensive. Walks don't pay it, because the barbarian's own
territory is ≤ 100 tiles.

So the current vision check is the dominant barbarian cost, at about 11ms of
blocked event loop every few seconds. It scans all ~37k non-barb owned tiles
with string splits on every recompute. The replacement only touches the
≤ 100 barb tiles and is **~120× cheaper per call**. It runs 3× as often and is
still about **40× less main-thread time** in total. Staging logged this
function at 2,879ms in one `event_loop_blocked` capture when barbarian
territory was 1,283 tiles; the cap keeps it at ≤ 100 tiles now, but the
non-barb side of the scan still grows with the map.

### Where the new costs come from, and their limits

- **More actions.** Worst case after all phases, with 100 seen barb tiles all
  active, measured in main-thread ms/min:

  | | Today | After |
  | --- | --- | --- |
  | Vision check | ~225 | ~5.5 |
  | Attacks | ~29 (2/min) | ≤ ~174 (12/min budget × 14.5) |
  | Walks | ~0 | ≤ ~50 (≤ 100/min × 0.47) |
  | Signature | ~0.6 | 0 (deleted) |
  | **Total** | **~255** | **≤ ~230** |

  The worst case is still below today, and the typical case (a handful of
  seen barbs) is far below it. `BARBARIAN_ATTACKS_PER_MINUTE` is the dial:
  every +1 costs about 14.5 ms/min. Raise it only if the Phase 0 gate shows
  headroom.
- **No new per-tick work.** All per-tick barbarian work stays bounded by
  `MAX_BARBARIAN_TILES`, never by map or player territory size.
- **Planner work stays in the worker thread.** Cooldown, in-flight, fairness
  and erosion selection all run in the worker. The main thread only relays
  `barb_settled` messages: one tiny `postMessage` per finished action.

### Extra savings to take along the way

- Delete `getBarbActivationVisionSignature` and the
  `territoryVersionByPlayer` bookkeeping. Every ownership change in the game
  currently pays to bump that map (`runtime.ts:2103-2106`), only to feed the
  signature.
- The producer asks the worker for a plan every 500ms even when nothing can
  act. Have the worker report `idleUntil` (soonest cooldown expiry, or
  "until the seen-set changes") with each `null` result. The producer then
  skips `requestPlan` until that time or until a new `vision_union` or
  `barb_settled` arrives, which removes most idle round trips.
- `syncPlayers` rebuilds `relevantTileKeys = new Set(index.keys())` (a full
  copy) on every barb sync. Use the index's own `keys()` set directly, since it
  is already a `ReadonlySet`. That saves an O(barb territory × 25) allocation
  on every barb tile change.

### Phase 0: lock in a baseline (part of the first PR)

1. Commit `apps/simulation/src/runtime-barb-activation-vision.bench.ts` with
   the scenario above. It benches the old union (cache miss) against the new
   seen-set, plus one barb `ATTACK` submit→resolve cycle through
   `SimulationRuntime` to get the per-action cost. Run it with
   `pnpm --filter @border-empires/simulation bench`.
2. Before merging the first PR, record staging's 24h p95 for these metrics:
   - `sim_main_thread_task_ms{phase="system_export_barb_activation_visible_union"}`
   - `sim_main_thread_task_ms{phase="system_get_barb_activation_vision_signature"}`
   - `sim_main_thread_task_ms{phase="system_export_planner_player_views"}`
   - `sim_tick_duration_ms{source="system"}`
   - event-loop lag and `event_loop_blocked` count
3. **Gate for every later PR:** the sum of barbarian main-thread time on
   staging, over the 24h after deploy, must be ≤ the baseline. Event-loop
   lag p95 must not rise. If a PR misses the gate, revert it or lower
   `BARBARIAN_ATTACKS_PER_MINUTE`, and don't move on to the next PR.

---

## Phase 1: independent tiles, rest after settle (fixes "frozen")

### 1a. Per-tile in-flight tracking in the planner

File: `apps/simulation/src/ai/system-job-barbarian-planner.ts`

- Add `inFlightByCommandId: Map<string, { fromKey: string; toKey: string; issuedAt: number }>`
  and a derived `busyTileKeys: Set<string>` (from + to of every in-flight entry).
- In `choose()`:
  1. Prune in-flight entries older than `BARBARIAN_INFLIGHT_TIMEOUT_MS`. Treat
     each one as settled (apply the rest cooldown, step 1b).
  2. Skip tiles that are in `busyTileKeys` or still resting.
  3. **Per-tile decisions (fixes starvation).** Sort eligible tiles by
     `lastActedAtByTileKey` ascending (never acted = 0). Walk that list and,
     for each tile, call `chooseNextOwnedFrontierCommandFromLookup` with
     **only that tile** as the owned set. Pass `canAttack: false` when the
     attack budget (a sliding 60s window of attack issue times, ≤ 12 entries)
     is spent. Return the first command found. The tile that has waited
     longest always goes next, and an attack elsewhere can never starve a
     walker.
  4. Calling the frontier function per tile is O(neighbours) each, and only
     until the first hit. The worst case is ≤ 100 small calls in the worker
     thread, never on the main thread.
  5. On a command, record it in `inFlightByCommandId` and **do not** set a
     cooldown yet. Parse `fromX/fromY/toX/toY` the same way as today. For
     `UNCAPTURE_TILE`, use `x/y` as both from and to.
- Add `settle(commandId: string, settledAt: number): void`. It deletes the
  in-flight entry and sets `cooldownByTileKey` for both `fromKey` and `toKey`
  to `settledAt + BARBARIAN_TILE_REST_MS`. It also sets `lastActedAtByTileKey`
  for both.
- Expose `settle` and `inFlightCount` on `BarbarianPlanner`.

### 1b. Remove the per-player gate for the barbarian

- `ai/system-job-worker-core.ts:134`: move the `hasActiveLock` check *below*
  the barbarian branch, so it only applies to non-barb system players.
- Add a worker message `{ type: "barb_settled"; commandId: string; settledAt: number }`.
  It calls `barbarianPlanner.settle(...)`. Document it in the message list in
  `ai/system-job-worker.ts`.
- `ai/system-command-producer-worker.ts`:
  - For `BARBARIAN_PLAYER_ID`, don't add to `pendingPlayers`. The worker's
    per-tile in-flight tracking is the gate. Other system players keep today's behaviour.
  - In the `onEvent` listener, when `event.playerId === BARBARIAN_PLAYER_ID`
    and the event is `COMBAT_RESOLVED`, `COMMAND_REJECTED` or
    `TILE_DELTA_BATCH` with a `commandId` the producer submitted, post
    `barb_settled`. Track submitted barb command ids in a bounded `Set`; delete
    on settle and expire after `BARBARIAN_INFLIGHT_TIMEOUT_MS`.
  - **File-size gate:** this file is 479 lines. Extract the barb settle
    plumbing into `ai/barbarian-settle-relay.ts`, a small factory with an
    explicit deps interface: `postToWorker`, `now`, and
    `onSubmitted(commandId)` / `onEvent(event)` methods. The producer file must
    end up no longer than it is now.
- On worker respawn (`runtimeInit`), clear the relay's id set. The new worker
  starts with an empty in-flight map; the in-flight timeout covers any stray
  fights.

### 1c. Tests (write first, see them fail)

`ai/system-job-barbarian-planner.test.ts` (extend):

- Four seen barb tiles, each next to a human tile, on a fake clock: four
  commands are issued in four consecutive `choose()` calls with no settle in
  between. Today this fails at the second call.
- **Starvation regression (the bug you saw):** barb A is adjacent to a player
  elsewhere, and barb B is seen with only neutral neighbours. B must be chosen
  within its first two `choose()` calls. Today B is never chosen; this is the
  scratch repro above, turned into a test.
- Idle bound: with 100 seen tiles on a fake clock, every tile issues a command
  at least once per `BARBARIAN_MAX_IDLE_MS`.
- Attack budget: once 12 attacks have been issued inside 60s, the next
  adjacent tile issues an `EXPAND` (walk), not an `ATTACK`.
- Rest starts at settle: issue at t=0, settle at t=30s. The tile is not
  eligible at t=44.9s and is eligible at t=45s. Today it is eligible at t=15s.
- Busy tiles: a tile that is the `to` of an in-flight command is never chosen
  as a source.
- Timeout: an entry with no settle is pruned after 45s, and the tile rests 15s
  from the prune.
- Fairness: with two eligible tiles, the tile that acted less recently is
  picked.

`ai/system-command-producer-worker.test.ts` (or a new
`barbarian-settle-relay.test.ts`): a `COMBAT_RESOLVED` for a submitted barb
command posts `barb_settled`; an event for an unknown command id does not.

---

## Phase 2: wake when a player actually sees the tile

### 2a. Use the real fog-of-war coverage

New file: `apps/simulation/src/runtime-barb-activation-vision.ts`. Move the
barb-activation code out of `runtime-visible-state.ts` (476 lines; it should
shrink).

```ts
export type BarbActivationVisionDeps = {
  readonly barbTerritoryTileKeys: () => Iterable<string>;
  readonly nonBarbarianPlayerIds: () => Iterable<string>;
  readonly isVisibleTo: (viewerId: string, tileKey: string) => boolean; // VisibilityCoverageTracker.isVisible
};
export const computeBarbTilesSeenByAnyPlayer = (deps: BarbActivationVisionDeps): string[];
```

- For each barb tile, the tile is seen if `isVisibleTo(viewer, tile)` is true
  for any non-barb viewer, with an early exit on the first hit. The cost is at
  most 100 tiles × player count map lookups, with no dilation.
- `VisibilityCoverageTracker` already folds in territory radius (tech-scaled),
  FRONTIER halo, town rings, outposts/relay beacons, observatories, watchtower
  temporary reveals and allied vision. It is the same source the client fog
  export uses (`runtime-visibility-classifier.ts:70`).
- Dock reveals are computed per classification, not stored in the tracker.
  Include them in the same PR only if it's cheap: for each player with an owned
  dock, union `collectLinkedDockRevealKeysForOwners`. If not, list them under
  known gaps in the PR description.

### 2b. Recompute on a time floor, not a tile-version signature

The current signature ignores structure and reveal changes. Replace
`getBarbActivationVisionSignature` + `exportBarbActivationVisibleUnion`
with a single `exportBarbTilesSeenByAnyPlayer(): { keys: string[] }`:

- `ensureVisionUnionFresh` (in `system-command-producer-worker.ts`):
  1. Recompute at most every `BARBARIAN_VISION_RECOMPUTE_MS`.
  2. Sort the keys and join them into a string.
  3. Post `vision_union` only when that string changed.
- Keep `onVisionUnionRecomputeThrottled` and the
  `sim_barb_vision_union_recompute_throttled_total` metric. Keep the
  `trackSyncMainThreadTaskWithMetrics` wrapper in `simulation-service.ts`, and
  rename the task label to `system_export_barb_tiles_seen`.
- Delete `BarbActivationVisibilityCache` and the `territoryVersionByPlayer`
  bookkeeping in `runtime.ts:555-557, 2103-2106` if nothing else reads them.
  Grep before deleting.

### 2c. Act toward the player who sees it

A seen barbarian with no player-owned neighbour currently picks any frontier
command, which can walk it *away* from the viewer and out of sight. In the
barbarian planner, when the chosen command is an `EXPAND` into neutral and some
eligible tile has an attack available, prefer the attack. Among neutral
expands, prefer the target with the smallest Chebyshev distance to the nearest
non-barb owned tile within an 8-tile scan of `tilesByKey`. Do this as a
pre-sort of candidate targets passed via an optional comparator in
`chooseNextOwnedFrontierCommandFromLookup`'s options. Don't fork that
function.

**Check before building 2c:** confirm the barb worker receives tile deltas for
human tiles near barbarians (`relevantTileKeys` in the producer). If it
doesn't, 2c has nothing to measure against. In that case, ship 2a/2b and file
2c as a follow-up.

### 2d. Tests

- `runtime-barb-activation-vision.test.ts`: a barb tile 3 tiles from a player
  is not seen with base vision; it becomes seen when an observatory /
  relay-beacon bonus covers it; it becomes seen through an ally's coverage; and
  a FRONTIER-only player tile 2 tiles away does **not** make it seen (today's
  union says it does).
- Producer test: changing coverage without any tile-ownership change still
  causes a new `vision_union` post after the floor. Today's signature misses
  this.
- Keep `system-command-producer-worker.barb-vision-throttle.test.ts` passing,
  updated for the new floor.

---

## Phase 3: the 100-tile cap without freezing

### 3a. Planner (`system-job-barbarian-planner.ts`)

At `ownedTiles.length >= MAX_BARBARIAN_TILES`:

- Run the normal Phase 1/2 path for **seen** tiles (attacks and walks allowed).
- **Additionally**, if there's a free in-flight slot, issue at most one
  `UNCAPTURE_TILE` per plan call. Choose the target from **unseen** tiles
  first, preferring tiles farthest from any seen tile, so players don't watch
  barbarians vanish. Fall back to a seen tile only if every tile is seen.
- Erosion uses the same in-flight/settle path. It is cheap (no combat) and is
  not counted in the attack budget. `UNCAPTURE_TILE` settles on its `TILE_DELTA_BATCH`.

### 3b. Runtime (`runtime-barbarian-walk.ts`)

- In `applyBarbarianWalkOrMultiply`, when
  `barbTileCount >= MAX_BARBARIAN_TILES`, take the walk branch even if
  `newProgress >= BARBARIAN_MULTIPLY_THRESHOLD`. Keep the progress, so the
  barbarian multiplies once it's back under the cap. Emit
  `BARB_ATE_TILE` with `capBlocked: true`. The field already exists, but today
  it's always `false`, because it's only computed in the branch where progress
  is below the threshold.

### 3c. Tests

- Planner at 100 tiles with one seen tile next to a human: within two
  `choose()` calls, one `ATTACK` (from the seen tile) and one `UNCAPTURE_TILE`
  (on an unseen tile) are issued. Today: only `UNCAPTURE_TILE`.
- Walk at cap: a win at progress ≥ 5 with 100 barb tiles leaves the count at
  100 and emits `capBlocked: true`; at 99 tiles it multiplies.

---

## Phase 4: local dev parity

`ai/system-command-producer.ts` (non-worker path) must not have different
barbarian rules.

- Add `SimulationRuntime.chooseBarbarianCommand(clientSeq, issuedAt)`. It
  wraps one long-lived `createBarbarianPlanner` built from runtime-backed deps:
  `tilesByKey` from planner tile views, `resolveOwnedTiles` from the barb
  summary, and the seen set from `computeBarbTilesSeenByAnyPlayer` on the 1s
  floor.
- In `system-command-producer.ts`, route `BARBARIAN_PLAYER_ID` through that
  method. Skip the `pendingPlayers` gate for it, and call
  `runtime.settleBarbarianCommand(commandId)` from the existing `onEvent`
  listener on the same three event types.
- Test: the existing `system-command-producer.test.ts` plus a case where a
  rejected barb command does **not** cause a retry of the same tile within the
  rest window. Today it retries every 0.5s.

If wiring a planner into `runtime.ts` would grow that file (it is far over
500 lines), put the method body in a new `runtime-barbarian-planner-bridge.ts`
and call it with a one-line delegation.

---

## Phase 5: bounded state

Required by `docs/agents/state-and-persistence-discipline.md`:

- Planner: at the top of `choose()`, every `CLEANUP_INTERVAL` (e.g. 60s of
  fake/real clock), drop `cooldownByTileKey` / `lastActedAtByTileKey` entries
  that are expired **and** not in the current owned-tile set.
  `inFlightByCommandId` is already bounded by one entry per barb tile (≤ 100)
  and the timeout.
- Runtime: when a tile leaves `barbarian-1` ownership by any route (uncapture,
  admin clear, season reset), delete its `barbarianTileProgress` entry. Hook
  this at the ownership-change choke point next to `runtime.ts:2103`, not at
  each caller.
- Expose gauges for `barb_cooldown_entries`, `barb_inflight_actions` and
  `barb_tile_progress_entries` through the existing metrics sample
  (`metrics/metrics-types.ts`, `metrics-prometheus.ts`).
- Tests: the maps shrink back after tiles leave barbarian ownership.

---

## Phase 6: docs and changelog

- `docs/game-mechanics.md` §2 barbarian bullets: replace "adjacent to a
  non-barb owner" with the wake-when-seen rule, the 60s idle bound, the attack budget, rest after
  settle and cap behaviour. Fix the threshold (5) and replace the stale
  `file:line` refs with file names only.
- Fix the planner's top-of-file comment, which claims barbarians act
  independently per tile; after Phase 1 that's true.
- `packages/client/src/client-changelog/client-changelog-data.ts`: append one
  entry with `createdAt: Date.now()`, for example: "Barbarians now react as
  soon as you can see them, several can fight at once, and each one rests 15
  seconds after a fight before acting again."
- `README.md`: check whether any part is stale (it likely isn't affected).

---

## Delivery

One PR per phase. The **vision rewrite ships first**, because it's the
performance win the later phases spend. Each PR branches from
`origin/develop`, and each must pass the Phase 0 gate before the next starts:

| PR | Branch | Contains |
| --- | --- | --- |
| 1 | `agent/barb-wake-when-seen` | Phase 0 (bench + baseline), Phase 2, and the "extra savings" items |
| 2 | `agent/barb-independent-actions` | Phase 1 + changelog entry |
| 3 | `agent/barb-cap-no-freeze` | Phase 3 |
| 4 | `agent/barb-dev-parity-and-state` | Phases 4–6, delete this plan |

Every PR must pass `pnpm ci:local` (lint, `check:file-lines`, build, test)
before it's opened.

Client rendering: no new overlays, so the 2D/3D renderer-parity rule doesn't
apply. Barbarian tiles already stream as ordinary tile deltas.

## Acceptance check on staging (after each PR)

1. Seed barbarians with the ops seed command so that 4+ barb tiles each border
   one test account's territory.
2. After PR 2, watch `COMBAT_RESOLVED` events for `barbarian-1`. There should
   be several overlapping fights, not one every ~31s. A barbarian one tile off
   your border should walk within 60s, even while other barbarians are
   fighting elsewhere. No tile should start a new action
   within 15s of its previous one resolving.
3. Build an observatory or outpost so its vision covers a barb 3+ tiles away
   (after PR 1). That barb should act within about 2s of becoming visible.
4. With ≥ 100 barb tiles (after PR 3), the barbarians you can see keep
   attacking, `barb tiles` trends down, and erosion happens off-screen.
5. Run the Phase 0 performance gate: barbarian main-thread time is ≤ the
   baseline, and event-loop lag p95 has not risen.

## Decisions (from the user)

- **"Frozen" means a seen barbarian standing still for more than 60s.** That is
  `BARBARIAN_MAX_IDLE_MS`, and the Phase 1 idle-bound test enforces it.
- **"Seen" means the player's real fog of war.** The user's report (a barb one
  tile off their border, visible, not moving until they touched it) is the
  starvation bug, not a fog-freshness problem. That barb was eligible, but it
  never won the single slot against barbarians attacking elsewhere. Phase 1
  fixes it. Phase 2 additionally fixes the vision sources the old union
  ignored. A separate "barbarians notice you from farther than you can see
  them" radius is **not** planned.
- **No fixed concurrency cap.** It's replaced by per-tile limits plus the attack
  budget (see Tunables), sized so the worst case stays below today's
  barbarian main-thread cost.
