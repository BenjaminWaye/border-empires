# Border Empires — Game Mechanics Reference

Canonical "how the game actually works" reference for agents working on AI, gameplay, balance, or anything that needs grounded knowledge of the rules. Surveyed 2026-05-14 against the rewrite stack (`apps/simulation`, `apps/realtime-gateway`, `packages/shared`, `packages/game-domain`, `packages/sim-protocol`, `packages/client-protocol`, `packages/client`). The legacy `packages/server` stack was removed in commit `ec4614d` (PR #264); only the rewrite is authoritative.

When something here drifts from code, fix the code reference and update this doc in the same branch. Cite file:line for every non-obvious claim.

---

## 1. Map and spatial structure

- **Coordinate system**: square grid, integer `(x, y)`. World wraps on both axes at `WORLD_WIDTH` × `WORLD_HEIGHT`. `packages/shared/src/exposure/exposure.ts:5-10`
- **Neighbors**: 4 cardinal directions (N, E, S, W) only. No diagonals for gameplay. `packages/shared/src/exposure/exposure.ts:5-10, 65-66`
- **No chunk/region grid exists.** The world operates per-tile. Tile metadata can carry cluster tags (`FERTILE_PLAINS`, `IRON_HILLS`) but those are not aggregation structures. `packages/shared/src/types.ts:7, 439-444`
- **Terrain types**: `LAND` (claimable, passable), `SEA` / `COASTAL_SEA` (barrier, not claimable; combat blocked except via dock links/aether bridges), `MOUNTAIN` (barrier, mutable via aether abilities). Only `LAND` is claimable. `packages/shared/src/types.ts:1, 15, 200`
- **Fog of war**: per-player visibility. Tiles carry an optional `fogged` flag. Observatory structures extend vision radius and provide a 10-tile passive protection bubble against some aether abilities. `packages/shared/src/types.ts:203`, `packages/game-domain/src/server-game-constants/server-game-constants.ts:49-51`
- **Docks**: Maritime Supremacy counts settled dock tiles. Docks are also used for cross-island movement and linked-dock vision.

## 2. Players and factions

- **Player count**: no hard limit. AI players are flagged `isAi: true` in the player definition. Prod first season is seeded island-heavy with 5 AI players. `packages/shared/src/types.ts:376-413`
- **No civ/faction asymmetry**. Every player shares the same stat-mod fields (`attack`, `defense`, `income`, `vision`), the same tech tree, and the same ability catalog. Differentiation is per-player via tech progress and strategic-resource control, not faction baselines. `packages/shared/src/types.ts:387-388`
- **Barbarians (rewrite model, post-`f5ba210` / PR #256)**: not dynamic agents. Implemented as **tiles owned by player `"barbarian-1"`**, with 80 FRONTIER tiles seeded at world gen far from player spawns (`apps/simulation/src/season-seed-world.ts`, `seed-state.ts:183`). Behavior:
  - **Proximity activation**: a barb tile is only active when adjacent to a non-barb owner. Idle frontier barbs cost ~nothing. Per-tile 15s activation cooldown enforced in `system-job-worker.ts:48` via `barbarianCooldownByTileKey`.
  - **Walk / multiply**: when a barb tile wins an ATTACK/EXPAND (vs a player), per-tile progress accumulates in `SimulationRuntime.barbarianTileProgress` (`runtime.ts:675`). Progress gain: +2 if the target tile held a resource / town / fort / dock / siege, otherwise +1 (`runtime.ts:5976` `barbarianProgressGain`). At threshold 3 the source tile stays barb (multiply); below threshold it releases to neutral (walk). Progress is cleared when a player recaptures a barb tile (`runtime.ts:5946`).
  - **Combat economics**: barbarians bypass gold and manpower gates (`runtime.ts:1263, 2793`) and are treated as a system actor by the planner.
- **Legacy constants still present, mostly unused by the rewrite**: `BARBARIAN_OWNER_ID`, `BARBARIAN_TICK_MS`, `MIN_ACTIVE_BARBARIAN_AGENTS`, `BARBARIAN_MAINTENANCE_INTERVAL_MS`, `BARBARIAN_MAINTENANCE_MAX_SPAWNS_PER_PASS` (`packages/game-domain/src/server-game-constants/server-game-constants.ts:9-37`) and the `BarbarianAgent` type (`packages/shared/src/types.ts:458-465`) are legacy-flavored. Treat them as stale unless you find an active call site.

## 3. Resources and economy

- **Strategic resources (numeric currencies)**: `FOOD`, `IRON`, `CRYSTAL`, `SUPPLY`, `SHARD`, `OIL`. Distinct from tile resource *kinds* (a `FARM` tile produces `FOOD`, etc.). `packages/game-domain/src/index.ts:21`, `packages/shared/src/types.ts:1`
- **Gold**: passive income from settled tiles, scaling with town population tier and structure modifiers. Docks add ~0.5 gold/min per dock. Per-tile gold yield is capped at `TILE_YIELD_CAP_GOLD = 24`. `packages/game-domain/src/server-game-constants/server-game-constants.ts:39-40, 23`
- **Town economics**:
  - Base gold: `TOWN_BASE_GOLD_PER_MIN = 2`, plus tier and connected-network bonuses, plus market/bank modifiers.
  - Support: each town has `supportMax` / `supportCurrent`. If unfed, **gold income pauses** until support recovers. Granaries reduce upkeep.
  - Manpower: per-tier regen and cap. `SETTLEMENT` 10/min cap 150; `METROPOLIS` 120/min cap 2400.
  - Gold is *not* stored beyond a town cap; overage is lost. `packages/shared/src/types.ts:230-256`, `packages/game-domain/src/server-game-constants/server-game-constants.ts:84-90`
- **Resource collection**: harvest rate scales with ownership duration and modifier stacks. Synthesizer structures convert one resource to another. `packages/shared/src/types.ts:264-271`

## 4. Units (intentionally absent)

There are no unit pieces. Combat is **tile-ownership transitions**:

- **ATTACK**: origin is owned by attacker, target is owned by an enemy. Manpower cost varies (`ATTACK_MANPOWER_COST`-family constants, modified by fort presence and breach-shock state). Combat resolves after `COMBAT_LOCK_MS` (phase lock). Winner takes the tile.
- **EXPAND**: origin owned by attacker, target is neutral. Ownership transitions after `FRONTIER_CLAIM_MS`.
- Movement is implicit. Frontier actions originate from any adjacent owned tile, or from dock-linked tiles, or from aether-bridged tiles. `packages/game-domain/src/index.ts:20, 171-257`, `packages/shared/src/types.ts:415-421`

## 5. Structures

- **One structure per tile** (mutex). Must be placed on a `SETTLED` tile owned by the builder.
- **Categories**:
  - Economic: Farmstead, Camp, Mine, Granary, Market, Bank, Synthesizers (Fur/Ironworks/Crystal), Fuel Plant, Caravanary, Foundry, Governance (Governor's Office, Garrison Hall, Customs House, Radar System).
  - Military: Fort, Siege Outpost, Observatory.
  - Monuments (late-game, ultra-high cost, built in 4 stages with shard cost): Imperial Exchange, World Engine, Aegis Dome, Astral Dock.
- **Unlocks**: tech-gated. Costs scale incrementally or exponentially with existing count, in gold + strategic resources.
- **Selection (AI)**: `build_economic_structure` scores per tile by:
  1. Resource on tile (FARM → FARMSTEAD, etc.)
  2. Player need (low food coverage → Granary; weak economy → income structures)
  3. Adjacency (Foundry's 10-tile output multiplier radius; town support reach)
- References: `packages/game-domain/src/server-game-constants/server-game-constants.ts:20-58`, `packages/shared/src/types.ts:279-286`, `packages/shared/src/structure-costs/structure-costs.ts:18-96`, `apps/simulation/src/ai/structure-command-planner.ts:129-250`.

## 6. Tech and research

- **Tech tree**: DAG with prerequisites; tier-based. Tree config is per-season (serialized config ID), so tech contents can vary across seasons.
- **Effects**: each tech can unlock structures, grant stat mods (`attack`, `defense`, `income`, `vision` multipliers), or grant ability access.
- **Research**: one tech at a time per player. Cost in gold + strategic resources + time; time scales with the player's `researchTimeMult`.
- "Domination income" is a misnomer in earlier docs — there is no income mechanic tied to domination. Town Control is a victory *path*, not an income modifier.
- References: tech tree data lives at `packages/game-domain/data/tech-tree.json`; the bridge that scores tech selection in the AI lives at `apps/simulation/src/tech-domain-bridge/tech-domain-bridge.ts`. Player-stat type: `packages/shared/src/types.ts:389`.

## 7. Victory conditions

Five concurrent victory paths, all per-season, all with a 24-hour hold requirement:

| Path | Trigger | Hold |
|---|---|---|
| `TOWN_CONTROL` | Control ≥50% of towns | 24h |
| `ECONOMIC_HEGEMONY` | Lead world income/min by ≥33% **and** produce ≥200 gold/min | 24h |
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
- **ATTACK ⇆ SETTLE gate** (`attackReady`): true only if `canAttack` (gold + manpower) AND `manpowerSufficient` (threat-scaled) AND (`pressureThreatensCore` OR (not `needsFood` AND not `needsEconomy`) OR `pressureAttackScore ≥ 180`). This is the gate the AI tunnel-vision memory refers to. `:13-23, 430-433`, `apps/simulation/src/ai/automation-command-planner.ts:294-297`

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
- `docs/ai-goap-plan.md` — original (pre-rewrite) GOAP design intent. Historical context; some details (3 victory paths, `packages/server` paths) are out of date — the legacy stack was deleted in PR #264.
