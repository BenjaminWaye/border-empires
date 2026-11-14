# AI Planner

Status: maintained runbook

## Scope

How the AI decision pipeline is structured, how to profile its per-plan CPU
cost, what it actually emits vs. computes, and how to find dead/wasteful work in
it. The planner's steady-state CPU is the AI's baseline load on the single
shared vCPU — it's a direct contributor to login starvation, so keep it lean.
See `staging-login-cpu-contention.md` for the login-vs-CPU story.

## Architecture

- **`ai-planner-worker.ts`** runs in a `worker_threads` Worker (spawned by the
  bridge). Actual planning (`planAutomationCommand`) happens here, off the main
  sim thread. State is kept in-memory and updated via `sync_players` / `tile_deltas`.
- **`ai-command-producer-worker.ts`** is the *bridge* on the main sim thread:
  it owns the tick loop, posts `plan` requests to the worker, and submits the
  returned command. `request_plan_round_trip` (main-thread wrapper) ≈
  `planner_total` (worker-side) — the postMessage transport is cheap.
- **One worker serves all AI players.** The tick loop processes **one player
  per tick**, round-robin with a starvation guard (`ai-tick-fairness.ts`,
  `buildAiTickIterationOrder`). So AI is already staggered — do not "spread the
  AIs out" further; that's done.
- The decision itself is a small utility policy (`ai/utility/decisions.ts`):
  classes are **EXPAND, ATTACK, MUSTER, BUILD_DEFENSE, BUILD_ECONOMY,
  BUILD_BEACON, CHOOSE_TECH, WAIT**. There is **no SETTLE class** (see below).

## Profiling per-plan cost

`sim_ai_planner_phase_ms{phase=...}` (p50/p95/p99) breaks a plan into phases.
Scrape it through an SSH tunnel to the server's loopback metrics port:

```bash
ssh -L 50052:127.0.0.1:50052 deploy@178.105.133.33   # staging; leave open
curl -s http://127.0.0.1:50052/metrics | grep sim_ai_planner_phase_ms
```

Load-bearing phases (do NOT cut — each produces real commands):
- `planner_choose_frontier` + `analyze_iter_total` / `analyze_per_candidate` —
  the EXPAND/ATTACK target scan in `frontier-command-planner.ts`. This is the
  AI's primary action selection. Already bounded (`NARROW_ANALYZE_MAX_CANDIDATES`,
  spatial-focus restriction).
- `planner_total` = sum of the worker-side phases.

Note: `sim_tick_duration_ms{source=ai}` p99 can be much larger than
`request_plan_round_trip` p99 under load — the gap is **CPU-starvation
wall-clock inflation** on the oversubscribed vCPU, not planner code cost.

## What the AI actually emits (grep this to spot dead work)

Emitters: `EXPAND`, `ATTACK`, `SET_MUSTER`/`ADVANCE`, `CHOOSE_TECH`,
`CHOOSE_DOMAIN`, `BUILD_FORT`, `BUILD_ECONOMIC_STRUCTURE`,
`BUILD_SIEGE_BATTERY`, `SETTLE`, `ASSIGN_REFINERY_FIELD`; barbarian planner:
`EXPAND`, `ATTACK`, `UNCAPTURE_TILE`.

The bounded tactical interrupt (`ai-aether-planner.ts`) also emits
`BUILD_OBSERVATORY`, `AETHER_LANCE`, `AETHER_EMP`, `SIPHON_TILE`, `CANCEL_SIPHON`,
`CAST_AETHER_BRIDGE`, `CAST_AETHER_WALL`, `CREATE_MOUNTAIN`, and `REMOVE_MOUNTAIN`.
Worker mode emits `SURVEY_SWEEP` only with a result consumer; the direct fallback
keeps that cast disabled. `REVEAL_EMPIRE` and `REVEAL_EMPIRE_STATS` remain disabled
until their intelligence changes decisions. Tower builds require an installed
AFC module, CRYSTAL capacity, development capacity and a useful visible front.

`ai-tactical-view.ts` projects existing per-player visibility around at most 16
sampled focus origins (at most 1,936 visibility reads), without selecting concrete
targets in snapshot builders. The worker's shared tile cache is filtered through
that player's visibility mask before tactical selection. Tactical scope changes
backfill incrementally without rebuilding territory relevance. Diagnostics include
`tacticalAction`, `tacticalVisibleTileCount`, and `tacticalOmittedOriginCount`.
Known shields are avoided; unseen shields remain authoritative runtime rejections.
Concrete rejected actions expire after 10 seconds or a world revision, and do not
suppress unrelated FOOD producers or free relays.

The gateway owns proactive diplomacy (`proactive-ai-diplomacy.ts`): one AI per
15-second evaluation, at most one offer, existing durable SocialState and responder.
No diplomacy request store is added to the simulation. See
[AI progression review and implementation](../../ai-progression-improvements-plan.md).

Town refineries (territory-development-plan.md Phase 2): `build/refinery-build-planner.ts`
adds refinery and booster candidates to `chooseBestEconomicBuild` (a refinery
build carries `fieldX`/`fieldY`, re-checked with the shared
`chooseRefineryField`), and `refinery-reassign-planner.ts` runs beside the
aether interrupt to emit `ASSIGN_REFINERY_FIELD` for an idle refinery. Both
read only the AI's towns (town-economy keys or build-candidate towns, at most
64) and their support rings, never the whole territory; the reassign pass is
skipped when the cached structure counts show no refinery. Planner tiles carry
the record's `refineryField` (`toPlannerTileView`, `parseEconomicStructure`).
A refinery is never built if its new slots would lift free slots to
`SURPLUS_PRODUCER_MIN_HEADROOM`, the point where FOOD relief switches
refineries off again. Scores: `docs/game-mechanics.md` §11.

`evaluateSettlementCandidate` still classifies frontier tiles; it remains live.

**`SETTLE` is no longer human-client-only** (fixed-borders-via-reach plan):
`BUILD_BEACON`'s `executeClass` branch (`ai/utility/utility-dispatch.ts`)
emits `SETTLE` on a FRONTIER `RELAY_BEACON` site before the build itself can
land — `RELAY_BEACON_SPEC`'s placement rule requires `SETTLED`. There is
still no standalone SETTLE *decision class* (deliberately — see below); this
is the one narrow, purpose-built exception, not a general settle-everything
policy.

## Already-removed dead work (don't re-flag)

- **Settlement-candidate selection** (#953): `choose_settlement` scanned ~1,500
  frontier tiles twice (~453ms p99) purely to feed scoring nudges for a SETTLE
  command the AI never emits. Removed.
- **Discarded training records** (#956): `buildAiTrainingRecord` (sorts full
  owned/frontier arrays) ran every plan even when
  `SIMULATION_AI_TRAINING_RECORD_PATH` is unset (staging/prod). Now gated on
  `aiTrainingRecorder.enabled`.
- **Town-support scans** (#950): the 3×-redundant neighbor scans in
  `chooseBestEconomicBuild` were already optimized into `town-support-lookup.ts`.
  The `townSupportOrigins` filter reads stored `supportMax`/`supportCurrent` and
  is a cheap bounded filter over `buildCandidateTiles` — **not** a removal
  candidate. (Earlier audits wrongly flagged it; verify before re-flagging.)
- **Town-economy view** (`ai/build/town-economy-view.ts`, built by
  `runtime/runtime-town-economy-view.ts`): one support-ring scan per town,
  memoised per cached town-network object and capped at 64 towns. It feeds
  economic synergy scoring (`ai/build/economic-synergy-scoring.ts`,
  `docs/ai-economic-synergy-plan.md`). Keep it on the cached network; don't
  add a map walk.

## How to find dead / wasteful AI code

The one habit: **for every non-trivial computation, name the command it
changes. If you can't, it's a suspect.** Concretely:

1. **Trace outputs to a command.** Follow a computed value forward. If it only
   feeds diagnostics/metrics/scoring-nudges and never flips the chosen command,
   it's dead weight (this is exactly how `choose_settlement` was caught).
2. **Grep command emitters vs. types.** `grep -rn 'type: "X"'` per command type;
   if a type is only constructed by the client (or not at all on the AI path),
   AI code computing for it may be dead; check the tactical and utility emitters.
3. **Compute-then-discard when a flag is off.** Check that a feature flag gates
   the *compute*, not just the output. `buildAiTrainingRecord` was passed as the
   argument to a no-op recorder — the build ran regardless (caught #956).
4. **Unused exports.** From `apps/simulation/src/ai/`, list `^export` names and
   grep each repo-wide (`grep -rlw`, include tests); zero external hits +
   `internal-uses=0` = genuinely dead. Beware: "used only in tests" or "used
   internally" is over-exported, not dead — verify before deleting.
5. **Rank `sim_ai_planner_phase_ms` and interrogate the top phases.** Any
   expensive phase you can't tie to a gameplay output is a suspect.

As of 2026-07-16 the recurring-CPU dead code is spent — remaining finds are cold
(unused types/helpers). Further real gains need structural levers (worker-thread
consolidation, planning cadence), not deletion.

## Known pitfalls

- **The planner's gold income is an estimate; keep it on the rescaled rates.**
  `PlayerRuntimeSummary.goldIncomePerMinute` (`player-runtime-summary.ts`)
  feeds the AI planner view and `/admin/players`; the authoritative figure is
  `buildPlayerUpdateEconomySnapshot`. The estimate kept the pre-
  `GOLD_RESCALE_DIVISOR` (288) per-tier rates, so staging AIs saw ~28 gold/min
  while earning ~0.1/min and their GOLD need read 0 (2026-11-01). It now uses
  the same base constants; `player-runtime-summary.test.ts` pins them together.
  Check gold over time (sample `/admin/players`) before trusting
  `incomePerMinute`.
- **Re-enabling a FOOD-relief beacon needs headroom beyond its own slot.** A
  manually-disabled beacon is excluded from FOOD demand, so the headroom after
  disabling it is exactly the slot it takes back. Re-enabling there lands on
  `supply === demand` (exhausted) and loops; staging ai-10/ai-19 toggled
  `SET_CONVERTER_STRUCTURE_ENABLED` every ~5s for hours (`food-slot-relief.ts`).
- **Read WAIT through its reason, not `vetoedClasses`.** See
  `docs/AI_DEBUGGING.md` "Why WAIT won"; when changing a veto in
  `utility/decisions.ts`, change its mirror in `utility/wait-reasons.ts`.

- **Victory progress must come from world standings, not self-relative
  targets.** `victory-path-scoring.ts`'s heuristic fallback compares an AI
  with itself (towns vs settled/5, 6 tiles of a resource, 3 docks), so every
  AI read as already winning, locked onto its path and reported
  `needVector.VICTORY = 0` (prod season-13, 2026-10-27). The worker producer
  now attaches real progress (`ai-victory-standings.ts`); check a decision
  diagnostic's `victoryPath.source` is `"world"` before trusting its
  progress. The direct (non-worker) planner still uses the heuristic.
- **AIs gang up on a season-victory threat (`ai-victory-focus.ts`).** From
  the same objectives, each leader holding a condition gets focus weight 1
  and one at >=70% progress up to 0.6; every other AI's planner view gets
  that map (never itself) as `victoryFocusTargets`. The frontier scorer adds
  `450 * weight` to that player's tiles for selection only: it is recorded
  as `victoryFocusBonus` and removed by `threatScoreOf` before the score is
  read as pressure (`pressureAttackScore`, path scoring), otherwise a
  leader's lone tile read as a core threat and latched BREAK/WAR. Stalemated
  tiles get no bonus, so they can't pin `enemyAttack`. ATTACK/MUSTER get `+0.35 *
  weight` after the consideration product (never reviving a veto). Weight 1
  also lifts ATTACK's CONTAIN/TRUCE posture veto (mirrored in
  `wait-reasons.ts`). Truce partners and allies are still skipped. Worker
  planner only, like the standings.
- **Food-relief re-enable must target SETTLED tiles.** The runtime refuses
  to enable a structure on any other tile, and the rejection only cools the
  class down for 10s, so a FRONTIER beacon was retried forever (15 of 20 prod
  AIs, 2026-10-27).

- **Relay ocean filtering must retain water inside existing reach.**
  `relay-beacon-command-planner.ts` excludes existing reach from new-coverage
  credit, but must still classify visible water there for
  `markOceanShadowedFog`. Skipping those cells before reading terrain erases
  the ocean barrier and lets nearby coastal relays repeatedly score offshore
  fog as fresh land. Keep coverage eligibility separate from terrain evidence.
  Never use worker `terrainAt` to solve this: the worker lacks the season seed
  and that previously deadlocked exploration. Regression coverage lives in
  `relay-beacon-coastal-reach.test.ts`, including wraparound, inland fog,
  narrow straits, known prizes and bounded lookup work.

- **Own relay beacons keep `MIN_OWN_BEACON_SPACING` apart.** The pending-
  outpost overlap veto only covers beacons still under construction, and a
  build finishes in about a minute; after that a site two tiles along the
  border could win again on fog cells poking past the first beacon's box
  (staging season-40 ai-18: ~25 beacons ringing a 151-tile island). Rules
  live in `relay-beacon-site-rules.ts`. The floor applies only to
  exploration-only sites: one whose new reach holds an unowned prize
  (resource, town, dock, wonder) is exempt, so a relay that only adds a few
  fish tiles still gets built. It counts every own beacon except one being
  demolished or one disabled for any reason other than FOOD relief
  (`inactiveReason: "manual"` on a SETTLED tile — the only place the AI's
  re-enable is accepted), and is set to `OUTPOST_REACH_RADIUS`: a FRONTIER
  site must be inside reach to be settled, so the next beacon in a chain can
  sit at most one radius from the last. There is deliberately no minimum on
  how much new ground a site adds — a chain step along a 3-wide isthmus only
  opens ~15 tiles. Skips show as
  `sim_ai_relay_beacon_site_skipped_total{reason="spacing"}`. Tests that
  need overlapping reach next to a relay use a town as the anchor instead
  (siege batteries hold no reach). Regression coverage: `relay-beacon-spacing.test.ts`.

- **Out-of-reach dock crossings are a planner fallback.** EXPAND is never
  runtime reach-gated (game-domain validation ignores `isInReach`); the
  planner's reach gate in `frontier-command-planner.ts` is AI policy, because
  out-of-reach land can't be settled. Dock tiles are the exception —
  auto-settle exempts town/dock tiles from reach — so the planner defers
  out-of-reach dock crossings and scores them only when the scan finds no
  in-reach neutral target (deferring keeps healthy AIs from hopping docks
  early). Its >150-origin border prefilter must also keep linked docks.
  Gating them outright left saturated-island AIs on WAIT with
  `BLOCKED_NO_REACHABLE_BEACON_SITE`. That label is the generic "has
  frontier, no action" fallback in `automation-action-admission.ts`, not
  proof a beacon was the missing move. Regression coverage:
  `frontier-command-planner-dock-reach.test.ts`.

- **Beacons must be able to bridge the AI's own out-of-reach frontier.** EXPAND
  is never runtime reach-gated, so an AI can hold a wide FRONTIER band outside
  its reach (prod 2026-10-28: ai-9 680 reach / 1,396 owned, ai-5 1,282 / 2,902).
  `estimateNewReachCoverage` only credits unowned land, and legal beacon sites
  are SETTLED or in-reach FRONTIER, so a band deeper than
  `OUTPOST_REACH_RADIUS` left no site and the AI sat on WAIT with
  `BLOCKED_NO_REACHABLE_BEACON_SITE`. `chooseBestRelayBeaconBuild` now falls
  back to a bridge site (most own out-of-reach FRONTIER in its box,
  `BRIDGE_SITE_VALUE`) when no site reaches unowned land. Its in-reach "nested
  site" veto also lets through a band of plain land wider than one box edge
  (`COVERAGE_SLIVER_TILES`); before, an in-reach site needed a prize or fog,
  so an explored map with no resources in range could never be beaconed into.
  Regression coverage: `relay-beacon-frontier-bridge.test.ts`.

- The AI decision-diagnostics buffer (`recordAiDecisionDiagnosticFromPlanner`)
  looks like write-only "record-then-never-read" — but it **is** read via the
  `GetAiDecisionDiagnostics` RPC (`/admin/debug/ai/decisions`). Not dead.
- `frontPosture`/attack-gating thresholds live in
  `automation-strategic-snapshot.ts` and have several branches — read the
  function, don't trust a single restated threshold.
- **Waste-inclusive aggregate counts silently gate unrelated decision classes**
  (staging incident, ai-4/ai-1 permanently on WAIT with gold above cap and a
  ready `economicBuildCandidate`): `expansionOpportunityCount` in
  `utility-dispatch.ts` includes waste-classified plain neutrals (tiles
  `EXPAND` itself refuses via `hasActionableNonWasteExpand`). Any *other*
  decision class that uses it as an "expansion is available, defer to it"
  suppression term (e.g. `scoreBuildEconomy`, at the time) gets suppressed by
  tiles that were never actually available. `expansionOpportunityCount`
  itself is still correct for EXPAND's own linear-signal term, since EXPAND's
  veto already gates the waste-only case first. The lesson generalizes: when
  wiring a new consideration off an existing aggregate field, check whether
  that field's *inclusions* still match the new consumer's definition of
  "available."
  — The original fix was a second field, `nonWasteExpansionOpportunityCount`
  (waste excluded), used only by `scoreBuildEconomy`'s suppression term. That
  field was removed (docs/ai-structure-building-rewrite-plan.md's
  reach-consideration work) once the fixed-borders-via-reach plan made
  `scoreBuildEconomy` stop suppressing on expansion-opportunity at all —
  EXPAND no longer consumes a dev slot and is now reach-capped, so it isn't
  actually competing with a build for the same resource the way it did when
  this incident happened. If a future consideration needs a waste-excluded
  aggregate again, `git log -p -- apps/simulation/src/ai/utility/decisions.ts`
  has the original formula (`Math.max(0, frontierNeutralTargetCount -
  frontierOpportunityWaste) + frontierOpportunityEconomic + ...`).
- **`restrictToFocus`'s unfiltered-fallback silently defeats
  `ai-spatial-focus.ts`'s rotation** (same staging incident): `restrictToFocus`
  (in `automation-command-planner.ts`) widens to the full unfiltered candidate
  list whenever the current focus front has zero overlap with the candidate
  set — by design, so a bad focus never starves the AI entirely. But feeding a
  result found *only* via that widening into `scanFoundActionableCandidate`
  (which drives `ai-spatial-focus.ts`'s unproductive-streak rotation) makes
  every front look "productive" forever, since the widened scan effectively
  re-scans the whole empire regardless of which front is nominally active.
  For a large empire this pins the focus origin on the same dead 256-tile
  window for 10+ minutes (confirmed live: identical `neighborCandidateTotal`
  and `economicBuildCandidate` across 5.5 minutes of polling, well past the
  60-75s soft-expiry). Fixed by tracking whether each `restrictToFocus` call
  relevant to the productivity signal actually had to widen
  (`frontierScanUsedFocusFallback` / `buildScanUsedFocusFallback`) and
  excluding fallback-sourced results from `scanFoundActionableCandidate` —
  command *execution* still uses the widened candidate regardless (finding a
  real, distant candidate and building it is correct), only the "is *this*
  front worth staying on" signal changes.
- **`spatialFocusFront` is never wired into the worker-based AI planning
  path** (`ai-planner-worker.ts` / `PlannerPlayerView`) — it's only computed
  and passed in `runtime.ts`'s direct/non-worker `planAutomationCommand`
  call. Staging runs with `SIMULATION_AI_WORKER=1`, so on staging
  `focusFront` is *always* `undefined` and `restrictToFocus` never actually
  restricts anything — the real EXPAND-stall driver there was origin
  *selection* (see next entry), not focus-front scoping. Check which path is
  active (`SIMULATION_AI_WORKER` env var) before assuming spatial-focus code
  is in effect.
- **`baseFrontierOrigins` is winner-take-all across categories, not a union**
  (`hotFrontierTiles ?? strategicFrontierTiles ?? frontierTiles ?? ownedTiles`,
  `automation-command-planner.ts`): if `hotFrontierTiles` is non-empty
  *anywhere* in the empire (one hostile/strategic-neutral neighbor is
  enough), the narrow scan origin set becomes *only* that hot tile's
  neighbors — every calm/scoutable segment of the frontier is invisible that
  tick, regardless of empire size. Confirmed live: ai-1's narrow scan
  (`neighborCandidateTotal: 8`) evaluated exactly one origin's 8-neighbor
  set, nowhere near a real GEMS resource sitting 4 tiles from its actual
  frontier. The broad-fallback fix (previous entry, this file) recovers this
  *only* when the narrow scan is also unactionable — if the hot origin finds
  *anything* (even a low-value target), the broad fallback's
  `!frontierAnalysisActionable` gate never fires and the rest of the empire
  stays permanently unscanned. Not yet fixed — flagged for follow-up; any
  fix needs CPU-impact analysis per `docs/agents/ai-guardrails.md` before
  broadening how often/far the broad fallback runs.
- **`chooseBestFortBuild`/`chooseBestSiegeBatteryBuild` affordability
  prechecks were tier-unaware** (`structure-command-planner.ts`): they
  hardcoded the base-tier IRON/SUPPLY/gold cost (e.g. 45 iron for FORT)
  regardless of tech, but `runtime-structure-command-handlers.ts` always
  builds the player's *best available* tier via `bestFortTierForTech`/
  `bestSiegeTierForTech` (IRON_BASTION/THUNDER_BASTION, SIEGE_TOWER/
  DREAD_TOWER — up to 4x the base cost). A player with the relevant tech and
  partial resources passed the AI's stale check but was rejected by the
  runtime every time. Confirmed live: ai-5 had 74/74 `BUILD_FORT` commands
  rejected with "insufficient IRON for fort," forever. Fixed by resolving
  the actual tier via the same `bestFortTierForTech`/`bestSiegeTierForTech`
  helpers the runtime uses, before checking affordability. Also: neither
  structure's gold cost actually scales with existing owned count at
  runtime (unlike economic structures) — `ownedStructureCounts`-based gold
  scaling in the AI's old precheck was dead/incorrect for these two types.
- **Staging season-41 expansion stall (2026-11-09)** — 25.5% of land ended
  unclaimed. Evidence came from the staging SQLite snapshot (`commands` +
  `command_results` keep the last ~46h; `world_snapshots` has final tiles).
  Four causes, all fixed in one branch:
  - *Unfundable attacks*: `attackReady` checks the raw manpower pool, but every
    non-barbarian ATTACK is paid from a muster flag within 10 tiles
    (`resolveMusterSource`). ~85k `INSUFFICIENT_MUSTER` rejections; one AI hit
    one tile 1,723 times. `ai-attack-muster-funding.ts` now mirrors the
    runtime rule (floor cost, ignores reservations, fails open when flag data
    is missing) and `utility-dispatch.ts` drops unfunded attack candidates.
  - *Beacon veto*: BUILD_BEACON was vetoed by any enemy tile on the scanned
    frontier, which is empire-wide (hot origins win), so one contested border
    froze beacons everywhere. Now `beaconBlockedByEnemy` = core threat and not
    WAR (`decisions.ts`, also used by `wait-reasons.ts`).
  - *FOOD relief order*: relief switched off a land-holding beacon first, even
    at exactly-full FOOD, and the freed slot went to the next economic build
    (185 AI beacons off, 253 Manufactories on). Free tiers (surplus
    MINE/UMBRITE_RIG, now town refineries, beacons fully covered by other anchors, FOOD-dormant
    consumers) always run; costly tiers (working building, then land-holding
    beacon, then town) only in a real deficit or when a beacon site exists
    with one more FOOD slot (`beaconWaitingOnFood`, a lazy second beacon
    scan). Non-beacon consumers switched off by relief are re-enabled once
    FOOD has a slot to spare (`food-slot-relief-surplus.ts`).
  - *Hydroworks placement*: scored on FOOD need alone; 33/34 AI Hydroworks
    boosted no new Hydrogarden. `build/hydroworks-placement.ts` requires an own
    garden in `HYDROWORKS_RADIUS` that no existing Hydroworks reaches.
  - *No FOOD buying*: resource supply trades (`resource-supply-trades/`) let
    Houses export spare FOOD, and an AI accepts a fair offer, but no AI ever
    asked. `apps/realtime-gateway/src/proactive-ai-resource-trade/` now runs on
    the 15s proactive diplomacy tick: an AI at or below zero FOOD headroom with
    no pending offer asks up to 4 Houses (other AIs first, then human
    neighbours) for 1-3 FOOD slots, paying a surplus resource of at least equal
    daily value or a day's value in coin; 6h per-target cooldown. The AI ends
    its own FOOD purchase after 24h (the sim ignores `supplyDurationHours`, so
    agreements never expire otherwise) to stay under the 16-agreement cap.
    An AI with no FOOD to buy instead sells up to 3 spare upkeep slots (keeping
    2) to a neighbouring player out of them, for a day's value; it ends those
    sales after 24h too (`ai-surplus-sale.ts`).
    Attacking a House ends every supply agreement between the two (sim:
    `runtime-frontier-command.ts` → `RuntimeResourceSupply.cancelBetween`), so an
    AI that attacks its FOOD supplier loses that FOOD. The attack planner does
    not see supply agreements and does not discount suppliers; the AI simply
    asks another House on a later tick. Feeding agreements into the planner
    view would be needed to score suppliers lower.
  Each beacon past the first five costs a FOOD slot, so FOOD supply is the
  real ceiling on AI expansion.

- **House Charges are a fallback objective, not a decision class.** An AI
  House with no ordinary `expansionObjective` (`selectExpansionObjective`)
  steers toward its first unfinished kept charge's target through that same
  field (`house-charges/house-charge-ai-objective.ts`, wired in
  `runtime-state-export.ts`). It is O(kept charges) per planner view with no
  tile scans; it never overrides a real objective. Regression coverage:
  `house-charge-ai-objective.test.ts`.
