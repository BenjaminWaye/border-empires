# AFC Specializations — design and implementation plan

Status: active proposal; client discovery and comparison slice implemented locally
Owner: Benjamin Waye (product decisions); implementing agent (delivery)
Last verified: 2026-10-18
Replaces: domain/Sharding navigation now; progression rules and the thirty-reward catalogue remain proposed

## Read this proposal

- [Thirty upgrades: names, effects, and explanations](afc-specializations-catalog.md).
- [UI specification and introduction](afc-specializations-ui-plan.md).
- [Interactive UI study](design/afc-specializations-preview.html): local sample data, no game connection.
- Current references: [Manifest fiction](manifest-full-plan.md), [galactic lore](lore/galactic-lore.md), [game mechanics](game-mechanics.md), [resource economy](product/resource-and-manpower-economy.md).

## 1. Problem and intended result

Domains are easy to miss and compete with Manifest purchases for Coin. Their
later choices also require Shards. The current catalogue has five alternatives
per tier; the proposed six directions produce thirty upgrades across five tiers.
The goal is an accessible specialization decision at each stage of a campaign,
with visible consequences that support distinct playstyles through the season.

The AFC becomes the physical and administrative home of these decisions.
Manifests acquire individual assets and services; specializations configure how
the expedition coordinates them and which campaign concessions it administers.
Specializations consume none of the eight Manifest-module sockets.

### Naming

| Current/proposed term | Player-facing term | Reason |
| --- | --- | --- |
| Domains / Sharding | **AFC Specializations**; short navigation label **AFC Upgrades** | Connect the choice to a familiar object; reserve Shards for the resource. |
| Domain tiers | **Upgrade tiers I–V** | One choice at each Manifest tier. |
| Vanguard | **Vanguard** | Assault command and exploitation of breakthroughs. |
| Bastion | **Bastion** | Prepared defense and defensive industry. |
| Dominion | **Dominion** | Survey, territorial development, and construction. |
| Exchequer | **Exchequer** | A compact core of exceptionally profitable towns. |
| Oracle | **Oracle** | Aether control and actionable intelligence. |
| Diplomacy | **Chancery**; subtitle **Diplomacy & alliances** | A campaign headquarters department, parallel to the other branch names. |

Do not rename technical IDs merely to change copy. The new catalogue uses stable
IDs such as `afc-vanguard-1`; old IDs remain valid in the old ruleset. See rollout.

## 2. Fiction and scope

The AFC is a fabrication complex, campaign headquarters, and accredited interface
to the Court. Physical retrofits improve its command/fabrication/sensor systems.
Offices installed there administer commercial concessions and Court mandates.
Every upgrade has a specific explanation in the catalogue; neither arbitrary
local building permission nor forgotten technology explains progression.

Reaching a Manifest tier supplies the expedition's operational capacity for one
additional specialization. Installation is included in the campaign's existing
commissioning arrangements: it has no second Coin or Shard charge. The choice
allocates a limited upgrade position among competing roles.

The House keeps its expertise and won holdings. Its previous installations,
local networks, and campaign-specific contracts remain on that planet. A new
campaign lands a fresh AFC and builds its own configuration. These extensions
are proposed lore, not assertions that the current worldbible already says this.

### Campaign-wide configuration, multiple AFCs, and loss

Proposed v1 default: one five-choice configuration per player per season, shown
at every owned AFC. Additional or captured AFCs do not multiply its benefits,
provide extra picks, inherit another House's configuration, or replay grants.

Require at least one active owned AFC for a new installation. Preserve chosen
configuration and already established benefits if the last AFC is lost; other
field systems and registered agreements continue functioning. Rebuilding restores
the same configuration. Do not introduce a surprise mass-dormancy penalty by
switching food concessions off during AFC loss. This loss policy is a proposed
default, not a user-approved new punishment/reward mechanic.

## 3. Decisions and remaining defaults

### Settled by the conversation

- Six branches; five tiers; one free choice per tier, unlocked through tech tiers.
- War Momentum belongs to the launching flag. Garrisoned victories add stacks;
  frontier captures refresh the timer. Moving/replacing/disbanding the flag clears it.
- Breakthrough may award a garrisoned adjacent enemy tile. Start powerful and tune
  afterward. One bonus tile per primary victory; no recursive trigger chain.
- Double the defense **contribution** from factories, not the final multiplier.
- Punishing Ramparts doubles required MP investment against forts.
- Universal Construction stacks with the Relay Beacon speed bonus.
- Founding Charter: first three towns +50% Coin and two fewer FOOD slots each;
  support buildings retain FOOD demand. No additional tier-I population bonus.
- Scarcity grants boosters on all eligible deposits of the least-owned resource,
  with a preview and a useful zero-deposit fallback. Tech-less delivery was
  explicitly reopened; the recommended resolution is below.
- Clearing House doubles its incremental contribution: ordinary +10% per Manufactory
  plus twice the +25 percentage-point Clearing House uplift = +60% per Manufactory.
- Orbital recruitment costs 1 Coin per 5 MP, with no purchase quota. Existing
  overflow-reserve behavior preserves paid MP. Logistics transfer is +50% (recommended).
- Exchequer supports a small Coin powerhouse. Withdraw the empire-wide town MP-cap
  proposal; its capstone must concentrate benefits on its core towns.
- Suppression uses the tower's existing cooldown policy and modifiers, not a
  newly fixed ten-minute timer. Five-minute suppression remains the working duration.
- Oracle reveals exact enemy flag coordinates through fog for Purge targeting;
  it does not reveal staged MP or orders.
- Alliance-size benefits have no gameplay cap. A hostile player-to-player tile
  capture establishes/refreshes bilateral war for 24 hours. Force Truce lasts 12 hours.
- Trade Pact replaces the leadership-weight tier-II reward. Allied links count
  for dock/Harbor Exchange income and their contribution doubles.
- The largest actual territorial member alone wins the diplomatic path.

### Recommended defaults, explicitly not previously locked

| Item | Working proposal and decision boundary |
| --- | --- |
| Meaning of reaching a tech tier | The first **commissioned** Manifest in tier N unlocks upgrade tiers I through N; merely seeing an available card does not. Use highest owned Manifest tier, not tech count or docked module count. |
| Pick ordering / hybrids | Claim the lowest unfilled unlocked tier first. Offer all six branches there. No hidden same-branch prerequisite in v1; show coherent paths without promising exclusive factions. |
| Momentum decay | +5% attack per stack, max three; one stack decays per five minutes without a qualifying capture. A frontier capture only refreshes the timer. |
| Bastion III | **Citadel Reserves:** +25% defense on owned, garrisoned town tiles with an active fort. Withdraw the proposed adjacent-fort halo and invisible HOLD-radius bonus. Tune before release. |
| Exchequer V | **Metropolitan Concession:** first three towns ×2 Coin output; one-time +50% current population in those core towns that are below Metropolis, clamped to their caps. No MP-cap or regen bonus. |
| Scarcity without tech | Deliver finished boosters even without their construction tech; do not unlock future construction or reveal unknown deposits. Ordinary placement/slot requirements still apply. |
| Envoy coefficients | Initial test values per current mutual direct ally: +2 Coin/day, +0.02 MP/min refill accrual, +30 MP cap. No ally-count cap; settle old rates before membership changes. Values need balance validation. |
| Coalition Warfare | +15% attack once, when at least one current ally shares a war with the defender. Do not compound the bonus per ally. |
| Trade reciprocity | Either endpoint's Pact makes a physical allied dock link eligible for both. The Pact owner's allied-link contribution is ×2; the partner's is ×1 unless it also owns Pact. Count each link once; never ×4. |
| Diplomatic capstone | Own land contributes **2×**, matching the original double-territory intent. The earlier `2.5` value is not "double." This affects victory contribution only; leadership uses actual land. |
| Forced-truce integrity | Keep 48-hour caster cooldown. Forced truces cannot be broken via ordinary TRUCE_BREAK; do not extend an already active forced truce on the same pair. Existing in-flight battles finish; new hostile orders stop. |

These defaults make the plan implementable without treating earlier agent
suggestions as confirmed user decisions. Bastion III, Exchequer V, and diplomatic
coefficients are the main product review points; they do not block creating the
catalogue, UI shell, typed contracts, or test fixtures.

## 4. Current implementation seams

Surveyed at `9f91b2d83` on 2026-10-17. Source is authoritative over older prose.

| Seam | Existing entrypoint / required work |
| --- | --- |
| Catalogue and eligibility | `packages/game-domain/data/domain-tree.json`; `apps/simulation/src/tech-domain-bridge/tech-domain-bridge.ts` and its types. Current gate combines prior tier, specific tech, Coin, and resources. |
| Commands and updates | `apps/simulation/src/runtime-progression-command-handlers.ts`; `runtime/runtime-progression-command-context.ts`; shared messages and client-protocol allowlists. |
| INIT parity | `apps/realtime-gateway/src/init-payload/init-payload-catalogs.ts` separately constructs affordability. Route INIT and updates through one ruleset-aware evaluator. |
| AFC placement in UI | `packages/client/src/client-tile-menu-view/client-tile-menu-view.ts`, `client-tile-menu-tabs.ts`, `client-afc-module-tab/`, `client-afc-module-overview/`. |
| Existing domain UI | `client-tech-html/client-tech-html.ts`, `client-tech-panel-flow.ts`, `client-hud/client-hud.ts`, `client-domain-progress-card.ts`, `client-domain-update-handler/`. |
| Naming / navigation | `packages/client/src/client-panel-nav/client-panel-nav.ts` now titles the panel "AFC Upgrades." Desktop/mobile labels and the headquarters icon change together. |
| First-three towns | `apps/simulation/src/economy-network/economy-network-first-three-towns.ts`; preserve eligibility parity with snapshot paths. Current selection is iteration-order based, not explicitly acquisition-time based. Stabilize it across recovery. |
| Trade / economy | `economy-network/economy-network-dock-income.ts`, `economy-network-town-trade.ts`, `player-update-economy/`, `live-town-summary.ts`. |
| Combat / flags | `runtime-combat-support.ts`, `runtime-weapons-factory-mults.ts`, `runtime-frontier-command.ts`, `runtime-muster-tick/`, shared `frontier-combat/` and `structure-costs/`. |
| Towers / targeting | `runtime-aether-lance-command-handler.ts`, `runtime-ability-command-handlers.ts`, `aether-shield/`, client crystal targeting, visibility and both map renderers. |
| Social authority | `apps/realtime-gateway/src/social-state/social-state.ts`, `runtime-alliance-sync-command.ts`, gateway-to-sim social synchronization, `season-victory-objectives/`. |
| AI | `apps/simulation/src/ai/ai-preplan-command.ts`, `tech-domain-bridge/ai-progression-choice.ts`, worker synchronization. |

Oversized integration files already include the bridge (509 lines), tech HTML
(696), and HUD (936). Extract cohesive modules before changing them; make each
oversized file net smaller. The tile-menu view is 481 lines: use the existing AFC overview entrypoint; do
not add a nested tab. No formatting compression or broad casts.

## 5. Implementation sequence

Each phase needs its own reviewable PR, relevant tests, and a player-visible
changelog entry when behavior changes. Do not expose placeholder rewards as active.

### Client discovery slice — implemented on this branch

The existing paid catalogue now has a standalone AFC Upgrades entrypoint, tier
browser with Previous/Next buttons, inline mobile comparison, desktop detail column, and a direct overview
link on owned AFCs. Clickable ready badges use current affordability and the
correct projection above active owned AFCs in both renderers; the global count
remains visible offscreen. No extra AFC tab is introduced. Routine HUD updates
keep unchanged controls mounted. This slice preserves existing costs and server
commands; the free picks and thirty new effects below are not active yet.

### Phase A — catalogue, contracts, and ruleset foundation

1. Introduce an explicit typed specialization catalogue: stable ID, branch, tier,
   title, mechanical summary, lore explanation, effect discriminant, passive/active/
   one-shot category, and ruleset version. Keep effect names out of player copy.
2. Model five selected IDs at most; derive available tier and ready count using a
   shared pure evaluator. Preserve tech/Manifest pricing; set new pick cost to zero.
3. Reuse CHOOSE_DOMAIN as a compatibility command initially, with typed ruleset
   validation. Tighten the touched `any`-based domain-update/catalog boundary.
4. Implement atomic, idempotent choice + one-shot outcomes. Retried commands,
   reconnect, reload, AFC replacement, and capture must never repeat grants.
5. Pin catalogue/ruleset per season; deliver version in INIT and updates. The
   current module-level singleton catalogue needs extraction before two versions coexist.

### Phase B — passive modifiers and truthful previews

Implement straightforward combat/build/reach/tower/economy modifiers first.
Use one computation for actual results, previews, breakdowns, AI, and automation.
Factory defense doubles only the contribution; fort cost modifies the commitment
floor **and** odds baseline, so mandatory extra MP does not buff the attacker.
Beacon speed is ×3 then ×2 = ×6. Reach changes reconcile existing anchors and
visibility through authoritative hooks, not only newly built anchors.

First-three-town membership must be deterministic across recovery. Preserve a
bounded ordered core list (max three active members) or a persisted acquisition
ordering, with deterministic backfill after loss; reuse it for all consumers.
Decide and test ownership-transfer behavior instead of relying on Map insertion order.

### Phase C — one-shots, flags, and fort wards

Implement Scarcity, resettlement, orbital recruitment, per-flag momentum,
Breakthrough, and Unbroken Line in small feature-owned modules.
Compute Scarcity eligibility at commit and return the actual affected tiles;
preview changes caused by concurrent state updates must be explained.
All free construction follows normal completion, slot, dormancy, and ownership hooks.
Persist rolled Breakthrough target/result; do not reroll during replay. Apply
normal capture side effects, protections, social checks, and encirclement once.
Ward consumption occurs only for an otherwise successful attack; rebuilding or
transferring the fort must not reset an already consumed charge's 24-hour timer.

### Phase D — Oracle, trade, diplomacy, and cross-service authority

1. Add masked server-authorized flag detections, immediate invalidation on coverage
   or ownership change, client hit targets, and Purge eligibility for detected coordinates.
   Never send full hidden tiles or full muster JSON to represent a detection.
2. Add suppression as a durable ability; use existing tower readiness/cooldown,
   dormancy and siphon checks. Bypass the target tower's own protection for this
   action; Aegis Dome protection still blocks it. Restore normally at expiry.
3. Extend physical dock-link eligibility and contribution math for Pact. Membership,
   link capture, support-building loss, and diplomacy changes invalidate relevant caches.
4. Record one latest hostile-capture timestamp per player pair. Both flags and
   direct attacks use the same war definition; peaceful abandonment/expansion does not.
5. Keep forced-truce authority with the gateway social store. A durable request/
   acknowledgement bridges simulation ability eligibility to gateway truce creation,
   then synchronizes enforcement back to simulation. Retry with an idempotency key;
   settle the 48-hour cooldown only on durable success. No independent second truce store.
6. Weight each owner's tiles once for victory contribution. Preserve actual-land
   leadership, the current victory threshold, hold duration, and single winner.

### Phase E — client introduction and AI behavior

Deliver the [UI specification](afc-specializations-ui-plan.md) with a complete
vertical slice before broad rollout: tier unlock → notification → inspect →
commit → authoritative update → visible effect → reconnect.
Add short explanations to the AFC overview, Manifest milestone headers, and
relevant town/flag/fort/tower/social breakdowns. Remove the shard-funding tutorial
from this experience; shard collection and monument spending remain available.

AI should claim available free upgrades, maintain coherent preferences with room
to respond to geography/enemies, and understand new active commands. Weight
choices from existing summaries; never call heavy selectors from snapshot builders.
Add broad branch-use diagnostics and valid target selection for recruitment,
suppression, truce, and observed flags. Feature completeness includes the worker path.

### Phase F — verification and seasonal introduction

Deploy new code/catalogue disabled for the active old season. Activate the complete
ruleset for a new staging season, then a new production season through the normal
release process. Do not perform a rollover or deployment as part of this planning task.
Keep existing selections, Shards, spent currencies, and old rules intact in the
active season; no guessed old-to-new ID mapping or retroactive one-shot awards.
Do not take away completed resettlement, construction, captures, or paid recruitment
on rollback: restore a compatible version supporting the persisted new ruleset.

Before release update canonical mechanics, Manifest/AFC docs, lore, README,
player guide, AI runbook, and release notes. Document that Shards now fund monuments;
additional shard projects are a separate proposal, not a hidden dependency here.

## 6. State and performance requirements

- Chosen upgrades max five per player; one-shot receipts max five. No per-command
  history in checkpoints. Use existing bounded command replay handling.
- Momentum is three stacks plus one expiry per active flag; remove with the flag.
- Ward recharge state is tile/fort-scoped and survives rebuild exploits; retain only
  live wards and unexpired consumed charges. Expire orphan records deterministically.
- War pairs expire after 24 hours, have a configured hard storage bound and expiry
  pruning, and expose gauges/eviction counters. Unlimited ally benefits do not require
  unlimited historical event storage or grant per-event income.
- Suppression stores one effective expiry per tower; no cumulative cast log.
- Flag detections are derived recipient-filtered state with an enforced per-view
  limit; spatial indexes invalidate them. Never scan every tower × every tile per tick.
- Scarcity is one player-local operation, not a repeated full-world scan. Trade
  computations use existing physical link indexes and versioned economy summaries.
- Apply [state discipline](agents/state-and-persistence-discipline.md), [AI guards](agents/ai-guardrails.md), and [economy verification](agents/testing-and-debugging.md).

## 7. Acceptance and verification

- Tier access is server-authoritative, survives reconnect, costs no Coin/Shards,
  and never awards two choices for one tier. Skipped tech tiers bank earlier picks.
- All thirty rewards have mechanical and lore copy; proposed defaults are resolved
  before their effects ship. No inaccessible widget is their only visible manifestation.
- Regression tests assert numeric results with and without each modifier, not only
  wire fields. Test factory baselines, FOOD demand, Clearing House uplift, refill
  accrual, paid overflow, cost/odds interactions, and accurate daily-income previews.
- Command/replay tests cover one-shot duplication, simultaneous captures, random
  result replay, flag replacement, ward rebuilds, invalid targets, and clock expiry.
- Integration tests cover gateway truce persistence/restart, war synchronization,
  INIT/update parity, masked detections through fog, Purge, and both client layouts.
- Render overlays, detected flag markers, ready-AFC markers, ward and suppression
  states in **both 2D canvas and true 3D**. Confirm both `isTrue3DRendererActive()`
  branches before reporting parity; include keyboard/touch paths and reduced motion.
- Storybook fixtures: locked, ready, pending, selected, rejected, no AFC, captured AFC,
  no eligible one-shot targets, all tiers filled, large names, narrow phones, and six
  candidates. Verify visually rather than relying on HTML-string tests alone.
- Structural performance tests bound graph/coverage scans and checkpoint size;
  restart/replay tests verify outcomes, pair TTLs, and first-three membership.
- Run focused package tests, then `pnpm ci:local` before any implementation PR;
  check GitHub CI and changelog gates. Use the normal prod-shape/staging procedures
  before eventual promotion, including a representative old-season fixture.
- Observe tier adoption, time-to-choice, branch distribution, Coin/MP outcomes,
  Breakthrough expansion, first-attack wards, forced-truce uptime, and coalition
  contribution. Keep the deliberately strong Breakthrough configurable for tuning.

This branch includes the discovery/interface slice above and the revised local
study. It does not activate free Manifest-tier choices, implement the thirty new
rewards, deploy, or change seasons. Those remain the phased implementation below
the client slice and require their own gameplay and recovery verification.
