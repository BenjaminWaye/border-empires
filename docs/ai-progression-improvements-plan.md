# AI progression, aether, and diplomacy

Status: implemented for review in one feature PR. Owner: agent/ai-progression-review.
The review findings below describe the pre-fix behavior. Implementation scope and
remaining validation are recorded at the end.
This extends the existing utility planner and gateway social state. It does not
replace the AI CPU guardrails or change human gameplay rules.

## Review findings

Production inspection on 2026-10-15 found 81–84% WAIT decisions in two rolling
200-decision samples. Alden and Niko repeatedly received UNCAPTURE_AFC; several
other AIs received insufficient FOOD-slot rejections for relay beacons. These
are current observations, not a claim that every AI has the same root cause.

1. **Worker state loses actionable rules.** `planner-world-view.ts`,
   `planner-world-view-slice.ts`, and `planner-tile-delta-parse.ts` omit AFC
   ownership, town population, and economic-structure `inactiveReason`.
   Consequently `food-slot-relief.ts` can choose a protected AFC town, workers
   cannot pass `nextTownGrowthUpgrade`'s population check in
   `ai-preplan-command.ts`, and recovery cannot reliably distinguish a manually
   disabled structure. Fix initial exports, incremental deltas, and backfills
   together. These are bounded scalar fields, not new world scans.
   Keep cached worker tile references current when a delta arrives before the
   next player-collection sync; do not rebuild every cached territory array.
2. **A recovery action destroys reach without freeing FOOD.**
   `chooseLowValueBeaconToAbandon` deliberately releases one of the first five
   free beacons while admitting that it relieves no slot demand. This can lose
   the reach needed to obtain FOOD. Preserve free beacons; only disable a beacon
   when doing so actually reduces demand, otherwise choose a real consuming
   structure or an eligible non-AFC town as the last resort.
3. **Economic affordability ignores slots.** `canAffordStructure` checks tech,
   gold, manpower and stockpile costs, but not the supplied resource-slot totals.
   Its stockpile checks also retain retired FOOD/TITANIUM/CRYSTAL/UMBRITE build
   costs, so even a zero-slot Hydrogarden is incorrectly unavailable at zero
   FOOD stock. Match `stripRetiredStockpileCost`; preserve SHARD spending.
   Filter impossible builds before scoring; retain zero-slot FOOD producers,
   synthesizer exemptions, and the built-in first-five-beacon exemption. An
   unaffordable first choice must not hide a legal lower-scoring alternative.
4. **Rejection admission is too broad.** `cooldownsForAdmissions` suppresses
   both BUILD_ECONOMY and BUILD_BEACON after any economic slot rejection.
   `actionAdmissionKey` omits economic structure type, and any INSUFFICIENT_SLOT
   can force FOOD relief even when CRYSTAL/TITANIUM/UMBRITE was missing.
   Replace this with action/resource-specific eligibility and selection of the
   next legal candidate. Do not silence failures by relabelling them as a
   missing beacon site. This is included in the combined implementation.
5. **Progression priorities lag the mechanics.** `ai-progression-choice.ts`
   still awards bonuses to retired tech IDs such as toolmaking/cartography.
   Score current unlocks against FOOD supply, manpower generation, coin income,
   exploration and military needs. Slot demand is not consumable FOOD stock;
   `ai-economic-heuristics.ts` and diplomacy's stock/production-based food-crisis
   signal need review against the current slot economy. Preserve research coin
   savings where higher-tier unlocks are the actual way out of a stall.
6. **Aether has no AI execution path.** The AI emits neither BUILD_OBSERVATORY
   nor aether casts. Worker observatories lack cooldown and siphon state, and
   player views lack ability-specific readiness/dormancy. Adding cast scoring
   alone would generate invalid commands. Use the authoritative ability catalog
   (`ability-gating/ability-gating.ts`, `server-game-constants/ability-defs.ts`)
   and runtime handlers rather than duplicated unlock tables.
7. **Diplomacy is reactive.** `seeded-ai-diplomacy-responder.ts` accepts or
   rejects incoming requests, but the simulation utility policy's posture does
   not initiate offers. Social requests, cooldowns and break history live in
   the gateway; creating a parallel simulation alliance store would be wrong.
   `bordersTouchInTiles` also needs wrapped-neighbor coverage before proactive
   border decisions rely on it.

## Implementation sequence

### 1. Restore progress (first slice)

- Preserve AFC owner, town population and manual-disable reason through every
  planner tile transfer; exclude owned AFCs from abandonment.
- Preserve free relay beacons during FOOD recovery.
- Apply runtime-equivalent economic slot prechecks using already-synced totals.
- Add regressions that fail before the fixes, including worker transfer tests,
  legal fallback builds, FOOD-source availability and beacon exemptions.
- Next slice: resource-specific rejection admission, actionable WAIT diagnostics,
  reach/focus rotation and recovery from insufficient mustered manpower.

### 2. Economic and research policy

- Replace retired-ID preferences with current unlock/need scoring and verify
  actual income and manpower changes, not just command counts.
- Reserve enough capacity for the next useful relay; prefer FOOD improvements
  over dismantling infrastructure; allow town tier upgrades only with capacity.
- Evaluate command rejection rates and successful economy growth per AI over
  multi-hour isolated simulations, including low-resource and coastal starts.

### 3. Give the AI aether abilities

- Add a utility action for building an Aether Tower when its CRYSTAL slot,
  manpower, placement and tech requirements are met and tactical value exists.
- Sync minimal tower readiness (owner/status/cooldown/siphon/dormancy), relevant
  visible targets, and authoritative per-player ability eligibility. Do not
  widen the existing shared worker tile cache into global omniscience.
- First casts: **Aether Purge (AETHER_LANCE)** against valuable exposed hostile
  garrisons/border anchors, and **EMP** against a cluster of defenses before an
  attack. Reuse tech gates, wrapped ranges and cooldown modifiers; filter
  allies/truces and known shields. Keep authoritative server validation for
  unseen shields and back off a rejected target without revealing its source.
- Next: **Siphon** to relieve a concrete resource shortage or deny a valuable
  hostile town/resource cluster. Cancel only when the value ends or the tower
  is needed for a stronger action; account for the cooldown starting on cancel.
- **Bridge** toward a known valuable reachable landing; **Remove Mountain** to
  open a useful route; **Wall/Create Mountain** only where they protect an
  important border without cutting off the AI's own supply or expansion.
- **Survey/Reveal/Reveal Stats** must change an actual target/strategy decision.
  Survey results are currently emitted as player messages: wire consumption
  before enabling casts. Avoid spending tower readiness for ignored results.
- Bound target samples and neighborhood work. Cache/index concrete candidates
  by relevant state version; never run whole-world selectors in snapshots.

### 4. Give the AI proactive diplomacy actions

- Add a slow, bounded gateway coordinator that proposes at most one eligible
  truce/alliance per AI per evaluation. It uses existing social request methods,
  persistence, pending-request limits, decline cooldowns and break lockouts.
- **Request a 12h truce** from a threatening neighboring rival when exhausted
  or recovering; use a 24h offer only when long-term peace supports its strategy.
- **Offer an alliance** where shared threats or a realistic diplomatic victory
  justify it. Score bloc leadership and avoid automatically handing victory to
  a stronger neighbor. Feed AI-to-AI offers through the existing responder.
- Reuse stance logic, including staged muster strength and distrust after a
  broken truce. Respect human-controlled seeded identities. No chat messages or
  unsolicited out-of-game notifications are part of this feature.
- On acceptance, sync alliances/truces to the simulation before fanout, as the
  existing responder does. Reconcile failures and restarts through the existing
  social-state lifecycle. Do not introduce a second source of truth.
- Keep voluntary truce breaking out of the first slice; it needs an explicit
  strategic benefit threshold that includes the 24h negotiation lockout.

## Validation and release gates

Each slice needs focused regressions, simulation AI tests and type checking.
Use structural scan-count assertions for large empires. Before opening a PR,
run `pnpm ci:local` and review README drift. Before production promotion, run
the prod-shape gate against an isolated snapshot and compare planner latency,
rejections and *successful* actions to the deployed baseline. In a longer
offline run, track per-AI income, settled towns, techs, reach anchors, manpower
production, WAIT reasons and recovery time after resource loss. A lower WAIT
percentage alone is insufficient: pointless casts and rejected offers are not
progress. Ship each gameplay change with a client changelog entry; do not
describe aether/diplomacy as available until their execution paths are tested.

## Combined PR implementation and limits

Implemented: state fidelity and live cached-tile updates; protected AFC/free-beacon
recovery; runtime-equivalent economic/siege slot and installed-module prechecks; current
tech priorities; FOOD-capacity-aware town upgrades; precise rejection keys and a
10-second retry bound even without ownership changes. Soft resource/lock failures
no longer become permanent admission bans.

Aether: up to three useful towers, gated by incremental CRYSTAL cost, installed
AFC module, manpower and development slots. Casts include Purge, EMP, Siphon,
friendly-target cancellation, known valuable bridge landings, useful mountain
removal, walls and emergency mountain creation against exposed hostile muster
beside a capital/town. Candidates use each AI's own visibility; known shields,
allies, truces, active effects, tower cooldowns, siphon locks and dormancy are
respected. The tactical projection samples at most 16 focus origins and reports
omitted origins and visible tile counts in decision diagnostics. Backfill is
incremental when visibility/focus changes without ownership changes. No new
persistent tactical cache or whole-world selector is added.

Survey results become one expiring objective on the existing worker player
record. The direct planner has no survey-result consumer and therefore never
casts Survey Sweep. Reveal Empire and Reveal Stats remain disabled until their
results feed strategy. No claim of complete ability-catalog coverage is made.

Diplomacy: one AI every 15 seconds, at most one 12h truce or shared-threat alliance
offer. Existing durable requests, cooldowns and responder own the lifecycle.
AI-to-AI acceptance synchronizes the simulation before accepted fanout. Human
claim and gateway shutdown races are covered. No voluntary truce breaking or 24h
proactive offers are enabled. Decline cooldowns now also work without a persistence
sink (previous optional chaining skipped the in-memory update).

Regression coverage includes actual runtime ownership loss, FOOD-slot transfer,
EMP outage, emergency mountain creation and valid tower construction, plus worker
state/backfill, rejection isolation/expiry, current tech IDs, module readiness,
FOOD-gated upgrades, bounded visibility work and real SocialState negotiation.

Multi-hour growth/balance comparisons and an isolated production-shape load gate
remain release validation before production promotion; local deterministic tests
cannot establish that an AI will keep pace with an experienced human. The PR is
for code review and does not deploy or promote the changes.
