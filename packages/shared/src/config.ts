declare const process: {
  env: {
    BREAKTHROUGH_ENABLED?: string;
    EMPIRE_INTEGRITY_ENABLED?: string;
    AI_UTILITY_POLICY_ENABLED?: string;
  };
};

export const WORLD_WIDTH = 450;
export const WORLD_HEIGHT = 450;
export const CHUNK_SIZE = 64;
export const PLAYER_BASE_VISION = 1;
// Lowered from 4 so the hills vision bonus (below) is a meaningful,
// visible incentive to hold hilly ground — 1 base + 1 hills bonus = 2.
export const VISION_RADIUS = 1;
// Watchtower sites: world-generated scouting structures, spread out across
// the map. `WATCHTOWER_TARGET_COEFFICIENT` is tuned so a default 450x450
// world (worldScale = 0.2025) yields ~50 sites.
export const WATCHTOWER_TARGET_MIN_COUNT = 25;
export const WATCHTOWER_TARGET_COEFFICIENT = 247;
export const WATCHTOWER_REVEAL_RADIUS = 5;
export const WATCHTOWER_REVEAL_TTL_MS = 10_000;
// A FRONTIER tile's own standing vision -- flat and permanent, regardless of
// the owner's effective vision radius (tech/observatory bonuses don't scale
// it). Replaced the earlier one-time EXPAND/ATTACK discovery pulse (radius 3,
// 10s TTL, same mechanic as a Watchtower's activation pulse): that pulse
// gave a temporary burst then vision snapped back to nothing beyond the
// tile itself, which read as territory going dark right after you took it.
// A flat +1 is smaller but never expires. Still well under the Relay
// Beacon's permanent +5 radius, so a beacon remains meaningfully better for
// real reconnaissance.
export const FRONTIER_STANDING_VISION_RADIUS = 1;
// A vision source standing on a forest tile only sees this far, regardless
// of the player's effective vision radius (tech/observatory bonuses). The
// forest itself and its immediate neighbors remain visible; nothing farther
// is dilated from that source. See vision-footprint-table.ts.
export const FOREST_VISION_RANGE = 1;
// A vision source standing on a hills tile sees one extra tile beyond its
// normal effective radius (before forest clamping is applied). See
// isHillsTileAt in hills-terrain.ts and vision-footprint-table.ts.
export const HILLS_VISION_BONUS = 1;
export const COMBAT_LOCK_MS = 30_000;
export const FRONTIER_CLAIM_COST = 0;
export const FRONTIER_CLAIM_MS = 15_000;

// Waypoint client-side-planning / server-side-replay (see
// docs/waypoint-client-planning-plan.md). WAYPOINT_MAX_WIRE_STEPS bounds the
// steps[] a WAYPOINT_ENQUEUE can carry -- a growable structure that lands in
// a player snapshot (docs/agents/state-and-persistence-discipline.md), so the
// cap is not optional. 256 matches the client's own render/step-count limit,
// so no honest plan is ever rejected. WAYPOINT_OFFLINE_GRACE_MS is how long a
// player must stay disconnected before the server's tick-driven waypoint
// drain is allowed to start replaying their queue -- long enough that a page
// refresh or a flaky reconnect never triggers a server drain cycle.
export const WAYPOINT_MAX_WIRE_STEPS = 256;
export const WAYPOINT_OFFLINE_GRACE_MS = 15_000;
export const FOREST_FRONTIER_CLAIM_MULT = 1.5;
// Changed to additive penalty that results in a 1.5x multiplier (same as forest).
// 7_500 ms additive + 15_000 ms base = 22_500 ms total (1.5x).
// See isHillsTileAt usage in runtime-frontier-command.ts.
export const HILLS_FRONTIER_CLAIM_PENALTY_MS = 7_500;
export const SETTLE_COST = 0;
export const SETTLE_MS = 60_000;
/**
 * AI-only reserve: the automatic per-tick frontier auto-claim (see
 * runtime-territory-automation-tick.ts) stops spending gold on new claims
 * once an AI player's gold would drop below this floor. Without a reserve,
 * auto-claim (which fires every tick, unconditionally, well before the AI's
 * own deliberate SETTLE decision ever runs) drains gold down to near-zero
 * every tick, permanently starving the AI of the SETTLE_COST needed to
 * convert any of its claimed FRONTIER tiles into an income-producing town.
 * Human players are unaffected — this only gates the automated claim loop
 * for isAi players.
 */
export const AI_AUTO_CLAIM_GOLD_RESERVE = 10;
export const DEVELOPMENT_PROCESS_LIMIT = 3;

export const DEF_MULT_MIN = 0.0;
export const DEF_MULT_MAX = 1.0;
export const DEF_SIZE_PENALTY = 0.08;
export const DEF_OVEREXPOSURE_PENALTY = 1.2;
export const DEF_OVEREXPOSURE_SHARPNESS = 6;

export const RATING_A = 1.0;
export const RATING_B = 2.0;
export const UNDERDOG_K = 2.0;

export const STAMINA_MAX = 10;
export const STAMINA_REGEN_MS = 120_000;
export const MANPOWER_BASE_CAP = 150;
// Regen tuned so a single settlement fills its cap in ~12 hours (cap / 720 min).
// Acts as a floor in playerManpowerRegenPerMinute, so it must scale with the
// per-tier regen below — otherwise the tier values are masked.
export const MANPOWER_BASE_REGEN_PER_MINUTE = 150 / 720;
export const MANPOWER_EPSILON = 1e-6;

// --- Manpower economy: Expand/Settle costs (manpower-economy-rewrite-plan.md §4.2) ---
// Cheapest action — just claiming dirt; deliberately matches BARBARIAN_RAID_COST
// (10) so claiming land and raiding a barbarian tile share one "10 = a cheap
// frontier poke" mental model.
export const EXPAND_MANPOWER_COST = 10;
// Priced below every structure on purpose — acquisition is always a little
// cheaper than optimization (§4.2's ordering rule).
export const SETTLE_MANPOWER_COST = 20;
// The auto-claim manpower floor (docs/ai-war-peace-balance-plan.md) used to
// be a small SETTLE-sized reserve of its own (AI_AUTO_CLAIM_MANPOWER_RESERVE)
// — now superseded by aiWarReserveManpower below, applied at the auto-claim
// call site (runtime-territory-automation-tick.ts) for the same reason this
// one existed, just sized to the number that actually matters (attacking).

// --- Manpower economy: starting capital tier (§4.3) ---
// A new player's capital is a distinct manpower source from the generic
// SETTLEMENT tier (TOWN_MANPOWER_BY_TIER.SETTLEMENT below) — it is not counted
// via ownedTownTierByTile, and its cap/regen are added on top of every owned
// town's contribution, unconditionally (see playerManpowerCapFromSummary /
// playerManpowerRegenPerMinuteFromSummary in apps/simulation/src/runtime-manpower.ts).
// Sized so a new player can expand ~40 tiles and settle ~8 before waiting on
// regen: 40 * EXPAND_MANPOWER_COST + 8 * SETTLE_MANPOWER_COST = 560; the 720
// cap leaves a larger margin. Regen 0.4/min implies a 30h fill window
// (720 = 0.4 * 1800), a deliberate departure from the 12h SETTLEMENT-tier
// convention — see §4.3 for the full onboarding-math writeup.
export const STARTING_CAPITAL_MANPOWER_CAP = 720;
export const STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE = 0.4;
// Global regen safety floor. Deliberately kept low (below every real tier's
// regenPerMinute, including SETTLEMENT's ~0.208) so it never masks a captured
// town's contribution the way MANPOWER_BASE_REGEN_PER_MINUTE would if reused
// here — see §4.3's "critical implementation trap" note.
export const MANPOWER_REGEN_GLOBAL_FLOOR = 0.15;

// --- Galactic meta-layer v0: Wonder-style starting bonuses (§5, §12) ---
// docs/galactic-campaign-design.md §5 describes 6 globally-unique Wonders
// bought with a persistent Production economy that doesn't exist yet (no
// Production wallet, no supersession, no Influence/Senate). v0's stand-in
// (§12 "Production funding 1-2 Wonder-style starting bonuses for the
// claimant's next season") is much smaller: the most recent season's Planet
// winner (§3) gets two fixed, one-time starting bonuses applied at their
// next JoinSeason spawn — see pendingGalacticWonderBonus in
// apps/simulation/src/runtime/runtime.ts. Not tunable per-Wonder-tier like
// §13's Prod costs; a flat grant is the whole v0 simplification.
// Dyson Array stand-in: a manpower-regen head start, same order of magnitude
// as STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE above (doubles it).
export const GALACTIC_WONDER_MANPOWER_REGEN_BONUS_PER_MINUTE = 0.4;
// Deep Sensor Array stand-in: reuses the Observatory vision-radius model
// (OBSERVATORY_VISION_BONUS below) at half its magnitude — a head start, not
// a full Observatory-equivalent bonus.
export const GALACTIC_WONDER_VISION_RADIUS_BONUS = 2;
export const TOWN_MANPOWER_BY_TIER: Record<
  "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS",
  { cap: number; regenPerMinute: number }
> = {
  SETTLEMENT: { cap: 150, regenPerMinute: 150 / 720 },
  TOWN: { cap: 300, regenPerMinute: 300 / 720 },
  CITY: { cap: 600, regenPerMinute: 600 / 720 },
  GREAT_CITY: { cap: 1_200, regenPerMinute: 1_200 / 720 },
  METROPOLIS: { cap: 2_400, regenPerMinute: 2_400 / 720 }
};
export const manpowerRegenWeightForSettlementIndex = (index: number): number => {
  if (index < 5) return 1;
  if (index < 15) return 0.5;
  return 0.2;
};
export const ATTACK_MANPOWER_MIN = 60;
export const ATTACK_MANPOWER_COST = 60;

/**
 * AI war reserve (docs/ai-war-peace-balance-plan.md): a floor on spendable
 * manpower an AI player must keep in reserve for attacking — EXPAND, SETTLE,
 * and structure builds may not spend below it, but ATTACK is exempt (the
 * reserve exists to be spent attacking, not sit idle). Confirmed live
 * (2026-09-01): AI empires were spending every point of manpower regen on
 * EXPAND (unlocked at 10) and could mathematically never accumulate the 60
 * needed for ATTACK_MANPOWER_MIN, so they had no way to ever fight back
 * against sustained barbarian pressure.
 *
 * AI_WAR_RESERVE_MANPOWER_FLOOR (120 = 2 * ATTACK_MANPOWER_MIN) guarantees
 * every empire, however small, can always mount two attacks. Above cap 1200
 * the fraction term takes over so the reserve stays meaningful at scale — a
 * flat floor alone would be a rounding error for a 100,000-cap empire, and a
 * flat *reserve* (rather than a floor) would freeze a small, already-
 * starving empire for a day or more before it could ever act again. See the
 * plan doc's "Reserve at each scale" table.
 */
export const AI_WAR_RESERVE_MANPOWER_FLOOR = 2 * ATTACK_MANPOWER_MIN;
export const AI_WAR_RESERVE_CAP_FRACTION = 0.1;

export const aiWarReserveManpower = (manpowerCap: number): number =>
  Math.max(AI_WAR_RESERVE_MANPOWER_FLOOR, manpowerCap * AI_WAR_RESERVE_CAP_FRACTION);

export const DEEP_STRIKE_MANPOWER_MIN = 100;
export const DEEP_STRIKE_MANPOWER_COST = 120;
export const NAVAL_INFILTRATION_MANPOWER_MIN = 100;
export const NAVAL_INFILTRATION_MANPOWER_COST = 120;

export const PVP_REPEAT_WINDOW_MS = 10 * 60_000;
export const PVP_REPEAT_FLOOR = 0.1;

export const LEVEL_CURVE_C = 2.2;

export const FORT_BUILD_MS = 10 * 60_000;
export const FORT_BUILD_COST = 900;
export const FORT_DEFENSE_MULT = 2.5;
export const WOODEN_FORT_BUILD_MS = 10 * 60_000;
export const WOODEN_FORT_DEFENSE_MULT = 1.35;

export const OBSERVATORY_BUILD_MS = 10 * 60_000;
export const OBSERVATORY_VISION_BONUS = 5;
// §12.1 (docs/manpower-economy-rewrite-plan.md): Observatory's ongoing
// crystal drain is replaced entirely by its permanent CRYSTAL slot
// occupation — "the slot occupation itself is the upkeep... there is
// nothing left to meter per-minute." Retired to 0 rather than deleted.
export const OBSERVATORY_UPKEEP_PER_MIN = 0;
/** Single unified base range for both cast radius and protection field. */
export const OBSERVATORY_RANGE = 20;
/** Max effective range after all tech/domain bonuses (real max 36, buffer at 40). */
export const OBSERVATORY_RANGE_MAX = 40;
/** Alias kept so existing imports continue to compile. Now equals OBSERVATORY_RANGE. */
export const OBSERVATORY_PROTECTION_RADIUS = OBSERVATORY_RANGE;
/** Alias kept so existing imports continue to compile. Now equals OBSERVATORY_RANGE. */
export const OBSERVATORY_CAST_RADIUS = OBSERVATORY_RANGE;

export const ECONOMIC_STRUCTURE_BUILD_MS = 5 * 60_000;
export const ECONOMIC_STRUCTURE_REMOVE_MS = 5 * 60_000;
export const RELAY_BEACON_BUILD_MS = 60_000;
export const RELAY_BEACON_VISION_BONUS = 5;
// Mirrors slotWaiversForPlayer's relayBeaconFoodSlotWaiverCount
// (apps/simulation/src/tech-domain-bridge/slot-waivers.ts) — the player's
// first N Relay Beacons (earliest build-order first) need zero FOOD slots.
export const RELAY_BEACON_FREE_FOOD_SLOT_COUNT = 5;
export const SIEGE_OUTPOST_BUILD_MS = 60_000;
export const SIEGE_OUTPOST_BUILD_COST = 900;
export const SIEGE_OUTPOST_ATTACK_MULT = 1.6;
export const SIEGE_TOWER_ATTACK_MULT = 1.8;
export const DREAD_TOWER_ATTACK_MULT = 2.0;
export const OUTPOST_ATTACK_REACH = 2;

// Fixed-border reach: the radius (Chebyshev, toroidal) within which EXPAND
// and SETTLE are legal, projected from each anchor type. ATTACK is
// deliberately not reach-gated. See packages/shared/src/reach/reach.ts.
export const TOWN_REACH_RADIUS = 3;
// Reuses OUTPOST_AURA_RADIUS's value for all four outpost-family variants
// (RELAY_BEACON, SIEGE_OUTPOST, SIEGE_TOWER, DREAD_TOWER) but kept as its own
// named constant so reach and the combat aura can be tuned independently.
export const OUTPOST_REACH_RADIUS = 5;
export const DOCK_REACH_RADIUS = 1;
// Reach granted around the far tile an Aether Bridge opens up, so players can
// EXPAND into it and build a relay beacon there. Deliberately smaller than
// OUTPOST_REACH_RADIUS and applied via ReachAnchor.radiusOverride (kind stays
// "OUTPOST") -- see reach.ts and applyReachAnchorActivation's caller in
// runtime.ts for why this grant is one-shot rather than a persistent anchor.
export const AETHER_BRIDGE_REACH_RADIUS = 3;

// Decay window for a FRONTIER tile claimed/captured outside the owner's
// current reach (distinct from encirclement decay, which is
// connectivity-based and lives in apps/simulation). See reach.ts's
// reachOwnerCountAt for the contested-zone exception that suppresses this.
export const OUT_OF_REACH_DECAY_MS = 120_000;

// A FRONTIER tile that reverts to neutral (out-of-reach decay or
// encirclement cut-off) auto-heals back to FRONTIER after this long,
// provided it is STILL neutral and STILL inside some owner's persistent
// reach border at the moment its deadline comes due -- see
// runtime-frontier-auto-heal.ts. Free and instant, same as the reach-driven
// auto-claim in runtime-reach-border-apply.ts; this is just the delayed
// version of the same grant for ground that was already held.
export const FRONTIER_AUTO_HEAL_MS = 30 * 60 * 1000;

export const DOCK_DEFENSE_MULT = 1.5;
export const DOCK_CROSSING_COOLDOWN_MS = 30_000;
export const DOCK_PAIRS_MIN = 15;
export const DOCK_PAIRS_MAX = 45;

export const CLUSTER_COUNT_MIN = 238;
export const CLUSTER_COUNT_MAX = 238;

export const SEASON_LENGTH_DAYS = 30;

export const BARBARIAN_ACTION_INTERVAL_MS = 15_000;
export const BARBARIAN_MULTIPLY_THRESHOLD = 5;
export const BARBARIAN_CLEAR_GOLD_REWARD = 5;
export const BARBARIAN_ATTACK_POWER = 1.0;
export const BARBARIAN_DEFENSE_POWER = 0.67;
export const INITIAL_BARBARIAN_COUNT = 80;

// --- Mustering system ---
// Attacks always consume pre-staged muster; there is no flag or opt-out.

// How much mustered manpower one ordinary attack costs (placeholder).
// Also used as the fill-ratio reference for the muster flag animation.
export const MUSTER_ATTACK_COST = 60;
// Attacking a FRONTIER-owned target (claimed but not settled) — these have
// zero effective defense (see defenseMultiplierForTile in frontier-combat.ts,
// which returns 0 for ownershipState === "FRONTIER" regardless of any fort
// built on the tile — forts only grant their defense bonus once the tile is
// SETTLED). Cheap like a barbarian raid, not the full settled-attack floor.
export const FRONTIER_ATTACK_MUSTER_COST = 15;
// Inflow rate per tile per minute — 60 manpower in ~20 s at base.
export const MUSTER_BASE_RATE_PER_MIN = 180;
// A fresh muster flag's default cap is this fraction of the player's manpower
// cap, capped at MUSTER_FLAG_BASE_CAP_CEILING — keeps a single flag from being
// able to draw down the player's entire manpower pool by default without
// requiring a flat number that goes stale as manpower caps grow. Each
// "Expand Capacity" press adds another share of the *current* manpower cap,
// uncapped, so upgrading stays meaningful late-game instead of being
// dwarfed by a fixed increment.
export const MUSTER_FLAG_CAP_MANPOWER_FRACTION = 0.1;
// Ceiling on the default (capLevel 0) share above — without it, a very high
// manpower cap would let a lone, never-upgraded flag hold most of the pool.
export const MUSTER_FLAG_BASE_CAP_CEILING = 150;
// "Expand Capacity" is currently FREE (no manpower or resource cost) — see
// handleUpgradeMusterCapCommand (runtime-muster-cap-upgrade-command.ts).
// Deliberately temporary: the intended cost is a FOOD resource-slot
// occupation (the same supply/demand-slot mechanic Forts/Siege
// Outposts/Observatories use — resource-slot-view.ts), a real design task
// of its own that hasn't been done yet. No constant lives here for that
// cost until it's designed; don't reintroduce a flat manpower charge in
// its place.

/**
 * A muster flag's enforced cap: MUSTER_FLAG_CAP_MANPOWER_FRACTION of the
 * player's manpower cap (clamped to MUSTER_FLAG_BASE_CAP_CEILING) plus that
 * same fraction again per "Expand Capacity" upgrade purchased (capLevel) —
 * but never more than the player's manpower cap itself. Without that final
 * clamp, enough upgrades would let a single flag demand more manpower than
 * the player's empire-wide pool can ever hold, which defeats the point of
 * capping flags in the first place. Recomputed live off the player's
 * *current* manpower cap wherever it's used (runtime-muster-tick.ts's
 * headroom calc, the tile-menu display), so it tracks growth/loss of that
 * cap automatically — including this ceiling.
 */
export const musterFlagCap = (manpowerCap: number, capLevel: number | undefined): number => {
  const share = manpowerCap * MUSTER_FLAG_CAP_MANPOWER_FRACTION;
  const raw = Math.min(MUSTER_FLAG_BASE_CAP_CEILING, share) + (capLevel ?? 0) * share;
  return Math.min(raw, manpowerCap);
};
// Max simultaneous muster tiles per player.
// Base cap; +1 from Muster Discipline, +1 from Muster Command (both War
// tech), +1 from the War Foundries domain — 2 + 3 = 5, same total cap as
// before, now gated behind real unlocks instead of a flat constant.
export const MUSTER_MAX_TILES = 2;
// Auto-clear stale musters after this many milliseconds since the flag was set.
export const MUSTER_STALE_MS = 2 * 24 * 60 * 60 * 1000; // 2 days
// Multiplier to muster inflow when the tile is inside an outpost depot zone
// but NOT boosted by a nearby Rail Depot (base outpost speed).
export const MUSTER_DEPOT_SPEED_MULT = 1.25;
// Chebyshev radius of an outpost's mustering effect (matches attack aura).
export const OUTPOST_DEPOT_RADIUS = 5;

// --- Rail Depot mustering hub ---
// docs/manpower-economy-rewrite-plan.md §4.4: Garrison Hall grants a flat,
// unconditional manpower-cap bonus to the town it's built in, regardless of
// network. Rail Depot no longer grants its own flat per-depot regen (the old
// RAIL_DEPOT_MANPOWER_REGEN_PER_MIN mechanic) — instead it's the enabler of a
// network-wide bonus: one Rail Depot per connected-town network amplifies
// every Garrison Hall already in that network, uncapped in count.
export const GARRISON_HALL_MANPOWER_CAP_BONUS = 150;
export const RAIL_DEPOT_NETWORK_MANPOWER_REGEN_PER_GARRISON_HALL = 0.1;
export const RAIL_DEPOT_NETWORK_MANPOWER_CAP_PER_GARRISON_HALL = 300;
// Chebyshev radius within which a Rail Depot boosts outpost muster speed.
// Outposts inside this radius of a depot provide RAIL_DEPOT_BOOSTED_MUSTER_MULT
// muster speed instead of MUSTER_DEPOT_SPEED_MULT.
export const RAIL_DEPOT_MUSTER_RADIUS = 50;
// Multiplier to muster inflow when the tile's outpost is backed by a nearby Rail Depot.
export const RAIL_DEPOT_BOOSTED_MUSTER_MULT = 2.0;
// Weapons Workshop (retired — see structure-registry-economic.ts — replaced
// by Titanium/Umbrite Weapons Factory below). Constants kept so any copy a
// player already owns from before the retirement keeps granting its bonus.
export const WEAPONS_WORKSHOP_ATTACK_MULT_PER_BUILDING = 0.03;
export const WEAPONS_WORKSHOP_DEFENSE_MULT_PER_BUILDING = 0.03;

// Titanium/Umbrite Weapons Factory: the "future 'network' building" the
// comment above used to describe is this pair. Like Weapons Workshop, a
// player may build unlimited copies of either per town (placementMode
// "same_tile", no per-town cap) — each is a genuine, uncapped sink for its
// resource (1 TITANIUM or 1 UMBRITE slot per copy, structure-slots.ts). Both
// grant attack AND defense per copy (never zero on either axis), just
// weighted differently: Titanium leans defense, Umbrite leans attack —
// "armor doctrine" vs. "raiding doctrine." Unlike Weapons Workshop, the
// count that actually feeds a given fight's multiplier is scoped to the
// connected-town network relevant to that side of the fight
// (runtime-combat-support.ts), not a flat empire-wide sum — concentrating
// factories in one connected industrial region pays off more than
// scattering the same count across disconnected pockets. First-pass balance
// figures, not derived from anything — expect tuning.
export const TITANIUM_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING = 0.015;
export const TITANIUM_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING = 0.03;
export const UMBRITE_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING = 0.03;
export const UMBRITE_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING = 0.015;
// "Unarmed" vulnerability: a player who owns zero of a given factory type
// ANYWHERE in their empire (not network-scoped — this is an empire-wide
// existence check, not a clustering bonus) is markedly easier to attack.
// Missing one type or both types applies the same flat multiplier (does not
// stack to a larger number if both are missing — confirmed design decision).
export const NO_WAR_INDUSTRY_ATTACK_VULNERABILITY_MULT = 2.0;

// --- Tech-tree redesign: new Manpower-branch buildings ---
// Rail Depot's job narrows to Logistics Guild amplification only (Ancillary
// Factory/Garrison Hall amplification moved to Assembly Works, below).
export const LOGISTICS_GUILD_STANDALONE_REGEN_PER_MINUTE = 0.05;
export const RAIL_DEPOT_NETWORK_MANPOWER_REGEN_PER_LOGISTICS_GUILD = 0.1;
// Population Bureau monument: +0.1/min manpower regen per Manpower-branch
// building owned, empire-wide, simple linear count.
export const POPULATION_BUREAU_REGEN_PER_MANPOWER_BUILDING = 0.1;
// Quartermaster's Office: reduces manpower cost of War-branch structures
// built within this radius by 33%. Deliberately non-stacking (a boolean
// "any active Office in range" check, not a per-office count) — user
// decision, to avoid multiple Offices driving manpower cost toward zero.
export const QUARTERMASTERS_OFFICE_RADIUS = 20;
export const QUARTERMASTERS_OFFICE_WAR_STRUCTURE_MANPOWER_COST_MULT = 0.67;
// Incubation Engine (Granary): instant one-time population burst on build
// completion.
export const GRANARY_INSTANT_POPULATION_BURST = 10_000;
// Incubation Engine (Granary): ongoing population growth-rate multiplier for
// its own town, on top of the instant burst above. Reintroduced 2026-08-26,
// per explicit user decision, at a lower value than the pre-redesign flat
// +15% that commit 7a51b06b ("fix: Incubation Engine double-dip") removed —
// see granaryGrowthMultiplier's doc comment in game-domain for that history.
export const GRANARY_ONGOING_GROWTH_MULT = 1.10;
// Census Hall: population bonus per connected city with an active Granary
// (Incubation Engine) — network-scoped, recomputed live (not a one-time
// grant), so losing a connection or the neighbor's Granary shrinks it back.
export const CENSUS_HALL_POPULATION_BONUS_PER_CONNECTED_GRANARY = 20_000;
// Census Hall: cheaper town-tier upgrade cost for the Census Hall's own town.
export const CENSUS_HALL_TOWN_TIER_UPGRADE_GOLD_COST_MULT = 0.75;
export const SETTLEMENT_TO_TOWN_POPULATION_MIN = 10_000;
// The Titanium Levy monument: converts this fraction of currently-banked
// manpower into an instant one-time army, then freezes empire-wide manpower
// regen for TITANIUM_LEVY_REGEN_FREEZE_MS.
export const TITANIUM_LEVY_MANPOWER_CONVERSION_RATIO = 0.5;
export const TITANIUM_LEVY_REGEN_FREEZE_MS = 2 * 60 * 60 * 1000;

// --- Barbarian raids ---
export const BARBARIAN_RAID_COST = 10; // cheap, no muster wind-up

// --- Breakthrough momentum ---
export const BREAKTHROUGH_ENABLED = process.env["BREAKTHROUGH_ENABLED"] === "true";
export const BREAKTHROUGH_DEBUFF_MULT = 0.7;
export const BREAKTHROUGH_DURATION_MS = 60_000;

// --- Empire Integrity ---
export const EMPIRE_INTEGRITY_ENABLED = process.env["EMPIRE_INTEGRITY_ENABLED"] === "true";
export const INTEGRITY_ECON_MIN_MULT = 0.85;
export const INTEGRITY_ECON_MAX_MULT = 1.15;
export const INTEGRITY_GROWTH_MIN_MULT = 0.9;
export const INTEGRITY_GROWTH_MAX_MULT = 1.1;

// --- Utility AI policy ---
export const AI_UTILITY_POLICY_ENABLED = process.env["AI_UTILITY_POLICY_ENABLED"] === "true";

// --- Auto-fill ---
export const AUTO_FILL_MAX_REGION_SIZE = 500;
// A pocket sealed purely by the player's own SETTLED tiles may be up to
// AUTO_FILL_MAX_REGION_SIZE. But when a natural barrier (sea, mountain) helps
// wall the pocket, it is capped at this smaller size — you can only snap up a
// small basin off the back of terrain, not a whole coastline.
export const AUTO_FILL_NATURAL_BARRIER_MAX_REGION_SIZE = 50;
