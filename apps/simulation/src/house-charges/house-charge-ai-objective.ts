// AI pursuit of House Charges (docs/house-charges-plan.md, "Computer-run
// empires"): an AI House whose normal expansion objective selector found
// nothing steers expansion toward its first kept charge that is not complete,
// through the planner view's existing expansionObjective (the frontier
// planner favours steps that close distance to it). Point charges are
// O(kept charges); an area charge scans that area's cells (at most a few
// hundred), never the map.
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { HOUSE_CHARGE_METROPOLIS_COUNT, keptHouseCharges, type HouseCharge } from "@border-empires/shared";
import { houseChargesWorldFor } from "./house-charges-world.js";

export type HouseChargeExpansionObjective = { x: number; y: number; kind: "neutral_value" | "enemy" };

const BARBARIAN_PLAYER_ID = "barbarian-1";

const isGarrisonedBy = (tile: DomainTileState | undefined, playerId: string): boolean =>
  Boolean(tile && tile.ownerId === playerId && tile.ownershipState === "SETTLED");

const targetTileKey = (targetKey: string): string => targetKey.slice(targetKey.indexOf(":") + 1);

/** A landmass or region's LAND tile the House does not hold yet, nearest its centre: never a sea or mountain centroid. */
const openAreaTile = (cells: Int32Array, width: number, centre: { x: number; y: number }, tiles: ReadonlyMap<string, DomainTileState>, playerId: string): { x: number; y: number } | undefined => {
  let best: { x: number; y: number; distance: number } | undefined;
  for (const cell of cells) {
    const x = cell % width;
    const y = Math.floor(cell / width);
    const tile = tiles.get(`${x},${y}`);
    if (!tile || tile.terrain !== "LAND" || isGarrisonedBy(tile, playerId)) continue;
    const distance = Math.abs(x - centre.x) + Math.abs(y - centre.y);
    if (!best || distance < best.distance) best = { x, y, distance };
  }
  return best ? { x: best.x, y: best.y } : undefined;
};

/** Where an unfinished charge pulls expansion next, or undefined when there is nothing left to aim at. */
const chargeTarget = (charge: HouseCharge, tiles: ReadonlyMap<string, DomainTileState>, playerId: string): { x: number; y: number } | undefined => {
  const [first, second] = charge.targets;
  if (!first) return undefined;
  if (charge.kind === "SURVEY" || charge.kind === "DESERT" || charge.kind === "TUNDRA") {
    const world = houseChargesWorldFor(tiles);
    const area = charge.kind === "SURVEY" ? world.islands.byId.get(targetTileKey(first.key)) : world.regions.byId.get(targetTileKey(first.key));
    return area ? openAreaTile(area.cells, world.width, first, tiles, playerId) : undefined;
  }
  if (charge.kind === "METROPOLIS") {
    // The nearest town on the landmass the House does not hold yet; growth itself needs no expansion.
    const world = houseChargesWorldFor(tiles);
    const islandId = targetTileKey(first.key);
    let best: { x: number; y: number; distance: number } | undefined;
    let held = 0;
    for (const town of world.towns) {
      if (town.islandId !== islandId) continue;
      if (isGarrisonedBy(tiles.get(town.key), playerId)) {
        held += 1;
        continue;
      }
      const distance = Math.abs(town.x - first.x) + Math.abs(town.y - first.y);
      if (!best || distance < best.distance) best = { x: town.x, y: town.y, distance };
    }
    return held < HOUSE_CHARGE_METROPOLIS_COUNT && best ? { x: best.x, y: best.y } : undefined;
  }
  // The first target not yet held (a Correction aims at the rival's landing site); a Charter with both towns held still needs the road between them.
  const unheld = charge.targets.find((target) => !isGarrisonedBy(tiles.get(`${target.x},${target.y}`), playerId));
  if (unheld) return unheld;
  if (charge.kind === "CHARTER" && second) return { x: Math.round((first.x + second.x) / 2), y: Math.round((first.y + second.y) / 2) };
  return undefined;
};

export const houseChargeExpansionObjective = (
  player: Pick<DomainPlayer, "id" | "houseCharges">,
  tiles: ReadonlyMap<string, DomainTileState>
): HouseChargeExpansionObjective | undefined => {
  const state = player.houseCharges;
  if (!state) return undefined;
  for (const charge of keptHouseCharges(state)) {
    if (state.completeSince?.[charge.id] !== undefined) continue;
    const target = chargeTarget(charge, tiles, player.id);
    if (!target) continue;
    const ownerId = tiles.get(`${target.x},${target.y}`)?.ownerId;
    const enemy = ownerId !== undefined && ownerId !== player.id && ownerId !== BARBARIAN_PLAYER_ID;
    return { x: target.x, y: target.y, kind: enemy ? "enemy" : "neutral_value" };
  }
  return undefined;
};
