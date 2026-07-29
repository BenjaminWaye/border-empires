// Resource-slot supply/demand aggregation — docs/manpower-economy-rewrite-plan.md
// §5 (Pillar 2, Step 5), item 1 of the "still open" list in the Step 5 handoff.
//
// v1 scope (§5.6): a global pool per resource, not per-tile tapping.
// `supply` sums base + boost slots across a player's owned SETTLED resource
// tiles; `demand` sums every currently-existing structure's slot requirement
// (from build start to removal completion — §5.1, "occupies a slot for as
// long as it exists"). Both are pure functions over a tile snapshot, not an
// incrementally-maintained index: correctness over micro-optimization for
// this first slice, matching how `settledTilesForPlayer` /
// `radiusStructureKeysForSettledTiles` are already re-scanned on demand
// elsewhere in this codebase (e.g. player-update-economy.ts) rather than
// tracked incrementally.
import type { DomainTileState } from "@border-empires/game-domain";
import {
  BASE_SLOTS_BY_TILE_RESOURCE,
  SYNTHESIZER_STRUCTURE_TYPES,
  TILE_SLOT_BOOST_STRUCTURES,
  townFoodSlotDemandForTier,
  WATERWORKS_FARMSTEAD_FOOD_SLOT_BONUS,
  FOUNDRY_MINE_SLOT_BONUS,
  structureSlotRequirements,
  type BuildableStructureType,
  type SlotResource,
  type SlotStructureType,
  type StructureSlotRequirement
} from "@border-empires/shared";
import { WATERWORKS_RADIUS, FOUNDRY_RADIUS } from "@border-empires/game-domain";
import { withinRadiusOfAnyKey } from "../tile-yield-view/tile-yield-view.js";
import { simulationTileKey } from "../seed-state/seed-state.js";

const SYNTHESIZER_TYPE_SET: ReadonlySet<string> = new Set(SYNTHESIZER_STRUCTURE_TYPES);

export type ResourceSlotTotals = Record<SlotResource, number>;

export const emptyResourceSlotTotals = (): ResourceSlotTotals => ({ FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0 });

export const totalsFromSlotRequirements = (requirements: readonly StructureSlotRequirement[]): ResourceSlotTotals => {
  const totals = emptyResourceSlotTotals();
  for (const req of requirements) totals[req.resource] += req.count;
  return totals;
};

// §23.2: domain-effect count-based waivers (Dwarf Kingdom/Fortress Realm,
// Supply State, Treasury State/Enduring Realm) — redesigned from the old,
// now-inert percentage-upkeep-discount effects (fortIronUpkeepMult etc,
// meaningless once upkeep is slot occupation, not a metered quantity) into
// "your first N of this structure/town don't need the slot/requirement at
// all." Computed from the player's owned techs/domains by
// slotWaiversForPlayer (tech-domain-bridge.ts) and passed in here so this
// module stays free of any tech/domain-catalog dependency.
export type SlotWaivers = {
  // Dwarf Kingdom (3) / Fortress Realm (5) — the player's first N Forts (any
  // Fort-ladder tier, earliest build-order first) need zero IRON slots.
  // Fortress Realm "extends" Dwarf Kingdom's exemption rather than stacking
  // with it (§23.2), so combine multiple sources via max, not sum.
  fortIronSlotWaiverCount: number;
  // Supply State — the player's first N Siege Outposts (any tier, earliest
  // build-order first) need zero SUPPLY slots. A Siege Tower/Dread Tower's
  // separate IRON requirement is untouched by this waiver.
  outpostSupplySlotWaiverCount: number;
  // Treasury State — the player's first N settled towns (deterministic
  // tie-break by tile key — towns carry no founding timestamp, same
  // simplification already flagged below for dormancy ordering) each need 1
  // fewer FOOD slot.
  firstTownsFoodSlotWaiverCount: number;
  // Enduring Realm — every settled town needs 1 fewer FOOD slot, uncapped.
  // Combined with firstTownsFoodSlotWaiverCount per town via max, not sum —
  // both effects independently describe "1 fewer," and §23.2 frames Enduring
  // Realm as a broader-scope version of Treasury State's effect, not a
  // stacking bonus on top of it.
  allTownsFoodSlotWaiverPerTown: number;
};

export const emptySlotWaivers = (): SlotWaivers => ({
  fortIronSlotWaiverCount: 0,
  outpostSupplySlotWaiverCount: 0,
  firstTownsFoodSlotWaiverCount: 0,
  allTownsFoodSlotWaiverPerTown: 0
});

const noWaiversConfigured = (waivers: SlotWaivers): boolean =>
  waivers.fortIronSlotWaiverCount <= 0 &&
  waivers.outpostSupplySlotWaiverCount <= 0 &&
  waivers.firstTownsFoodSlotWaiverCount <= 0 &&
  waivers.allTownsFoodSlotWaiverPerTown <= 0;

/**
 * Slot supply from a player's owned, settled tiles: base + boost slots from
 * real resource tiles (§5.2's table, same-tile Farmstead/Mine/Camp +1, the
 * Waterworks-radius Farmstead bonus from §5.3, and the Foundry-radius Mine
 * bonus from §12), PLUS each active synthesizer's own hard-capped +1 slot of
 * its resource (§6.4: "a synthesizer provides exactly 1 slot of its
 * resource... so a landlocked player *can* build the one Fort/etc. that
 * needs it" — a synthesizer is a supply *source* standing in for a resource
 * tile the player doesn't have, not a consumer; see the "doesn't sit on a
 * real resource tile" comment on SYNTHESIZER_STRUCTURE_TYPES in
 * structure-slots.ts). `waterworksKeys`/`foundryKeys` should both come from
 * `radiusStructureKeysForSettledTiles` over the same player's settled tiles
 * (shared with the legacy yield view so both can never disagree on "which
 * Waterworks/Foundries are active").
 *
 * §6.4's "hard-capped at 1, forever" is enforced empire-wide at build time
 * (synthesizerFamilyAlreadyOwnedElsewhere in runtime-structure-command-
 * handlers.ts), not here — this function just sums whatever synthesizers
 * actually exist, so if that build-time gate is ever bypassed the resulting
 * over-count is visible in the numbers rather than silently masked.
 */
export const resourceSlotSupplyForPlayer = (
  settledTiles: Iterable<Pick<DomainTileState, "x" | "y" | "resource" | "economicStructure">>,
  waterworksKeys: ReadonlySet<string> = new Set(),
  foundryKeys: ReadonlySet<string> = new Set()
): ResourceSlotTotals => {
  // §5.4: deliberately NOT dormancy-aware, for two different reasons per
  // structure family:
  //  - Synthesizers are explicitly excluded from demand entirely (see
  //    SYNTHESIZER_TYPE_SET below) and Farmstead/Waterworks have NO slot
  //    requirement at all (by design — both boost FOOD supply itself, so
  //    charging them FOOD would be circular: their own dormancy would zero
  //    out the very supply they exist to add). None of these three can ever
  //    be dormant, so this is correct as-is.
  //  - Mine/Camp DO consume a FOOD slot (a different resource than what
  //    they boost — IRON/SUPPLY — so no circularity) and so, in principle,
  //    a FOOD-dormant Mine/Camp shouldn't still grant its IRON/SUPPLY boost.
  //    Not implemented: doing so needs FOOD dormancy resolved BEFORE this
  //    function's supply output (a two-pass computation), a real
  //    architecture change touching every caller of
  //    resourceSlotSupplyForPlayer, not a local fix. Known gap, flagged for
  //    a future pass, not attempted here.
  const totals = emptyResourceSlotTotals();
  for (const tile of settledTiles) {
    const isActiveStructure = tile.economicStructure?.status === "active";
    const structureType = isActiveStructure ? (tile.economicStructure!.type as BuildableStructureType) : undefined;

    if (structureType && SYNTHESIZER_TYPE_SET.has(structureType)) {
      for (const req of structureSlotRequirements(structureType as SlotStructureType)) totals[req.resource] += req.count;
    }

    if (!tile.resource) continue;
    const base = BASE_SLOTS_BY_TILE_RESOURCE[tile.resource];
    if (!base) continue;
    let slots = base.baseSlots;
    // FARMSTEAD is placement-legal on both FARM and FISH tiles (structure-
    // placement-metadata.json's FARMSTEAD.resourceTypes), but §5.3 is explicit
    // that FISH is a fixed 2 slots forever, "no Farmstead or Waterworks bonus
    // available" — unlike MINE (legally on IRON or GEMS) and CAMP (WOOD or
    // FUR), which stay resource-agnostic on purpose since both of their valid
    // tile types scale normally, FARMSTEAD's own boost must NOT apply on FISH.
    const boostBlockedOnFish = structureType === "FARMSTEAD" && tile.resource !== "FARM";
    const boost = structureType && !boostBlockedOnFish ? TILE_SLOT_BOOST_STRUCTURES[structureType] : undefined;
    if (boost) slots += boost;
    if (
      structureType === "FARMSTEAD" &&
      tile.resource === "FARM" &&
      waterworksKeys.size > 0 &&
      withinRadiusOfAnyKey(tile.x, tile.y, waterworksKeys, WATERWORKS_RADIUS)
    ) {
      slots += WATERWORKS_FARMSTEAD_FOOD_SLOT_BONUS;
    }
    if (
      structureType === "MINE" &&
      foundryKeys.size > 0 &&
      withinRadiusOfAnyKey(tile.x, tile.y, foundryKeys, FOUNDRY_RADIUS)
    ) {
      slots += FOUNDRY_MINE_SLOT_BONUS;
    }
    totals[base.slotResource] += slots;
  }
  return totals;
};

/**
 * Slot demand from every structure a player currently owns across their
 * territory (settled AND frontier — Siege Outposts can sit on unsettled
 * tiles). Counts a structure regardless of status (under_construction /
 * active / inactive / removing): per §5.1 it occupies its slot for its
 * whole lifetime, from build start to the moment removal actually
 * completes (the tile field is cleared), not just while "active".
 *
 * Synthesizers (SYNTHESIZER_STRUCTURE_TYPES) are deliberately excluded —
 * per §6.4 they're a supply *source* (see resourceSlotSupplyForPlayer), not
 * a demand consumer, despite having an entry in STRUCTURE_SLOT_REQUIREMENTS
 * (needed there for their own build-time gate and gold-upkeep lookup).
 *
 * A settled, owned town itself also draws townFoodSlotDemandForTier(tier)
 * FOOD slots (§5.3: "a town requires ~2 food slots to be powered", +1 per
 * UPGRADE_TOWN_TIER step past TOWN — a bigger, better-fed population costs
 * more) — separate from, and additive with, any economicStructure sitting
 * on that same tile.
 */
type WaivableTile = Pick<
  DomainTileState,
  "fort" | "observatory" | "siegeOutpost" | "economicStructure" | "town" | "ownerId" | "ownershipState"
> &
  Partial<Pick<DomainTileState, "x" | "y">>;

// Shared by resourceSlotDemandForPlayer (totals) and
// resourceSlotDormantContributorsForPlayer (per-contributor dormancy sets) so
// the two can never disagree on which structures exist or how a §23.2 waiver
// reduces their demand — the exact duplicate-logic risk this codebase has
// hit before (Customs House/toDomainTile, the Fort/Siege upkeep bug).
const buildDemandContributors = (
  ownedTiles: Iterable<WaivableTile>,
  playerId: string,
  waivers: SlotWaivers
): DormancyContributor[] => {
  const contributors: DormancyContributor[] = [];
  const addContributor = (tileKey: string, field: DormancyContributorField, type: SlotStructureType, activatedAt: number): void => {
    for (const req of structureSlotRequirements(type)) {
      contributors.push({ key: `${tileKey}:${field}`, resource: req.resource, count: req.count, activatedAt });
    }
  };
  for (const tile of ownedTiles) {
    const tileKey = simulationTileKey(tile.x ?? 0, tile.y ?? 0);
    if (tile.fort?.ownerId === playerId) {
      addContributor(tileKey, "fort", (tile.fort.variant ?? "FORT") as SlotStructureType, tile.fort.activatedAt ?? 0);
    }
    if (tile.observatory?.ownerId === playerId) {
      addContributor(tileKey, "observatory", "OBSERVATORY" as SlotStructureType, tile.observatory.activatedAt ?? 0);
    }
    if (tile.siegeOutpost?.ownerId === playerId) {
      addContributor(tileKey, "siegeOutpost", (tile.siegeOutpost.variant ?? "SIEGE_OUTPOST") as SlotStructureType, tile.siegeOutpost.activatedAt ?? 0);
    }
    if (tile.economicStructure?.ownerId === playerId && !SYNTHESIZER_TYPE_SET.has(tile.economicStructure.type)) {
      addContributor(tileKey, "economicStructure", tile.economicStructure.type as SlotStructureType, tile.economicStructure.activatedAt ?? 0);
    }
    if (tile.town && tile.ownerId === playerId && tile.ownershipState === "SETTLED") {
      contributors.push({
        key: `${tileKey}:town`,
        resource: "FOOD",
        count: townFoodSlotDemandForTier(tile.town.populationTier),
        activatedAt: TOWN_FOOD_DEMAND_ACTIVATED_AT
      });
    }
  }
  return noWaiversConfigured(waivers) ? contributors : applySlotWaivers(contributors, waivers);
};

const applySlotWaivers = (contributors: DormancyContributor[], waivers: SlotWaivers): DormancyContributor[] => {
  const waiveEarliestStructures = (fieldSuffix: ":fort" | ":siegeOutpost", waiveCount: number): ReadonlySet<string> => {
    if (waiveCount <= 0) return new Set();
    const activatedAtByKey = new Map<string, number>();
    for (const c of contributors) {
      if (c.key.endsWith(fieldSuffix)) activatedAtByKey.set(c.key, c.activatedAt);
    }
    const keys = [...activatedAtByKey.keys()].sort(
      (a, b) => (activatedAtByKey.get(a) ?? 0) - (activatedAtByKey.get(b) ?? 0) || a.localeCompare(b)
    );
    return new Set(keys.slice(0, waiveCount));
  };
  const waivedForts = waiveEarliestStructures(":fort", waivers.fortIronSlotWaiverCount);
  const waivedOutposts = waiveEarliestStructures(":siegeOutpost", waivers.outpostSupplySlotWaiverCount);

  const townKeys = [...new Set(contributors.filter((c) => c.key.endsWith(":town")).map((c) => c.key))].sort((a, b) => a.localeCompare(b));
  const firstWaivedTownKeys = new Set(
    waivers.firstTownsFoodSlotWaiverCount > 0 ? townKeys.slice(0, waivers.firstTownsFoodSlotWaiverCount) : []
  );

  return contributors.map((c) => {
    if (c.key.endsWith(":fort") && c.resource === "IRON" && waivedForts.has(c.key)) return { ...c, count: 0 };
    if (c.key.endsWith(":siegeOutpost") && c.resource === "SUPPLY" && waivedOutposts.has(c.key)) return { ...c, count: 0 };
    if (c.key.endsWith(":town")) {
      const waiver = Math.max(waivers.allTownsFoodSlotWaiverPerTown, firstWaivedTownKeys.has(c.key) ? 1 : 0);
      if (waiver > 0) return { ...c, count: Math.max(0, c.count - waiver) };
    }
    return c;
  });
};

export const resourceSlotDemandForPlayer = (
  ownedTiles: Iterable<WaivableTile>,
  playerId: string,
  waivers: SlotWaivers = emptySlotWaivers()
): ResourceSlotTotals => {
  const totals = emptyResourceSlotTotals();
  for (const contributor of buildDemandContributors(ownedTiles, playerId, waivers)) {
    totals[contributor.resource] += contributor.count;
  }
  return totals;
};

/**
 * The slot requirement already being contributed by whatever currently
 * occupies `tileField` on `target` (owned by `playerId`). Builds that
 * upgrade a structure in place (Fort/Siege tier ladders; the granary
 * Advanced-tier pair) overwrite that tile field with a new
 * "under_construction" record for the *new* tier in the same command that
 * starts the build (see handleBuildStructureCommand), so the old tier's
 * demand would otherwise double-count against the new tier's full
 * requirement for the length of the build. Netting this out against the
 * new requirement means an upgrade only needs *additional* slot capacity
 * for the delta (e.g. FORT->IRON_BASTION needs 1 more IRON slot, not a
 * fresh 2), matching how the game already treats every other build-cost
 * dimension as "pay the new tier's absolute cost, no partial refund of the
 * old tier's sunk cost" — this only prevents slots from being charged
 * *twice* for the same in-place upgrade, not from being charged at all.
 * (The synthesizer Advanced-tier pairs never reach this — hasFreeResourceSlots
 * skips the gate entirely for SYNTHESIZER_STRUCTURE_TYPES.)
 */
// §5.4: dormancy on slot shortfall. When a resource's total demand exceeds
// its supply (lost a tile, over-captured), the newest built-or-captured
// structure loses power first (decided tie-break; the plan's own "Open
// questions" resolution log also settles the monument-hostage follow-on
// question: no release valve needed, a dormant monument is just a normal
// capture target — §9). A structure's `activatedAt` (set on build completion
// and refreshed on capture, see capture-structures.ts/runtime-structure-
// command-handlers.ts) is the recency signal; each contributor is identified
// as `${tileKey}:${field}` so a multi-resource structure (e.g. Bank needs
// FOOD+CRYSTAL) can be dormant for one of its resources independently of the
// other, and callers union across resources to ask "is this structure
// dormant at all."
//
// Towns are a deliberate exception to the recency ordering: they don't carry
// an activatedAt (founding/growth isn't tracked as a timestamp today), and
// losing a whole town's income outright is a much bigger deal than one
// building going dark, so town FOOD demand is pinned as the oldest
// (least-likely-to-go-dormant) contributor rather than competing on equal
// footing with buildings. Flagged here as a simplification, not a plan
// requirement — the plan doesn't specify town-vs-building ordering.
export type DormancyContributorField = "fort" | "observatory" | "siegeOutpost" | "economicStructure" | "town";
export type ResourceSlotDormancy = Record<SlotResource, ReadonlySet<string>>;

const TOWN_FOOD_DEMAND_ACTIVATED_AT = 0;

type DormancyContributor = {
  key: string;
  resource: SlotResource;
  count: number;
  activatedAt: number;
};

export const emptyResourceSlotDormancy = (): ResourceSlotDormancy => ({
  FOOD: new Set(),
  IRON: new Set(),
  CRYSTAL: new Set(),
  SUPPLY: new Set()
});

export const resourceSlotDormantContributorsForPlayer = (
  ownedTiles: Iterable<WaivableTile>,
  playerId: string,
  supply: ResourceSlotTotals,
  waivers: SlotWaivers = emptySlotWaivers()
): ResourceSlotDormancy => {
  const contributors = buildDemandContributors(ownedTiles, playerId, waivers);

  const dormancy = emptyResourceSlotDormancy();
  for (const resource of Object.keys(dormancy) as SlotResource[]) {
    // A §23.2-waived contributor (count reduced to 0 for this resource) must
    // never be a dormancy *candidate* either — it doesn't actually consume a
    // slot of this resource anymore, so it can't go dormant for lacking one.
    const forResource = contributors.filter((c) => c.resource === resource && c.count > 0);
    const totalDemand = forResource.reduce((sum, c) => sum + c.count, 0);
    let shortfall = totalDemand - supply[resource];
    if (shortfall <= 0) continue;
    const newestFirst = [...forResource].sort((a, b) => b.activatedAt - a.activatedAt || a.key.localeCompare(b.key));
    const dormantKeys = dormancy[resource] as Set<string>;
    for (const contributor of newestFirst) {
      if (shortfall <= 0) break;
      dormantKeys.add(contributor.key);
      shortfall -= contributor.count;
    }
  }
  return dormancy;
};

// §14.2: per-structure dormancy detail for the client's "dormant/unpowered
// structure" indicator — which specific tiles+fields are dormant, and which
// of their required resource(s) are short. A single shared function so the
// live (Runtime) and cold/reconnect (snapshot-economy-helpers.ts) paths,
// which each maintain their own ResourceSlotDormancy computation, can never
// disagree on the detail shape (the same duplication risk already flagged
// elsewhere in this codebase for hasSupportedStructure/toDomainTile).
// Excludes ":town" contributors — town FOOD dormancy already surfaces via
// town.isFed, a separate, existing indicator.
export type DormantStructureDetail = { key: string; resources: SlotResource[] };

export const dormantStructureDetailsFromDormancy = (dormancy: ResourceSlotDormancy): DormantStructureDetail[] => {
  const resourcesByKey = new Map<string, SlotResource[]>();
  for (const resource of Object.keys(dormancy) as SlotResource[]) {
    for (const key of dormancy[resource]) {
      if (key.endsWith(":town")) continue;
      const existing = resourcesByKey.get(key);
      if (existing) existing.push(resource);
      else resourcesByKey.set(key, [resource]);
    }
  }
  return [...resourcesByKey.entries()].map(([key, resources]) => ({ key, resources }));
};

export const currentTileFieldSlotRequirements = (
  target: Pick<DomainTileState, "fort" | "siegeOutpost" | "economicStructure">,
  tileField: "fort" | "observatory" | "siegeOutpost" | "economicStructure",
  playerId: string
): StructureSlotRequirement[] => {
  if (tileField === "fort" && target.fort?.ownerId === playerId) {
    return structureSlotRequirements((target.fort.variant ?? "FORT") as SlotStructureType);
  }
  if (tileField === "siegeOutpost" && target.siegeOutpost?.ownerId === playerId) {
    return structureSlotRequirements((target.siegeOutpost.variant ?? "SIEGE_OUTPOST") as SlotStructureType);
  }
  if (tileField === "economicStructure" && target.economicStructure?.ownerId === playerId) {
    return structureSlotRequirements(target.economicStructure.type as SlotStructureType);
  }
  return [];
};
