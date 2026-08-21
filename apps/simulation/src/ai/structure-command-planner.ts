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
  naturalWonder?: unknown;
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
 * here newly cover" — scans unowned-by-this-player LAND tiles (neutral or
 * enemy frontier) within OUTPOST_REACH_RADIUS of the candidate, toroidally
 * wrapped, and weights them by strategic value: a tile carrying a town/
 * resource/dock/natural-wonder ("valuable", mirrors frontier-scoring.ts's
 * "economic" class) counts far more than plain land, since the AI's
 * reach-starved trigger (ai-economic-heuristics.ts's isReachStarved) only
 * fires once valuables in reach are claimed out — a beacon exists to reach
 * the *next* one, not to blindly grow the border into empty land. This
 * deliberately does NOT consult the real reach map (not always available to
 * this planner-static builder) — it's a proxy for "is this candidate near
 * something worth claiming". Bounded to a fixed-size box scan per candidate,
 * not a world scan.
 */
const VALUABLE_TARGET_COVERAGE_WEIGHT = 8;

const estimateNewReachCoverage = (
  playerId: string,
  tile: StructurePlannerTile,
  tilesByKey: TileLookup
): { score: number; hasValuable: boolean } => {
  let covered = 0;
  let hasValuable = false;
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
      const isValuable = Boolean(neighbor.town || neighbor.resource || neighbor.dockId || neighbor.naturalWonder);
      if (isValuable) hasValuable = true;
      covered += isValuable ? VALUABLE_TARGET_COVERAGE_WEIGHT : 1;
    }
  }
  return { score: covered, hasValuable };
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
 *
 * Candidates may be owned+SETTLED **or** owned+FRONTIER. RELAY_BEACON_SPEC's
 * placement list requires SETTLED (tileIsSettled + ownerOwnsTile,
 * structure-registry-outpost.ts:67-94), so a FRONTIER site can't be built on
 * directly — the caller settles it first and builds on the next plan tick
 * (`needsSettle` on the returned plan says which). Including FRONTIER sites
 * is what unblocks a reach-locked AI: the AI has no standalone SETTLE
 * decision at all (deliberately — a general settle-everything policy would
 * change expansion balance everywhere), so before this its only legal beacon
 * sites were tiles inside the settled core it was already reaching from, and
 * a sprawling frontier could never be converted into new reach. Settling
 * here is purposeful: it happens only to place a beacon that extends reach
 * toward a real prize.
 */
export type RelayBeaconBuildPlan = {
  tile: StructurePlannerTile;
  /** FRONTIER site — SETTLE it first; the beacon build follows once it lands. */
  needsSettle: boolean;
};

// Tie-break penalty for a FRONTIER site over an equally-good SETTLED one: the
// frontier route costs an extra SETTLE (manpower + a development slot + build
// time) before the beacon can even start, so prefer ground already settled
// when both reach the same prize.
const FRONTIER_BEACON_SITE_PENALTY = 40;

export const chooseBestRelayBeaconBuild = (
  player: StructurePlannerPlayer,
  ownedTiles: readonly StructurePlannerTile[],
  tilesByKey: TileLookup,
  candidateTiles: readonly StructurePlannerTile[] = ownedTiles
): RelayBeaconBuildPlan | undefined => {
  const counts = player.ownedStructureCounts ? EMPTY_OWNED_STRUCTURE_COUNTS : tallyOwnedStructures(player.id, ownedTiles);
  const existingOwnedCount = plannedOwnedStructureCount(player, counts, "RELAY_BEACON");
  if (!canAffordStructure(player, playerTechSet(player), "RELAY_BEACON", existingOwnedCount)) return undefined;

  let best: { tile: StructurePlannerTile; score: number; needsSettle: boolean } | undefined;
  for (const tile of candidateTiles) {
    if (tile.ownerId !== player.id || tile.terrain !== "LAND") continue;
    const isSettled = tile.ownershipState === "SETTLED";
    const needsSettle = tile.ownershipState === "FRONTIER";
    if (!isSettled && !needsSettle) continue;
    if (!tileOpenForStructure(tile)) continue;
    // A FRONTIER site is judged as the SETTLED tile it's about to become —
    // structureShowsOnTile keys off ownershipState, so checking it as-is
    // would reject every frontier candidate on the state we're about to change.
    if (!structureVisibleOnTile("RELAY_BEACON", player.id, needsSettle ? { ...tile, ownershipState: "SETTLED" } : tile, tilesByKey)) continue;
    const newCoverage = estimateNewReachCoverage(player.id, tile, tilesByKey);
    // Requiring a known valuable tile here created a dead end: EXPAND stops
    // once nothing adjacent+in-reach is worth claiming, which is exactly
    // when isReachStarved makes this function get called — but a beacon
    // site could only ever be proposed if a resource/town/dock/wonder was
    // ALREADY visible in its scan radius, and that scan only sees tiles
    // already synced locally (tilesByKey). Genuinely new ground just past
    // current vision was invisible to it, so an AI could get stuck on WAIT
    // forever even with real, unclaimed land plausibly one step further out
    // (confirmed live: multiple empires vetoed on every decision class
    // simultaneously with zero visible neutral candidates). A site just
    // needs to newly cover SOME unowned land to be worth proposing at all —
    // estimateNewReachCoverage's VALUABLE_TARGET_COVERAGE_WEIGHT already
    // makes a known prize win the ranking below when one exists; this just
    // stops requiring one to exist for a beacon to fire at all.
    if (newCoverage.score <= 0) continue;
    let score = newCoverage.score * 10;
    if (tile.dockId) score += 30; // cross-island reach floor per plan's DOCK_REACH_RADIUS note
    if (needsSettle) score -= FRONTIER_BEACON_SITE_PENALTY;
    if (!best || score > best.score) best = { tile, score, needsSettle };
  }
  return best ? { tile: best.tile, needsSettle: best.needsSettle } : undefined;
};
