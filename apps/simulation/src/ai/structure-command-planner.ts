import type { DomainStrategicResourceKey, DomainTileState } from "@border-empires/game-domain";
import {
  bestFortTierForTech,
  bestSiegeTierForTech,
  OUTPOST_REACH_RADIUS,
  structureBuildGoldCost,
  structureBuildManpowerCostScaled,
  structureCostDefinition,
  structureShowsOnTile,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  wrapX,
  wrapY,
  type EconomicStructureType,
  type Terrain
} from "@border-empires/shared";

import { forEachFrontierNeighbor } from "../frontier-topology.js";
import {
  economicStructureTypesForSupportedTown,
  openTownSupportNeighborTiles,
  townSupportStructureShowsOnTile
} from "../town-support-lookup.js";
import { economyWeak } from "./ai-economic-heuristics.js";
import type { PlannerOwnedStructureCounts } from "./planner-owned-structure-counts.js";

type StrategicResourceKey = DomainStrategicResourceKey;

export type StructurePlannerPlayer = {
  id: string;
  points: number;
  manpower?: number;
  techIds?: readonly string[];
  strategicResources?: Partial<Record<StrategicResourceKey, number>>;
  settledTileCount?: number;
  townCount?: number;
  incomePerMinute?: number;
  ownedStructureCounts?: PlannerOwnedStructureCounts;
};

export type StructurePlannerTile = {
  x: number;
  y: number;
  terrain: Terrain;
  ownerId?: string | undefined;
  ownershipState?: DomainTileState["ownershipState"] | undefined;
  resource?: DomainTileState["resource"] | undefined;
  dockId?: string | undefined;
  town?: {
    supportMax?: number | undefined;
    supportCurrent?: number | undefined;
    populationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS" | undefined;
  } | null | undefined;
  fort?: { ownerId?: string | undefined; status?: string | undefined } | null | undefined;
  observatory?: { ownerId?: string | undefined; status?: string | undefined } | null | undefined;
  siegeOutpost?: { ownerId?: string | undefined; status?: string | undefined } | null | undefined;
  economicStructure?: { ownerId?: string | undefined; type?: EconomicStructureType | undefined; status?: string | undefined } | null | undefined;
};

type TileLookup = ReadonlyMap<string, StructurePlannerTile>;

const resourceStock = (
  player: StructurePlannerPlayer,
  resource: StrategicResourceKey
): number => Math.max(0, player.strategicResources?.[resource] ?? 0);

const tileKeyOf = (x: number, y: number): string => `${x},${y}`;

type OwnedStructureCounts = {
  FORT: number;
  SIEGE_OUTPOST: number;
  economic: Map<EconomicStructureType, number>;
};

const EMPTY_OWNED_STRUCTURE_COUNTS: OwnedStructureCounts = {
  FORT: 0,
  SIEGE_OUTPOST: 0,
  economic: new Map()
};

const tallyOwnedStructures = (
  playerId: string,
  tiles: Iterable<StructurePlannerTile>
): OwnedStructureCounts => {
  const counts: OwnedStructureCounts = {
    FORT: 0,
    SIEGE_OUTPOST: 0,
    economic: new Map()
  };
  for (const tile of tiles) {
    if (tile.fort?.ownerId === playerId) counts.FORT += 1;
    if (tile.siegeOutpost?.ownerId === playerId) counts.SIEGE_OUTPOST += 1;
    const econ = tile.economicStructure;
    if (econ?.ownerId === playerId && econ.type) {
      counts.economic.set(econ.type, (counts.economic.get(econ.type) ?? 0) + 1);
    }
  }
  return counts;
};

const economicCount = (counts: OwnedStructureCounts, type: EconomicStructureType): number =>
  counts.economic.get(type) ?? 0;

const plannedOwnedStructureCount = (
  player: StructurePlannerPlayer,
  fallbackCounts: OwnedStructureCounts,
  structureKind: "FORT" | "SIEGE_OUTPOST" | EconomicStructureType
): number => {
  const cached = player.ownedStructureCounts?.[structureKind];
  if (typeof cached === "number") return cached;
  if (structureKind === "FORT") return fallbackCounts.FORT;
  if (structureKind === "SIEGE_OUTPOST") return fallbackCounts.SIEGE_OUTPOST;
  return economicCount(fallbackCounts, structureKind);
};

const supportedTownCount = (playerId: string, tile: StructurePlannerTile, tilesByKey: TileLookup): number => {
  let count = 0;
  forEachFrontierNeighbor(tile.x, tile.y, (nx, ny) => {
    const neighbor = tilesByKey.get(`${nx},${ny}`);
    if (neighbor?.ownerId === playerId && neighbor.ownershipState === "SETTLED" && neighbor.town) count += 1;
  });
  return count;
};

const supportedDockCount = (playerId: string, tile: StructurePlannerTile, tilesByKey: TileLookup): number => {
  let count = 0;
  forEachFrontierNeighbor(tile.x, tile.y, (nx, ny) => {
    const neighbor = tilesByKey.get(`${nx},${ny}`);
    if (neighbor?.ownerId === playerId && neighbor.ownershipState === "SETTLED" && neighbor.dockId) count += 1;
  });
  return count;
};

const tileOpenForStructure = (tile: StructurePlannerTile): boolean =>
  !tile.observatory && !tile.siegeOutpost && !tile.economicStructure;

const structureVisibleOnTile = (
  structureType: "FORT" | "SIEGE_OUTPOST" | EconomicStructureType,
  playerId: string,
  tile: StructurePlannerTile,
  tilesByKey: TileLookup
): boolean =>
  structureShowsOnTile(structureType, {
    ownershipState: tile.ownershipState,
    resource: tile.resource,
    dockId: tile.dockId,
    townPopulationTier: tile.town?.populationTier,
    supportedTownCount: supportedTownCount(playerId, tile, tilesByKey),
    supportedDockCount: supportedDockCount(playerId, tile, tilesByKey)
  });

const playerTechSet = (player: StructurePlannerPlayer): ReadonlySet<string> => new Set(player.techIds ?? []);

const canAffordGold = (player: StructurePlannerPlayer, goldCost: number): boolean => player.points >= goldCost;

// Build gold costs are globally zeroed (structure-costs.ts's
// STRUCTURE_COST_DEFINITIONS header, manpower-economy-rewrite-plan.md §12) —
// manpower is the real build cost, so canAffordGold above is now a no-op gate
// and this is the one that decides affordability. Without it every selector in
// this file happily proposed builds the player could not pay for, which the
// runtime then rejected with INSUFFICIENT_MANPOWER
// (runtime-structure-command-handlers.ts's manpower check), burning the tick's
// action budget and a rejection cooldown on every cycle. Mirrors the
// "authoritative gate" fix already applied to EXPAND/ATTACK — see
// hasAnyExpandCandidate / hasAnyAttackCandidate in ai/utility/decisions.ts.
//
// Deliberately compares against the UNDISCOUNTED cost: the runtime applies
// Quartermaster's Office's 0.67x war-structure discount by proximity, which
// isn't resolvable from planner state. Over-charging here can only skip a build
// that was affordable (safe), whereas under-charging would reintroduce exactly
// the reject loop this gate exists to close. Moot for AI players today in any
// case — nothing in the planner can propose a QUARTERMASTERS_OFFICE, so no AI
// ever owns one (see docs/ai-structure-building-rewrite-plan.md §1.1).
const canAffordManpower = (player: StructurePlannerPlayer, manpowerCost: number): boolean =>
  (player.manpower ?? 0) >= manpowerCost;

const canAffordStructure = (
  player: StructurePlannerPlayer,
  techSet: ReadonlySet<string>,
  structureType: EconomicStructureType,
  existingOwnedCount: number
): boolean => {
  const requiredTech: Partial<Record<EconomicStructureType, string>> = {
    FARMSTEAD: "agriculture",
    UMBRITE_RIG: "leatherworking",
    MINE: "mining",
    MINTWORKS: "trade",
    GRANARY: "pottery"
  };
  const requiredTechId = requiredTech[structureType];
  if (requiredTechId && !techSet.has(requiredTechId)) return false;
  if (!canAffordGold(player, structureBuildGoldCost(structureType, existingOwnedCount))) return false;
  // Same existingOwnedCount the runtime scales by (it passes
  // ownedStructureCountForPlayer into structureBuildManpowerCostScaled), so the
  // escalating Titanium/Umbrite Weapons Factory costs stay in lockstep here.
  if (!canAffordManpower(player, structureBuildManpowerCostScaled(structureType, existingOwnedCount))) return false;
  const resourceCost = structureCostDefinition(structureType).resourceCost;
  if (!resourceCost) return true;
  return resourceStock(player, resourceCost.resource) >= resourceCost.amount;
};

const foodCoverageLow = (player: StructurePlannerPlayer): boolean =>
  resourceStock(player, "FOOD") <= Math.max(24, (player.townCount ?? 0) * 12);

export const chooseBestEconomicBuild = (
  player: StructurePlannerPlayer,
  ownedTiles: readonly StructurePlannerTile[],
  tilesByKey: TileLookup,
  candidateTiles: readonly StructurePlannerTile[] = ownedTiles
): { tile: StructurePlannerTile; structureType: EconomicStructureType } | undefined => {
  let best: { tile: StructurePlannerTile; structureType: EconomicStructureType; score: number } | undefined;
  const foodLow = foodCoverageLow(player);
  // §24.5: consolidated onto the shared ai-economic-heuristics.ts
  // implementation instead of this file's own hand-written duplicate (which
  // had drifted to a different signature but the same stale gold-income
  // logic) — see that file for the manpower-based rationale.
  const econWeak = economyWeak(player.manpower ?? 0, player.settledTileCount ?? 0);
  const counts = player.ownedStructureCounts ? EMPTY_OWNED_STRUCTURE_COUNTS : tallyOwnedStructures(player.id, ownedTiles);
  const techSet = playerTechSet(player);
  for (const tile of candidateTiles) {
    if (tile.ownerId !== player.id || tile.ownershipState !== "SETTLED" || tile.terrain !== "LAND") continue;
    if (!tileOpenForStructure(tile)) continue;
    const candidates: Array<{ type: EconomicStructureType; score: number }> = [];
    // Town-support structures (MINTWORKS/GRANARY) build on an open,
    // already-SETTLED neighbor tile assigned to this town
    // (resolveTownSupportTarget in runtime-structure-command-handlers.ts),
    // never on the town tile itself. Computed once per tile — the neighbor
    // scan is identical regardless of which of the three types is chosen, so
    // scanning it per-candidate-type would triple an 8-neighbor scan for no
    // reason (see town-support-lookup.ts).
    let openSupportNeighbors: readonly StructurePlannerTile[] | undefined;
    let existingSupportStructureTypes: ReadonlySet<EconomicStructureType> | undefined;
    const townKey = tileKeyOf(tile.x, tile.y);
    if (tile.resource === "FARM" || tile.resource === "FISH") {
      candidates.push({ type: "FARMSTEAD", score: foodLow ? 190 : 70 });
    } else if (tile.resource === "UMBRITE") {
      candidates.push({ type: "UMBRITE_RIG", score: econWeak ? 58 : 42 });
    } else if (tile.resource === "TITANIUM" || tile.resource === "GEMS") {
      candidates.push({ type: "MINE", score: econWeak ? 62 : 46 });
    } else if (tile.town && tile.town.populationTier !== "SETTLEMENT" &&
        (typeof tile.town.supportCurrent !== "number" || typeof tile.town.supportMax !== "number" || tile.town.supportCurrent < tile.town.supportMax)) {
      openSupportNeighbors = openTownSupportNeighborTiles(tilesByKey, player.id, townKey);
      // A town missing support capacity does NOT guarantee an open neighbor
      // exists to host the structure — the town may be boxed in by FRONTIER
      // neighbors or neighbors already holding a structure. Without this
      // check the AI proposed BUILD_ECONOMIC_STRUCTURE for towns with
      // nowhere to place it, and the runtime rejected ~99.9% of those
      // commands in production, burning the tick's action budget every time.
      if (openSupportNeighbors.length > 0) {
        // Computed once per tile, not per candidate type — see
        // economicStructureTypesForSupportedTown's docs in town-support-lookup.ts.
        existingSupportStructureTypes = economicStructureTypesForSupportedTown(tilesByKey, player.id, townKey);
        candidates.push({ type: foodLow ? "GRANARY" : "MINTWORKS", score: foodLow ? 160 : 54 });
        candidates.push({ type: "GRANARY", score: foodLow ? 132 : 20 });
      }
    }
    for (const candidate of candidates) {
      const existingOwnedCount = plannedOwnedStructureCount(player, counts, candidate.type);
      if (!canAffordStructure(player, techSet, candidate.type, existingOwnedCount)) continue;
      if (!structureVisibleOnTile(candidate.type, player.id, tile, tilesByKey)) continue;
      if (
        openSupportNeighbors &&
        !openSupportNeighbors.some((neighbor) => townSupportStructureShowsOnTile(tilesByKey, player.id, neighbor, candidate.type))
      ) {
        continue;
      }
      // A town needing MORE support capacity overall (supportCurrent <
      // supportMax, checked above) does not mean it's missing THIS specific
      // type — it might already have a GRANARY and just need a Mintworks.
      // The runtime rejects a duplicate ("town already has granary") via
      // economicStructureForSupportedTown; without this same check here the
      // AI kept proposing a structure type the town already had, on repeat,
      // every rejection-cooldown cycle, forever (see town-support-lookup.ts).
      if (existingSupportStructureTypes?.has(candidate.type)) {
        continue;
      }
      const next = { tile, structureType: candidate.type, score: candidate.score };
      if (!best || next.score > best.score) best = next;
    }
  }
  return best ? { tile: best.tile, structureType: best.structureType } : undefined;
};

export const chooseBestFortBuild = (
  player: StructurePlannerPlayer,
  ownedTiles: readonly StructurePlannerTile[],
  tilesByKey: TileLookup,
  candidateTiles: readonly StructurePlannerTile[] = ownedTiles
): StructurePlannerTile | undefined => {
  if (!playerTechSet(player).has("masonry")) return undefined;
  // Titanium/gold requirements must match the tier the runtime will actually
  // build (runtime-structure-command-handlers.ts always resolves a fresh
  // fort via bestFortTierForTech, never the flat base-FORT cost) — a player
  // with fortified-walls/steelworking tech gets TITANIUM_BASTION/THUNDER_BASTION
  // (90/180 titanium, 1800/4200 gold) instead of the base 45 titanium / 900 gold.
  // Using the flat base cost here let the AI repeatedly propose a fort it
  // could never afford, rejected every tick with "insufficient TITANIUM for
  // fort" — confirmed in production (74/74 BUILD_FORT commands rejected).
  const fortTier = bestFortTierForTech((id) => playerTechSet(player).has(id));
  if (resourceStock(player, "TITANIUM") < fortTier.titanium) return undefined;
  if (!canAffordGold(player, fortTier.gold)) return undefined;
  // Tier-aware for the same reason the titanium/gold checks above are: the
  // runtime charges the resolved tier's manpower (fortTier.manpower), not a
  // flat base-FORT figure.
  if (!canAffordManpower(player, fortTier.manpower)) return undefined;

  let best: { tile: StructurePlannerTile; score: number } | undefined;
  for (const tile of candidateTiles) {
    if (tile.ownerId !== player.id || tile.ownershipState !== "SETTLED" || tile.terrain !== "LAND") continue;
    if (tile.fort || !tileOpenForStructure(tile)) continue;
    if (!structureVisibleOnTile("FORT", player.id, tile, tilesByKey)) continue;
    let adjacentLandCount = 0;
    let hostileAdjacency = 0;
    let neutralAdjacency = 0;
    forEachFrontierNeighbor(tile.x, tile.y, (nx, ny) => {
      const neighbor = tilesByKey.get(`${nx},${ny}`);
      if (!neighbor || neighbor.terrain !== "LAND") return;
      adjacentLandCount++;
      if (neighbor.ownerId && neighbor.ownerId !== player.id) hostileAdjacency++;
      else if (!neighbor.ownerId) neutralAdjacency++;
    });
    let score = 0;
    if (tile.town) score += 140;
    if (tile.dockId) score += 120;
    if (tile.resource) score += 80;
    if (adjacentLandCount <= 3) score += 70;
    if (tile.dockId && adjacentLandCount <= 3) score += 110;
    score += hostileAdjacency * 24 + neutralAdjacency * (tile.dockId ? 10 : 4);
    if (!best || score > best.score) best = { tile, score };
  }
  return best && best.score >= 70 ? best.tile : undefined;
};

export const chooseBestSiegeOutpostBuild = (
  player: StructurePlannerPlayer,
  ownedTiles: readonly StructurePlannerTile[],
  tilesByKey: TileLookup,
  candidateTiles: readonly StructurePlannerTile[] = ownedTiles
): StructurePlannerTile | undefined => {
  if (!playerTechSet(player).has("leatherworking")) return undefined;
  // Same tier-awareness fix as chooseBestFortBuild above: siegecraft/
  // standing-army tech means the runtime builds SIEGE_TOWER/DREAD_TOWER
  // (90/140 umbrite, 60/120 titanium, 1800/4200 gold), not the flat base cost.
  const siegeTier = bestSiegeTierForTech((id) => playerTechSet(player).has(id));
  if (resourceStock(player, "UMBRITE") < siegeTier.umbrite) return undefined;
  if (siegeTier.titanium > 0 && resourceStock(player, "TITANIUM") < siegeTier.titanium) return undefined;
  if (!canAffordGold(player, siegeTier.gold)) return undefined;
  if (!canAffordManpower(player, siegeTier.manpower)) return undefined;

  let best: { tile: StructurePlannerTile; score: number } | undefined;
  for (const tile of candidateTiles) {
    if (tile.ownerId !== player.id || tile.terrain !== "LAND") continue;
    if (tile.fort || tile.observatory || tile.siegeOutpost || tile.economicStructure) continue;
    if (!structureVisibleOnTile("SIEGE_OUTPOST", player.id, tile, tilesByKey)) continue;
    let hostileAdjacency = 0;
    let townPressure = 0;
    let economicPressure = 0;
    forEachFrontierNeighbor(tile.x, tile.y, (nx, ny) => {
      const neighbor = tilesByKey.get(`${nx},${ny}`);
      if (!neighbor || neighbor.terrain !== "LAND" || !neighbor.ownerId || neighbor.ownerId === player.id) return;
      hostileAdjacency += 1;
      if (neighbor.town) townPressure += 1;
      if (neighbor.dockId || neighbor.resource || neighbor.economicStructure) economicPressure += 1;
    });
    if (hostileAdjacency <= 0) continue;
    let score = hostileAdjacency * 120 + townPressure * 140 + economicPressure * 90;
    if (tile.town) score += 50;
    if (tile.dockId) score += 70;
    if (!best || score > best.score) best = { tile, score };
  }
  return best && best.score >= 180 ? best.tile : undefined;
};

// Reach-frontier sample cap for chooseBestRelayBeaconBuild's new-area
// estimate below — keeps the per-candidate radius scan bounded regardless of
// OUTPOST_REACH_RADIUS, per AGENTS.md's AI CPU Guardrails (no O(owned tiles
// x world) scans from planner-static builders). At radius 5 the full box is
// 121 cells; this only matters if the radius constant grows later.
const RELAY_BEACON_REACH_SAMPLE_CAP = 150;

/**
 * Cheap approximation of "how much currently-unreachable land would a beacon
 * here newly cover" — counts unowned-by-this-player LAND tiles (neutral or
 * enemy frontier) within OUTPOST_REACH_RADIUS of the candidate, toroidally
 * wrapped. This deliberately does NOT consult the real reach map (not always
 * available to this planner-static builder) — it's a proxy for "is this
 * candidate near unclaimed territory", which is what actually matters for
 * siting a beacon to grow reach. Bounded to a fixed-size box scan per
 * candidate, not a world scan.
 */
const estimateNewReachCoverage = (
  playerId: string,
  tile: StructurePlannerTile,
  tilesByKey: TileLookup
): number => {
  let covered = 0;
  let scanned = 0;
  outer: for (let dy = -OUTPOST_REACH_RADIUS; dy <= OUTPOST_REACH_RADIUS; dy += 1) {
    for (let dx = -OUTPOST_REACH_RADIUS; dx <= OUTPOST_REACH_RADIUS; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      scanned += 1;
      if (scanned > RELAY_BEACON_REACH_SAMPLE_CAP) break outer;
      const nx = wrapX(tile.x + dx, WORLD_WIDTH);
      const ny = wrapY(tile.y + dy, WORLD_HEIGHT);
      const neighbor = tilesByKey.get(tileKeyOf(nx, ny));
      if (!neighbor || neighbor.terrain !== "LAND") continue;
      if (neighbor.ownerId === playerId) continue;
      covered += 1;
    }
  }
  return covered;
};

/**
 * AI placement scoring for RELAY_BEACON (the reach-projection outpost —
 * fixed-borders-via-reach plan). RELAY_BEACON is an EconomicStructureType
 * that lives on `economicStructure` (Phase 1 debt, see
 * packages/shared/src/structure-registry-outpost.ts), so this mirrors
 * chooseBestEconomicBuild's candidate shape, not chooseBestSiegeOutpostBuild's
 * — but the *placement rule* (owned + SETTLED, no tech gate) and *scoring
 * approach* (score candidates by new-territory coverage near the reach
 * frontier) follow the plan's "build_siege_outpost-style action" template.
 * Candidates must already be owned+SETTLED — RELAY_BEACON_SPEC's placement
 * list (tileIsSettled + ownerOwnsTile, structure-registry-outpost.ts:67-94)
 * enforces this at the runtime; mirrored here so the AI doesn't repeatedly
 * propose builds the runtime will reject.
 */
export const chooseBestRelayBeaconBuild = (
  player: StructurePlannerPlayer,
  ownedTiles: readonly StructurePlannerTile[],
  tilesByKey: TileLookup,
  candidateTiles: readonly StructurePlannerTile[] = ownedTiles
): StructurePlannerTile | undefined => {
  const counts = player.ownedStructureCounts ? EMPTY_OWNED_STRUCTURE_COUNTS : tallyOwnedStructures(player.id, ownedTiles);
  const existingOwnedCount = plannedOwnedStructureCount(player, counts, "RELAY_BEACON");
  if (!canAffordStructure(player, playerTechSet(player), "RELAY_BEACON", existingOwnedCount)) return undefined;

  let best: { tile: StructurePlannerTile; score: number } | undefined;
  for (const tile of candidateTiles) {
    if (tile.ownerId !== player.id || tile.ownershipState !== "SETTLED" || tile.terrain !== "LAND") continue;
    if (!tileOpenForStructure(tile)) continue;
    if (!structureVisibleOnTile("RELAY_BEACON", player.id, tile, tilesByKey)) continue;
    const newCoverage = estimateNewReachCoverage(player.id, tile, tilesByKey);
    if (newCoverage <= 0) continue;
    let score = newCoverage * 10;
    if (tile.dockId) score += 30; // cross-island reach floor per plan's DOCK_REACH_RADIUS note
    if (!best || score > best.score) best = { tile, score };
  }
  return best?.tile;
};
