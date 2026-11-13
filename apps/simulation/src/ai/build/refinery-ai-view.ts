// Bounded planner-side reads for town refineries (Phase 2 of
// docs/territory-development-plan.md, "AI"). The refinery rules themselves
// are pure and shared (packages/shared/src/refineries/); this file only finds
// the inputs they need without an O(owned-territory) scan: the AI's towns
// (at most TOWN_ECONOMY_VIEW_MAX_TOWNS) and the refineries standing on their
// support rings. Nothing is cached; every call reads the planner's tile map.
import {
  BASE_SLOTS_BY_TILE_RESOURCE,
  evaluateRefineries,
  isRefineryType,
  supportRingCandidates,
  supportRingRadiusForTier,
  type EconomicStructureType,
  type RefineryEvaluation,
  type RefineryFieldResource,
  type RefineryTile,
  type RefineryTownResolver,
  type SlotResource
} from "@border-empires/shared";
import { assignedTownKeyForSupportTile, type TownSupportTile } from "../../town-support-lookup.js";
import { TOWN_ECONOMY_VIEW_MAX_TOWNS } from "./town-economy-view.js";

/** The tile fields this file reads; planner tiles (StructurePlannerTile, AutomationPlannerTile) fit. */
export type RefineryPlannerTile = TownSupportTile & {
  terrain: RefineryTile["terrain"];
  economicStructure?: {
    ownerId?: string | undefined;
    type?: EconomicStructureType | undefined;
    status?: string | undefined;
    refineryField?: { x: number; y: number; assignedAt: number } | undefined;
  } | null | undefined;
};

/**
 * The shared rules type their records with a required ownerId/status; the
 * planner's copies mark them optional. The rules only compare those fields
 * for equality, so a missing value simply fails the comparison (an
 * ownerless record is never the AI's, a statusless one never "active").
 */
export const asRefineryTiles = <T extends RefineryPlannerTile>(tiles: ReadonlyMap<string, T>): ReadonlyMap<string, RefineryTile> =>
  tiles as unknown as ReadonlyMap<string, RefineryTile>;

const isOwnedTownTile = (playerId: string, tile: RefineryPlannerTile | undefined): tile is RefineryPlannerTile =>
  Boolean(tile && tile.ownerId === playerId && tile.ownershipState === "SETTLED" && tile.town &&
    tile.town.populationTier !== "SETTLEMENT");

/**
 * The player's TOWN-tier-or-higher towns, smallest tile first, capped. Reads
 * the town-economy view's keys when the planner has it (every town, already
 * capped), else town tiles among `fallbackTiles` (the build candidates,
 * which include every settled town tile).
 */
export const refineryPlannerTowns = <T extends RefineryPlannerTile>(
  playerId: string, tilesByKey: ReadonlyMap<string, T>, townKeys: readonly string[] | undefined, fallbackTiles: readonly T[]
): T[] => {
  const towns: T[] = [];
  if (townKeys) {
    for (const key of townKeys) {
      const tile = tilesByKey.get(key);
      if (isOwnedTownTile(playerId, tile)) towns.push(tile);
    }
  } else {
    for (const tile of fallbackTiles) if (isOwnedTownTile(playerId, tile)) towns.push(tile);
  }
  return towns.sort((a, b) => a.x - b.x || a.y - b.y).slice(0, TOWN_ECONOMY_VIEW_MAX_TOWNS);
};

/** The player's refineries on the support rings of `towns` (any status), deduplicated. */
export const refineryTilesAroundTowns = <T extends RefineryPlannerTile>(
  playerId: string, tilesByKey: ReadonlyMap<string, T>, towns: readonly T[]
): T[] => {
  const found = new Map<string, T>();
  for (const town of towns) {
    const radius = supportRingRadiusForTier(town.town?.populationTier);
    for (const { tile } of supportRingCandidates(tilesByKey, town.x, town.y, radius)) {
      const record = tile.economicStructure;
      if (record?.ownerId === playerId && tile.ownerId === playerId && isRefineryType(record.type)) found.set(`${tile.x},${tile.y}`, tile);
    }
  }
  return [...found.values()];
};

/** The same support-ring town resolver the runtime uses, over the planner map. */
export const plannerRefineryTownResolver = <T extends RefineryPlannerTile>(tilesByKey: ReadonlyMap<string, T>): RefineryTownResolver =>
  (ownerId, x, y) => assignedTownKeyForSupportTile(tilesByKey, ownerId, x, y);

/** evaluateRefineries over the planner map, with the same support-ring town resolver the runtime uses. */
export const evaluatePlannerRefineries = <T extends RefineryPlannerTile>(
  tilesByKey: ReadonlyMap<string, T>, refineryTiles: readonly T[]
): Map<string, RefineryEvaluation> =>
  refineryTiles.length === 0
    ? new Map()
    : evaluateRefineries(asRefineryTiles(tilesByKey), refineryTiles as unknown as RefineryTile[], plannerRefineryTownResolver(tilesByKey));

/** The slot resource a deposit field feeds (GEMS → CRYSTAL). */
export const refinerySlotResource = (resource: RefineryFieldResource): SlotResource =>
  BASE_SLOTS_BY_TILE_RESOURCE[resource]!.slotResource;

/** Free slots (supply − demand) of a resource; undefined when the planner has no slot totals. */
export const freeSlotsOf = (
  supply: Partial<Record<SlotResource, number>> | undefined, demand: Partial<Record<SlotResource, number>> | undefined, resource: SlotResource
): number | undefined => (supply && demand ? (supply[resource] ?? 0) - (demand[resource] ?? 0) : undefined);
