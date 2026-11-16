// What the refinery pickers offer (docs/territory-development-plan.md, Phase
// 2, Client): for a town and a refinery type, every field of that resource it
// could take (eligible, already processed by another of your refineries, or
// in reach but not linked by your land), with the slots each would add. The
// eligibility and "taken" rules come straight from the shared helpers the
// server validates with (chooseRefineryField / eligibleRefineryFields), so the
// picker never offers a field the server would refuse for that reason.
import {
  REFINERY_BOOSTER_SLOTS_PER_TILE, REFINERY_BOOSTER_TYPE_BY_RESOURCE, REFINERY_FIELD_RESOURCE_BY_TYPE, REFINERY_REACH_LAND_TILES,
  REFINERY_SLOTS_PER_TILE, compareRefineryTiles, effectiveRefineryField, eligibleRefineryFields, isRefineryType, refineryCanHoldField, refineryFieldAt,
  refineryNeighborKeys, refineryTileKey, supportRingCandidates, MAX_SUPPORT_RING_RADIUS, takenRefineryFieldIds, townHasActiveRefineryBooster,
  type RefineryField, type RefineryTile, type RefineryTownResolver, type RefineryType
} from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { clientRefineryTownResolver, refineryTilesView } from "./refinery-client-status.js";

export type RefineryFieldOptionStatus = "eligible" | "taken" | "unlinked";

export type RefineryFieldOption = {
  fieldId: string;
  /** The tile the command sends: the field's tile nearest the town over your land (or over any land when unlinked). */
  anchorX: number;
  anchorY: number;
  tileKeys: readonly string[];
  tileCount: number;
  /** Field tiles you hold garrisoned: the ones that give slots. */
  garrisoned: number;
  perTileSlots: number;
  /** Slots the field adds now (garrisoned tiles), and with every tile garrisoned. */
  slotGain: number;
  fullSlotGain: number;
  /** Land steps from the town tile. */
  distance: number;
  status: RefineryFieldOptionStatus;
  reason?: string;
  /** The refinery already processing it, for a taken field. */
  takenBy?: { x: number; y: number };
};

/** Per processed tile: the refinery's slots, plus the booster's while the town has an active one. */
export const refineryPerTileSlots = (boosted: boolean): number => REFINERY_SLOTS_PER_TILE + (boosted ? REFINERY_BOOSTER_SLOTS_PER_TILE : 0);

const held = (tile: RefineryTile, me: string): boolean => tile.ownerId === me && (tile.ownershipState === "FRONTIER" || tile.ownershipState === "SETTLED");

/** Land-step distance from the town over any LAND (ownership ignored): which fields are in reach at all. */
const landReachFromTown = (tiles: ReadonlyMap<string, RefineryTile>, town: RefineryTile): Map<string, number> => {
  const distances = new Map<string, number>([[refineryTileKey(town.x, town.y), 0]]);
  const queue: RefineryTile[] = [town];
  for (let index = 0; index < queue.length; index += 1) {
    const tile = queue[index]!;
    const distance = distances.get(refineryTileKey(tile.x, tile.y))!;
    if (distance >= REFINERY_REACH_LAND_TILES) continue;
    for (const key of refineryNeighborKeys(tile.x, tile.y)) {
      if (distances.has(key)) continue;
      const neighbor = tiles.get(key);
      if (!neighbor || neighbor.terrain !== "LAND") continue;
      distances.set(key, distance + 1);
      queue.push(neighbor);
    }
  }
  return distances;
};

/** Your refineries that could hold a field reachable from this town (a bounded scan around it). */
const myRefineriesNearTown = (tiles: ReadonlyMap<string, RefineryTile>, me: string, town: RefineryTile): RefineryTile[] =>
  supportRingCandidates(tiles, town.x, town.y, REFINERY_REACH_LAND_TILES * 2 + MAX_SUPPORT_RING_RADIUS)
    .map(({ tile }) => tile)
    .filter((tile) => tile.economicStructure?.ownerId === me && isRefineryType(tile.economicStructure.type));

/** Which of your refineries that could work holds a field (effective field id -> refinery tile), excluding `excludeKey`. */
const holderByField = (
  tiles: ReadonlyMap<string, RefineryTile>, me: string, refineries: readonly RefineryTile[], resolveTown: RefineryTownResolver, excludeKey?: string
): Map<string, RefineryTile> => {
  const holders = new Map<string, RefineryTile>();
  for (const tile of refineries) {
    const record = tile.economicStructure!;
    if (!isRefineryType(record.type) || !record.refineryField || refineryTileKey(tile.x, tile.y) === excludeKey) continue;
    if (!refineryCanHoldField(tile, resolveTown)) continue;
    const resolved = effectiveRefineryField(tiles, me, record.refineryField, REFINERY_FIELD_RESOURCE_BY_TYPE[record.type]);
    if (resolved && !holders.has(resolved.field.id)) holders.set(resolved.field.id, tile);
  }
  return holders;
};

const optionFor = (field: RefineryField, me: string, perTileSlots: number, anchor: { x: number; y: number }, distance: number): Omit<RefineryFieldOption, "status"> => {
  const garrisoned = field.tiles.filter((tile) => tile.ownerId === me && tile.ownershipState === "SETTLED").length;
  return {
    fieldId: field.id, anchorX: anchor.x, anchorY: anchor.y, tileKeys: [...field.keys], tileCount: field.tiles.length, garrisoned,
    perTileSlots, slotGain: garrisoned * perTileSlots, fullSlotGain: field.tiles.length * perTileSlots, distance
  };
};

/**
 * Every field of `type`'s resource the town could take: eligible first, then
 * taken, then unlinked, each nearest first. `excludeRefineryKey` is the
 * refinery being re-assigned (its own field counts as free, as on the server).
 */
export const refineryFieldOptions = (
  clientTiles: ReadonlyMap<string, Tile>, me: string, type: RefineryType, townKey: string, excludeRefineryKey?: string
): RefineryFieldOption[] => {
  const tiles = refineryTilesView(clientTiles);
  const town = tiles.get(townKey);
  if (!town) return [];
  const resource = REFINERY_FIELD_RESOURCE_BY_TYPE[type];
  const refineries = myRefineriesNearTown(tiles, me, town);
  const resolveTown = clientRefineryTownResolver(clientTiles);
  const taken = takenRefineryFieldIds(tiles, me, refineries, resolveTown, excludeRefineryKey);
  const holders = holderByField(tiles, me, refineries, resolveTown, excludeRefineryKey);
  const boosted = townHasActiveRefineryBooster(tiles, me, townKey, REFINERY_BOOSTER_TYPE_BY_RESOURCE[resource], resolveTown);
  const perTileSlots = refineryPerTileSlots(boosted);
  const options: RefineryFieldOption[] = [];
  const seen = new Set<string>();
  for (const eligible of eligibleRefineryFields(tiles, me, type, townKey, taken)) {
    const field = refineryFieldAt(tiles, eligible.anchorX, eligible.anchorY, resource)!;
    seen.add(field.id);
    const holder = holders.get(field.id);
    const base = optionFor(field, me, perTileSlots, { x: eligible.anchorX, y: eligible.anchorY }, eligible.distance);
    options.push(eligible.taken
      ? { ...base, status: "taken", reason: holder ? `Processed by your refinery at (${holder.x}, ${holder.y})` : "Processed by another of your refineries",
        ...(holder ? { takenBy: { x: holder.x, y: holder.y } } : {}) }
      : { ...base, status: "eligible" });
  }
  const reached = [...landReachFromTown(tiles, town)]
    .map(([key, distance]) => ({ tile: tiles.get(key)!, distance }))
    .filter(({ tile }) => tile.resource === resource)
    .sort((a, b) => a.distance - b.distance || compareRefineryTiles(a.tile, b.tile));
  for (const { tile, distance } of reached) {
    const field = refineryFieldAt(tiles, tile.x, tile.y, resource)!;
    if (seen.has(field.id)) continue;
    seen.add(field.id);
    const anyHeld = field.tiles.some((fieldTile) => held(fieldTile, me));
    options.push({ ...optionFor(field, me, perTileSlots, { x: tile.x, y: tile.y }, distance), status: "unlinked",
      reason: anyHeld ? `Not linked: join it to this town with your land within ${REFINERY_REACH_LAND_TILES} tiles` : "Not linked: claim the field and a land path to it" });
  }
  const rank: Record<RefineryFieldOptionStatus, number> = { eligible: 0, taken: 1, unlinked: 2 };
  return options.sort((a, b) => rank[a.status] - rank[b.status] || a.distance - b.distance || a.fieldId.localeCompare(b.fieldId));
};

/** The field containing (x, y) among the options, if any. */
export const fieldOptionContaining = (options: readonly RefineryFieldOption[], x: number, y: number): RefineryFieldOption | undefined => {
  const key = refineryTileKey(x, y);
  return options.find((option) => option.tileKeys.includes(key));
};
