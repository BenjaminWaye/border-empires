// What "Show on map" highlights for the focused House Charge, shared by both
// map renderers (client-map-guide-overlays-2d.ts and the true-3D
// client-map-3d-map-guide-overlay.ts). Progressive reveal: exact targets are
// only marked on ground the player has explored (a tile in state.tiles);
// until then the search circle is outlined with markers instead.
import type { HouseChargeView } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";

export type ChargeMapPoint = { x: number; y: number };
export type ChargeTintTile = ChargeMapPoint & { garrisoned: boolean };

type ChargeMapState = Pick<ClientState, "houseCharges" | "houseChargeFocusId" | "tiles" | "me">;

const SEARCH_CIRCLE_MARKERS = 12;
/** Upper bound on shaded tiles (a Survey landmass is at most 600 LAND tiles plus mountains). */
const MAX_TINT_TILES = 1_200;

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

export const focusedHouseCharge = (state: Pick<ClientState, "houseCharges" | "houseChargeFocusId">): HouseChargeView | undefined =>
  state.houseChargeFocusId ? state.houseCharges?.charges.find((charge) => charge.id === state.houseChargeFocusId) : undefined;

const explored = (state: ChargeMapState, x: number, y: number): boolean => state.tiles.has(`${x},${y}`);

/** Evenly spaced markers around the charge's search circle. */
export const searchCircleMarkers = (charge: HouseChargeView, worldWidth: number, worldHeight: number): ChargeMapPoint[] => {
  const { x, y, radius } = charge.searchCircle;
  return Array.from({ length: SEARCH_CIRCLE_MARKERS }, (_, index) => {
    const angle = (index / SEARCH_CIRCLE_MARKERS) * Math.PI * 2;
    return { x: wrap(Math.round(x + Math.cos(angle) * radius), worldWidth), y: wrap(Math.round(y + Math.sin(angle) * radius), worldHeight) };
  });
};

/** Ring markers for the focused charge: its explored targets, or its search circle while nothing of it has been seen. */
export const houseChargeMarkerTiles = (state: ChargeMapState, worldWidth: number, worldHeight: number): ChargeMapPoint[] => {
  const charge = focusedHouseCharge(state);
  if (!charge) return [];
  const areaSeen = charge.areaTileKeys?.some((key) => state.tiles.has(key)) ?? false;
  if (areaSeen) return [];
  const seenTargets = charge.areaTileKeys ? [] : charge.targets.filter((target) => explored(state, target.x, target.y));
  if (seenTargets.length > 0) return seenTargets.map(({ x, y }) => ({ x, y }));
  return searchCircleMarkers(charge, worldWidth, worldHeight);
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
