# Border Empires — Game Mechanics Reference

Status: canonical reference

Canonical "how the game actually works" reference for agents working on AI, gameplay, balance, or anything that needs grounded knowledge of the rules. Surveyed 2026-05-14 against the rewrite stack (`apps/simulation`, `apps/realtime-gateway`, `packages/shared`, `packages/game-domain`, `packages/sim-protocol`, `packages/client-protocol`, `packages/client`). The legacy `packages/server` stack was removed in commit `ec4614d` (PR #264); only the rewrite is authoritative.

For the design-level view (loops, pacing, sources/sinks, retention), see `docs/core-loop.md`.

When something here drifts from code, fix the code reference and update this doc in the same branch. Cite file:line for every non-obvious claim.

---

## 1. Map and spatial structure

- **Coordinate system**: square grid, integer `(x, y)`. World wraps on both axes at `WORLD_WIDTH` × `WORLD_HEIGHT`. `packages/shared/src/exposure/exposure.ts:5-10`
- **Neighbors**: 4 cardinal directions (N, E, S, W) only. No diagonals for gameplay. `packages/shared/src/exposure/exposure.ts:5-10, 65-66`
- **No chunk/region grid exists.** The world operates per-tile. Tile metadata can carry cluster tags (`FERTILE_PLAINS`, `TITANIUM_HILLS`) but those are not aggregation structures. `packages/shared/src/types.ts:7, 439-444`
- **Terrain types**: `LAND` (claimable, passable), `SEA` / `COASTAL_SEA` (barrier, not claimable; combat blocked except via dock links/aether bridges), `MOUNTAIN` (barrier, mutable via aether abilities). Only `LAND` is claimable. `packages/shared/src/types.ts:1, 15, 200`
- **Fog of war**: per-player visibility. Tiles carry an optional `fogged` flag. Observatory (Aether Tower) structures extend vision radius and shield their OWNER's tiles (never unowned or third-party land) within `OBSERVATORY_PROTECTION_RADIUS` from hostile tile-targeted Aether abilities -- Aether Purge, Aether EMP, Create/Remove Mountain and Aether Bridge landings -- while active, off cooldown and not dormant. Enforced in the simulation against full world state (`isTileShieldedByEnemyObservatory`), so a tower the caster can't see still blocks. Siphon has its own owner-tower rule (`isCoveredByOwnersActiveObservatory`). `packages/shared/src/types.ts:203`, `packages/game-domain/src/server-game-constants/server-game-constants.ts:49-51`
- **Siphon (Observatory siphon mode)**: casting Siphon (tech `logistics`) on an enemy town/resource tile locks the caster's nearest ready Observatory into *siphon mode* (`observatory.siphon`) and stamps every enemy town/resource tile in the 3x3 with a `sabotage` that points back at that tower (`observatoryTileKey`). While it lasts: drained towns produce nothing, and each drained RESOURCE tile's slots count toward the caster's slot supply instead of the owner's (same resource, same count incl. the owner's boosts), so the owner's newest structures may go dormant and the caster's may wake up. There is no timer. It ends when the caster sends `CANCEL_SIPHON` from the tower, the victim gets an Observatory ACTIVE whose protection radius covers a drained tile (building or re-enabling one), the caster's tower stops being an active tower they own (destroyed, captured, removed, switched off), or a drained tile changes owner. Tiles their owner already covers with an active Observatory can't be siphoned. A tower in siphon mode can't cast other abilities; its 10-min cooldown starts when the siphon ends. `PURGE_SIPHON` stays rejected — the victim's counter is an Observatory. `apps/simulation/src/runtime-siphon-command-handlers.ts`, `apps/simulation/src/siphon-mode/`, `packages/shared/src/siphon-mode/siphon-mode.ts`
- **Docks**: Maritime Supremacy counts settled dock tiles. Docks are also used for cross-island movement and linked-dock vision.

## 2. Players and factions

- **Towns are exclusively world-generated — zero are player-founded.** World gen seeds `max(70, 180 * worldScale)` unowned/neutral towns across the map at season start (`packages/game-domain/src/server-worldgen-towns.ts:50`), each already at some `populationTier` with a `MARKET`/`FARMING` type. A player only ever *acquires* one of these pre-existing town tiles (SETTLE if it's still neutral, ATTACK if another player holds it); there is no command that creates a town where none existed. The one other town record a player ends up with is their single free starting SETTLEMENT-tier tile, and that's fabricated by the *system's* spawn/respawn assignment (`apps/simulation/src/runtime-respawn-helpers.ts:168`), not by any player action. See §4's SETTLE note for why SETTLE itself can't create a town from bare land.
- **AFC landing site**: a fresh spawn/respawn (and the pre-AFC migration grant) lands its Automated Fabrication Complex only on a tile with no water (SEA/COASTAL_SEA) on any of its 8 neighbours, falling back to any tile only if none qualifies (`hasWaterNeighbor` in `packages/game-domain/src/server-worldgen-fair-spawn-sites.ts`). On landing, mountains in the 3x3 footprint are flattened to LAND and forest is cleared from all 9 tiles (`apps/simulation/src/afc-landing-footprint/afc-landing-footprint.ts`). The forest clearing is not persisted: both simulation and client re-derive it from `tile.afc` (`packages/shared/src/forest-terrain/forest-clearing.ts`). Visually, while the viewer's own join drop is still hiding the AFC, both renderers keep drawing the original footprint mountains and forest, so they vanish at touchdown (`packages/client/src/client-afc-join-drop/client-afc-join-drop-state.ts`); other players' AFC footprints change immediately.
- **AFC landing clears barbarians**: right after the footprint is prepared (and before the AFC tile is written), every barbarian-owned tile inside the new AFC's land-gated reach disk (`TOWN_REACH_RADIUS`, 3) is released to neutral, using the same release shape as a barbarian walk, so the AFC's reach grant then auto-claims it FRONTIER like any neutral ground. Tiles with a combat lock or pending settlement are skipped. Applies to the fresh-spawn and both respawn paths, not the pre-AFC migration grant. Logged as `afc_landing_barbarians_cleared` (`apps/simulation/src/afc-landing-footprint/afc-landing-barbarian-clear.ts`). Placement itself: barbarian tiles are `SETTLED`, so the 50-tile strict passes already keep clear of them; the 20- and 10-tile relaxed passes additionally prefer a site with no barbarian within `BARBARIAN_SPAWN_AVOID_RADIUS` (5), and the final 0-distance pass and last resort do not, so a spawn is never refused over barbarians (`apps/simulation/src/spawn-placement/barbarian-proximity.ts`).
- **Barbarians hold no reach anchors**: `gatherReachAnchors` and the activate/deactivate diffs in `apps/simulation/src/runtime/runtime-reach-anchors.ts` skip every `barbarian-*` owner. A barbarian that captures a player's town, dock or outpost keeps the structure but projects no reach, and never writes a reach-border slot, so it can't contest a player's reach. (Before this, such a barbarian town defended its disk against a nearby AFC and cut away the overlapping reach tiles.)
- **Player count**: no hard limit. AI players are flagged `isAi: true` in the player definition. Prod first season is seeded island-heavy with 5 AI players. `packages/shared/src/types.ts:376-413`
- **No civ/faction asymmetry**. Every player shares the same stat-mod fields (`attack`, `defense`, `income`, `vision`), the same tech tree, and the same ability catalog. Differentiation is per-player via tech progress and strategic-resource control, not faction baselines. `packages/shared/src/types.ts:387-388`
- **Barbarians (rewrite model, post-`f5ba210` / PR #256)**: not dynamic agents. Implemented as **tiles owned by player `"barbarian-1"`**, with 80 FRONTIER tiles seeded at world gen far from player spawns (`apps/simulation/src/season-seed-world.ts`, `seed-state.ts:183`). Behavior:
  - **Player-facing name: "Planetary Defense"** (`PLANETARY_DEFENSE_DISPLAY_NAME` in `packages/shared/src/player-display-name.ts`) — the remnant of the planet's own defense force after it was prepared for the planetary games. Internal ids/code stay "barbarian". The client shows dark-grey-armored soldiers patrolling each of its tiles (`client-map-3d-planetary-defense-overlay.ts`, 2D: `client-map-render-planetary-defense-overlay.ts`), and its side of any battle squad uses the same armor tint.
  - **Wake when seen**: a barb tile may act only while some non-barb player can see it in their fog of war (`computeBarbTilesSeenByAnyPlayer`, `apps/simulation/src/runtime-barb-activation-vision.ts`, which reads the same coverage the client's fog is built from: territory radius, FRONTIER halo, town rings, outposts, observatories, watchtower reveals, allied vision). Unseen barbs cost nothing.
  - **Independent tiles**: each seen barb tile takes its own turn (`apps/simulation/src/ai/system-job-barbarian-planner.ts`). The tile that has waited longest goes first and is analysed on its own, so an ATTACK elsewhere never hides another tile's walk. A tile has at most one action in flight, then rests `BARBARIAN_TILE_REST_MS` (15s) counted from when the action **settles** (combat resolved / claim resolved / rejected), not from when it was issued. A seen barb tile should never stand still for more than about a minute.
  - **Attack budget**: all barbarians together may start at most `BARBARIAN_ATTACKS_PER_MINUTE` (12) attacks per rolling minute (attacks cost ~15ms of sim main thread each, walks ~0.5ms). A tile that wants to attack with the budget spent walks into neutral land instead.
  - **Walk / multiply**: when a barb tile wins an ATTACK/EXPAND (vs a player), per-tile progress accumulates in `SimulationRuntime.barbarianTileProgress`. Progress gain: +2 if the target tile held a resource / town / fort / dock / siege, otherwise +1 (`barbarianProgressGain`, `runtime-barbarian-walk.ts`). At `BARBARIAN_MULTIPLY_THRESHOLD` (5) the source tile stays barb (multiply); below it the source releases to neutral (walk). Progress is dropped when a tile leaves barbarian ownership by any route.
  - **Territory cap**: `MAX_BARBARIAN_TILES` (100). At the cap a win walks instead of multiplying, and the planner alternates between normal actions for seen tiles and releasing a tile nobody can see (`UNCAPTURE_TILE`), so barbarians in view keep moving while the faction shrinks.
  - **Clearing them with a flag**: a human muster flag on ADVANCE clears hostile tiles within **10 steps** of itself, where a step moves through the owner's own land or neutral land (water, mountains and other players' land block the way, so an enemy across a lake or behind a range is out of range even if close in a straight line; a dock or aether-bridge crossing counts as one step). Hostile means barbarians and any other player who is not an ally or truced (those are never targets, and are not a road either). Enemies touching its territory are attacked (up to 3 fights at once, launched from owned tiles within 10 steps through its own land); ones that don't are approached by expanding across neutral land toward the nearest (a barbarian wins a tie). Once something hostile has been engaged and nothing is left in range, the flag returns to HOLD and an `AREA_CLEARED` entry lands in the player's event log / Activity Feed. Human flags fire on a 1s ticker (`tickWatchedMusterTiles`); AI flags stay on the 30s territory-automation sweep. See `apps/simulation/src/runtime-muster-tick/muster-advance-fire.ts` and `muster-advance-clear.ts`.
  - **March length cap**: a MARCH target must be within `MUSTER_MARCH_MAX_DISTANCE_TILES` (15) tiles of its flag (toroidal Chebyshev). The client shows advice instead of sending a longer one ("raise a muster flag closer: troops take much longer to walk across the map than it takes to muster next to the fight"); the server rejects it with `MUSTER_MARCH_TOO_FAR` and the same text as a backstop. Flags set before the cap existed keep their order until they go stale.
  - **Muster search cost**: MARCH ranks routes with a flood from the target (`muster-march-pathfinding.ts`) that stops once it reaches the flag; this runs every tick a flag is not on cooldown, so keep it bounded and allocation-light (a short march is ~1ms, a 15-tile one ~3ms).
  - **Combat economics**: barbarians bypass coin and manpower gates (`runtime.ts:1263, 2793`) and are treated as a system actor by the planner.
- **Legacy constants still present, mostly unused by the rewrite**: `BARBARIAN_OWNER_ID`, `BARBARIAN_TICK_MS`, `MIN_ACTIVE_BARBARIAN_AGENTS`, `BARBARIAN_MAINTENANCE_INTERVAL_MS`, `BARBARIAN_MAINTENANCE_MAX_SPAWNS_PER_PASS` (`packages/game-domain/src/server-game-constants/server-game-constants.ts:9-37`) and the `BarbarianAgent` type (`packages/shared/src/types.ts:458-465`) are legacy-flavored. Treat them as stale unless you find an active call site.

## 3. Resources and economy

For detailed live rules and a code-owner map for manpower, resource slots,
coin, and dormancy, use [`product/resource-and-manpower-economy.md`](product/resource-and-manpower-economy.md).
The older manpower-economy rewrite plan is historical rationale, not a source
of executable rules.

- **Resource model**: tile resource kinds and player-economy resources are distinct. FOOD, TITANIUM, CRYSTAL, and UMBRITE power global resource-slot pools rather than being stockpiled currencies; SHARD does not use slots. See the focused economy reference for supply, demand, and converter rules. `packages/shared/src/structure-slots/structure-slots.ts`
- **Coin and support**: coin is passive per-minute income and is rescaled by `GOLD_RESCALE_DIVISOR = 288`; town/network and structure modifiers apply in the simulation economy module. An unfed town produces no coin until its separate support system recovers. Coin above a town-linked cap is lost. `packages/game-domain/src/server-game-constants/server-game-constants.ts`, `apps/simulation/src/player-update-economy/`
- **Manpower**: cap and regeneration come from the starting capital, towns, terrain, and qualifying structures/networks. The current tier values, diminishing town weighting, and action costs are in the focused economy reference and `packages/shared/src/config.ts`.
- **Slots and dormancy**: structures occupy resource slots from build start through removal. A shortfall automatically makes the newest relevant consumers dormant first; this is not periodic resource drain. `apps/simulation/src/resource-slot-view/resource-slot-view.ts`

## 4. Units (intentionally absent)

There are no unit pieces. Combat is **tile-ownership transitions**:

- **ATTACK**: origin is owned by attacker, target is owned by an enemy. Manpower cost varies (`ATTACK_MANPOWER_COST`-family constants, modified by fort presence and breach-shock state). Combat resolves after `COMBAT_LOCK_MS` (phase lock). Winner takes the tile.
- **EXPAND**: origin owned by attacker, target is neutral. Ownership transitions after `FRONTIER_CLAIM_MS`. `packages/shared/src/config.ts:44`
- **SETTLE**: target must ALREADY be owned by the caller and `ownershipState === "FRONTIER"` (i.e. previously claimed via EXPAND, not neutral) — rejected `SETTLE_INVALID` otherwise. Costs `SETTLE_MANPOWER_COST` (20) + coin, resolves after a timer, then flips the tile to `ownershipState: "SETTLED"`. Critically, it does **not** fabricate a town: `resolvePendingSettlement` only carries a `town` record forward if the tile already had one (`...(latest.town ? { town: latest.town } : {})`, `apps/simulation/src/runtime/runtime.ts` in `resolvePendingSettlement`) — settling bare frontier land with no pre-existing town produces plain SETTLED land, not a town. `packages/shared/src/config.ts:92`
- **Nothing "builds" a town or settlement, and no player command creates one from scratch.** The only ways to *end up owning* a town are: (1) EXPAND then SETTLE onto a tile that already carries a `town` record (almost always one of the neutral towns world gen pre-placed — see §2), or (2) ATTACK an enemy-owned town tile, which likewise transfers the existing town record rather than creating a new one. The one town every player has without doing either is their single free starting SETTLEMENT-tile, and even that is assigned by the *system's* spawn/respawn code, not a player action (`apps/simulation/src/runtime-respawn-helpers.ts:168`). Once owned, a town can *grow* through population tiers over time (SETTLEMENT → TOWN → CITY → GREAT_CITY → METROPOLIS, `packages/shared/src/town-growth/town-growth.ts`) based on food/resources/upkeep — passive growth, not a build action. `packages/shared/src/structure-registry/structure-registry.ts` is the actual buildable-things registry (Relay Beacon, Fort, Dock, etc.) — towns/settlements are never in it.
- Movement is implicit. Frontier actions originate from any adjacent owned tile, or from dock-linked tiles, or from aether-bridged tiles. `packages/game-domain/src/index.ts:20, 171-257`, `packages/shared/src/types.ts:415-421`

## 5. Structures

- **One structure per tile** (mutex). Must be placed on a `SETTLED` tile owned by the builder.
- **Categories**:
  - Economic: Farmstead, Umbrite Rig, Mine, Granary, Mintworks, Bank, Synthesizers (Umbrite/Titanium Works/Crystal), Fuel Plant, Trade Nexus, Foundry, Governance (Governor's Office, Garrison Hall, Customs House, Radar System).
  - Military: Fort, Siege Battery, Observatory.
  - Monuments (late-game, ultra-high cost, built in 4 stages with shard cost): Imperial Exchange, World Engine, Aegis Dome, Astral Dock.
- **Unlocks**: tech-gated. Costs scale incrementally or exponentially with existing count, in coin + strategic resources.
- **Selection (AI)**: `build_economic_structure` scores per tile by:
  1. Resource on tile (FARM → FARMSTEAD, etc.)
  2. Player need (low food coverage → Granary; weak economy → income structures)
  3. Adjacency (Foundry's 10-tile output multiplier radius; town support reach)
- References: `packages/game-domain/src/server-game-constants/server-game-constants.ts:20-58`, `packages/shared/src/types.ts:279-286`, `packages/shared/src/structure-costs/structure-costs.ts:18-96`, `apps/simulation/src/ai/structure-command-planner.ts:129-250`.

## 6. Tech and research

- **Tech tree**: DAG with prerequisites; tier-based. Tree config is per-season (serialized config ID), so tech contents can vary across seasons.
- **Effects**: each tech can unlock structures, grant stat mods (`attack`, `defense`, `income`, `vision` multipliers), or grant ability access.
- **Research**: one tech at a time per player. Completes instantly on purchase (cost in coin only) — no research timer (`researchTimeMult` was removed as a dead effect, docs/manpower-economy-rewrite-plan.md §23.1).
- "Domination income" is a misnomer in earlier docs — there is no income mechanic tied to domination. Town Control is a victory *path*, not an income modifier.
- References: tech tree data lives at `packages/game-domain/data/tech-tree.json`; the bridge that scores tech selection in the AI lives at `apps/simulation/src/tech-domain-bridge/tech-domain-bridge.ts`. Player-stat type: `packages/shared/src/types.ts:389`.

## 7. Victory conditions

Five concurrent victory paths, all per-season, all with a 24-hour hold requirement:

| Path | Trigger | Hold |
|---|---|---|
| `TOWN_CONTROL` | Control ≥50% of towns | 24h |
| `ECONOMIC_HEGEMONY` | Lead world income/min by ≥33% **and** produce ≥200 coin/min | 24h |
| `RESOURCE_MONOPOLY` | Control ≥80% of tiles of one resource type | 24h |
| `MARITIME_SUPREMACY` | Control ≥55% of world docks, with a minimum target of 3 docks | 24h |
| `DIPLOMATIC_DOMINANCE` | Your alliance bloc controls ≥66% of claimable land, and you are its largest member | 24h |

Strategic phases that emerge from the AI planner: opening expansion, mid-game economy, late-game warfare or path pivot. AI may switch primary path mid-game if a better one scores high enough. `packages/game-domain/src/server-game-constants/server-game-constants.ts:187-218`, `apps/simulation/src/ai/automation-strategic-snapshot.ts:305-322`

## 8. Diplomacy

- **Truces**: two-player non-aggression pacts. 12h or 24h duration. Tracked in `SocialActiveTruce` (start/end, creator) in the realtime gateway's social state, not the simulation. Breaking a truce early (`TRUCE_BREAK`) locks the breaker out of requesting or accepting any new truce for `TRUCE_BREAK_LOCKOUT_MS` (24h); the other party is unaffected. Seasonal AI truce targets exist (recent commit `fee1f72`). `apps/realtime-gateway/src/social-state/social-state.ts`, `packages/game-domain/src/server-game-constants/server-game-constants.ts:26-27`, `packages/shared/src/types.ts:129-147, 50-67`
- **Alliances**: mutual `allies` membership on each player. Frontier validation rejects attacks against allies.
- **War declarations**: implicit — any frontier action against a non-allied, non-truced player is hostile. No formal declaration step.
- **AI negotiation today**: reactive only. The planner respects truces and alliances; it does not initiate offers. Front posture (`BREAK` / `CONTAIN` / `TRUCE`) modulates aggression but does not generate truce requests. `apps/simulation/src/ai/automation-strategic-snapshot.ts:368-381`

## 9. Seasons and world events

- **Seasons**: time-bounded game instances with `startAt`, `endAt`, `worldSeed`, `techTreeConfigId`, `status`. Single shared season across all players. `packages/shared/src/types.ts:423-430`
- **Shard rain**: scheduled scatter of high-value shard sites. Schedule: `SHARD_RAIN_SCHEDULE_HOURS = [12, 20]`. Each rain spawns 3–6 sites with a 30-minute TTL. Shards feed monument construction. `packages/game-domain/src/server-game-constants/server-game-constants.ts:29-32`
- **Barbarian spawning**: continuous; see §2.
- **Client visibility**: season status, victory pressure, leader hold-time, shard rain sites, and barbarian positions are streamed live to clients. No hidden standings.

## 10. GOAP action catalog (current)

All actions are defined in `AI_EMPIRE_ACTIONS` at `apps/simulation/src/ai/automation-goap.ts:169-359`. The planner picks the lowest-cost action whose preconditions are met given the current strategic snapshot.

| Action key | Cost | Key preconditions | Intent |
|---|---:|---|---|
| `claim_food_border_tile` | 1 | hasNeutralLandOpportunity, foodCoverageLow, canAffordFrontierAction, staminaHealthy | Expand (food) |
| `claim_neutral_border_tile` | 2 | hasNeutralLandOpportunity, canAffordFrontierAction, staminaHealthy | Expand |
| `claim_scaffold_border_tile` | 2 | hasScaffoldOpportunity, canAffordFrontierAction, staminaHealthy | Expand (settle prep) |
| `claim_scout_border_tile` | 4 | hasScoutOpportunity, canAffordFrontierAction, staminaHealthy, !economyWeak, !underThreat | Expand (vision) |
| `attack_barbarian_border_tile` | 3 | hasBarbarianTarget, attackReady, canAffordFrontierAction, staminaHealthy | Attack |
| `attack_enemy_border_tile` | 5 | hasWeakEnemyBorder, attackReady, canAffordFrontierAction, staminaHealthy | Attack |
| `build_siege_outpost` | 4 | hasSiegeOutpostSite, canBuildSiegeOutpost, !underThreat | Attack prep |
| `settle_owned_frontier_tile` | 2 | needsSettlement, canAffordSettlement | Economy |
| `build_economic_structure` | 2 | canBuildEconomy, goldHealthy, !underThreat | Economy |
| `build_fort_on_exposed_tile` | 3 | underThreat, canBuildFort | Defend |
| `wait_and_recover` | 1 | (none) | Recovery |

**Grouped by intent**:

- Expand: `claim_food_border_tile`, `claim_neutral_border_tile`, `claim_scaffold_border_tile`, `claim_scout_border_tile`
- Attack: `attack_barbarian_border_tile`, `attack_enemy_border_tile`, `build_siege_outpost`
- Economy: `settle_owned_frontier_tile`, `build_economic_structure`
- Defend: `build_fort_on_exposed_tile`
- Recovery: `wait_and_recover`

## 11. Strategic snapshot (the meta layer that already exists)

`apps/simulation/src/ai/automation-strategic-snapshot.ts` builds an `AutomationStrategicSnapshot` per planner tick. This is the existing "meta" layer; any new strategic AI work should consume or extend it rather than reinventing it.

- **Victory path selection**: scores all 5 paths every tick. Locks into a primary path unless an alternative scores >28 points higher (or >56 in emergency). `:305-322, 108-115`
- **Strategic focus mode**: one of `BALANCED`, `ECONOMIC_RECOVERY`, `ISLAND_FOOTPRINT`, `MILITARY_PRESSURE`, `BORDER_CONTAINMENT`. Controls goal priorities and which actions are filtered out. `:439-460`
- **Front posture**: one of `BREAK`, `CONTAIN`, `TRUCE`. Modulates frontier aggression. `:368-381`
- **ATTACK ⇆ SETTLE gate** (`attackReady`): true only if `canAttack` (coin + manpower) AND `manpowerSufficient` (threat-scaled) AND (`pressureThreatensCore` OR (not `needsFood` AND not `needsEconomy`) OR `pressureAttackScore ≥ 180`). This is the gate the AI tunnel-vision memory refers to. `:13-23, 430-433`, `apps/simulation/src/ai/automation-command-planner.ts:294-297`

## 12. Tile mutation chokepoints

For event-driven indexes (chunk aggregates, focus invalidation, etc.), these are the points where state mutates:

- **Single tile-state chokepoint**: `SimulationRuntime.replaceTileState()` (`apps/simulation/src/runtime/runtime.ts:1539`). ~25 call sites across the runtime funnel through this method. Every authoritative change to ownership, ownershipState, structure, fort, observatory, siegeOutpost, shardSite, and yield-anchor goes through here.
- **Validation gate** for player-initiated mutations: `validateFrontierCommand()` (`packages/game-domain/src/index.ts:180-257`).
- **Existing event hooks at the chokepoint**: emits `TILE_YIELD_ANCHOR_UPDATED` via `setTileYieldCollectedAt` (`runtime.ts:1585`); updates player ownership summaries (`runtime.ts:1550-1574`). No general "tile state mutated" event yet — adding one at this point would catch every relevant change in a single emit.
- **Worker tile caches** (`system-job-worker.ts`, `ai-planner-worker.ts`, `ai-command-producer-worker.ts`, `system-command-producer-worker.ts`) maintain their own replicas of tile state. These are downstream of canonical mutations and should not be hooked for aggregation; subscribe to the runtime emit instead.
- **Shard rain mutations** (`runtime.tickShardRain`) also pass through `replaceTileState`, so the same hook covers them. Shard rain *also* emits per-player `PLAYER_MESSAGE` events with `messageType: "SHARD_RAIN_EVENT"` for the client banner.
- **Barbarian state changes** (walk/multiply) are tile-state mutations + a side-channel `barbarianTileProgress` Map in `SimulationRuntime`. The tile-state part is covered by the chokepoint; progress is internal to the runtime.

## 13. Performance constraints

- The simulation runs in a single Node.js event loop. **Synchronous CPU work on the planner main loop blocks user-facing actions** (auth, build commands, etc.). The "AUTH→INIT exceeded threshold" Slack alert (#211) exists because this has happened in prod.
- The AI planner is the dominant CPU consumer. As of 2026-05-14, single-player planner stalls of 30–45s have been observed in prod, traced to `analyzeOwnedFrontierTargetsFromLookup` (`apps/simulation/src/ai/frontier-command-planner.ts:248-312`) running a `O(owned_tiles × candidates_per_origin)` enumeration with no cap. With ~1000 owned tiles, ~15–20 candidates per origin, and a broad-pass fallback that can double the loop, worst case is millions of tile-map lookups per planner tick.
- **AGENTS.md** "AI CPU Guardrails" forbids calling heavy concrete selectors (`bestAiSettlementTile`, etc.) from snapshot or planning-static cache builders. Honor that — it exists for a reason.

## 14. Things that look like signals but aren't

- **`actionKey` in `ai budget breach` logs** is the action the planner *selected*, not where time was spent. Time is spent in candidate enumeration before action selection. Don't infer "this action is slow"; infer "the planner ran the full enumeration this turn."
- **"Functional AI is the new variable"**: AI has been alive since #177; it is not a recently-introduced unknown. Dead-AI behavior was the pre-#177 split-process deployment.
- **"Domination income"**: see §6 — there's no such income mechanic.

## 15. References worth keeping open

- `apps/simulation/src/ai/automation-strategic-snapshot.ts` — strategic snapshot (the existing meta layer).
- `apps/simulation/src/ai/automation-goap.ts` — GOAP action catalog.
- `apps/simulation/src/ai/automation-command-planner.ts` — planner driver.
- `apps/simulation/src/ai/frontier-command-planner.ts` — frontier candidate enumeration (current CPU hot spot).
- `apps/simulation/src/ai/structure-command-planner.ts` — structure selection scoring.
- `packages/game-domain/src/server-game-constants/server-game-constants.ts` — tunables (truce, barbarian, shard, victory).
- `packages/game-domain/src/index.ts` — frontier command validation, ownership transitions.
- `packages/game-domain/data/tech-tree.json` — tech tree data.
- `packages/shared/src/types.ts` — core type definitions.
- `packages/shared/src/exposure/exposure.ts` — neighbor and wrap helpers.
- `docs/archive/design-history-2026/ai-goap-plan.md` — original (pre-rewrite) GOAP design intent. Historical context; some details (3 victory paths, `packages/server` paths) are out of date — the legacy stack was deleted in PR #264.
