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
  // A Three Metropolises target is only the middle of the landmass's nearest towns, never a spot to mark.
  const seenTargets = charge.areaTileKeys || charge.kind === "METROPOLIS" ? [] : charge.targets.filter((target) => explored(state, target.x, target.y));
  if (seenTargets.length === 0) return searchCircleMarkers(charge, worldWidth, worldHeight);
  const marked = seenTargets.map(({ x, y }) => ({ x, y }));
  // A Charter whose second town is still unscouted: keep the search circle so the player knows where to look.
  return seenTargets.length < charge.targets.length ? [...marked, ...searchCircleMarkers(charge, worldWidth, worldHeight)] : marked;
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
