// What "Show on map" highlights for the focused House Charge, shared by both
// map renderers (client-map-guide-overlays-2d.ts and the true-3D
// client-map-3d-map-guide-overlay.ts). Progressive reveal: exact targets are
// only marked on ground the player has explored (a tile in state.tiles);
// until then a rough dotted circle shows where to look
// (client-house-charges-search-guide.ts).
import type { HouseChargeView } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";

export type ChargeMapPoint = { x: number; y: number };
export type ChargeTintTile = ChargeMapPoint & { garrisoned: boolean };

type ChargeMapState = Pick<ClientState, "houseCharges" | "houseChargeFocusId" | "tiles" | "me">;

/** Upper bound on shaded tiles (a Survey landmass is at most 600 LAND tiles plus mountains). */
const MAX_TINT_TILES = 1_200;

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

export const focusedHouseCharge = (state: Pick<ClientState, "houseCharges" | "houseChargeFocusId">): HouseChargeView | undefined =>
  state.houseChargeFocusId ? state.houseCharges?.charges.find((charge) => charge.id === state.houseChargeFocusId) : undefined;

const explored = (state: ChargeMapState, x: number, y: number): boolean => state.tiles.has(`${x},${y}`);

/** Ring markers for the focused charge: its point targets the player has explored. Unscouted ones get a rough circle instead (client-house-charges-search-guide.ts). */
export const houseChargeMarkerTiles = (state: ChargeMapState): ChargeMapPoint[] => {
  const charge = focusedHouseCharge(state);
  if (!charge || charge.areaTileKeys) return [];
  return charge.targets.filter((target) => explored(state, target.x, target.y)).map(({ x, y }) => ({ x, y }));
};

const COMPASS = ["east", "southeast", "south", "southwest", "west", "northwest", "north", "northeast"] as const;

const wrappedDelta = (from: number, to: number, size: number): number => {
  const delta = wrap(to - from, size);
  return delta > size / 2 ? delta - size : delta;
};

/**
 * For a charge with one target seen and another still unscouted, a rough
 * bearing from the seen one ("Bromurvault: not scouted yet, about 20 tiles
 * northeast of Auriyrcrown"). Distance is rounded to 5 tiles: a surveyor's
 * bearing, not the exact spot.
 */
export const houseChargeUnscoutedHint = (
  charge: HouseChargeView,
  isExplored: (x: number, y: number) => boolean,
  worldWidth: number,
  worldHeight: number
): string | undefined => {
  if (charge.areaTileKeys || charge.targets.length < 2) return undefined;
  const seen = charge.targets.find((target) => isExplored(target.x, target.y));
  const unseen = charge.targets.find((target) => !isExplored(target.x, target.y));
  if (!seen || !unseen) return undefined;
  const dx = wrappedDelta(seen.x, unseen.x, worldWidth);
  const dy = wrappedDelta(seen.y, unseen.y, worldHeight);
  const distance = Math.max(5, Math.round(Math.hypot(dx, dy) / 5) * 5);
  const octant = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
  return `${unseen.name}: not scouted yet, about ${distance} tiles ${COMPASS[octant]} of ${seen.name}.`;
};

/** Shaded tiles for a focused landmass, desert or tundra charge: explored tiles only, marked garrisoned when the player holds them. */
export const houseChargeTintTiles = (state: ChargeMapState): ChargeTintTile[] => {
  const charge = focusedHouseCharge(state);
  if (!charge?.areaTileKeys) return [];
  const tiles: ChargeTintTile[] = [];
  for (const key of charge.areaTileKeys) {
    if (tiles.length >= MAX_TINT_TILES) break;
    const tile = state.tiles.get(key);
    if (!tile || tile.terrain !== "LAND") continue;
    tiles.push({ x: tile.x, y: tile.y, garrisoned: tile.ownerId === state.me && tile.ownershipState === "SETTLED" });
  }
  return tiles;
};

export type ChargeAreaEdge = ChargeMapPoint & { side: "N" | "E" | "S" | "W" };

/** Tile sides on the outline of the shaded area: sides whose neighbour is not shaded. */
export const houseChargeAreaEdges = (tiles: readonly ChargeTintTile[], worldWidth: number, worldHeight: number): ChargeAreaEdge[] => {
  const shaded = new Set(tiles.map((tile) => `${tile.x},${tile.y}`));
  const edges: ChargeAreaEdge[] = [];
  const sides = [["N", 0, -1], ["E", 1, 0], ["S", 0, 1], ["W", -1, 0]] as const;
  for (const tile of tiles) {
    for (const [side, dx, dy] of sides) {
      if (!shaded.has(`${wrap(tile.x + dx, worldWidth)},${wrap(tile.y + dy, worldHeight)}`)) edges.push({ x: tile.x, y: tile.y, side });
    }
  }
  return edges;
};
