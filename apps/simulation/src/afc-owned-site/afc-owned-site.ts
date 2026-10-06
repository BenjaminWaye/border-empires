import type { DomainTileState } from "@border-empires/game-domain";
import { simulationTileKey } from "../seed-state/seed-state.js";

/** A tile with no town, dock, AFC or other structure -- the shared "empty" rule for placing an AFC. */
export const isEmptyAfcSite = (tile: DomainTileState): boolean =>
  !tile.town && !tile.dockId && !tile.afc && !tile.fort && !tile.siegeOutpost && !tile.observatory && !tile.economicStructure;

export type ReplacementAfcSite = { tile: DomainTileState; placement: "owned_tile" | "adjacent_neutral" };

type ChooseReplacementAfcSiteInput = {
  playerId: string;
  tiles: ReadonlyMap<string, DomainTileState>;
  /** True for a tile that must not be built on right now (combat lock, pending settlement). */
  isBlocked: (tileKey: string) => boolean;
};

const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]
];

const nearestToCenter = (candidates: readonly DomainTileState[], centerX: number, centerY: number): DomainTileState | undefined => {
  let best: { tile: DomainTileState; distance: number; key: string } | undefined;
  for (const tile of candidates) {
    const distance = (tile.x - centerX) ** 2 + (tile.y - centerY) ** 2;
    const key = simulationTileKey(tile.x, tile.y);
    if (!best || distance < best.distance || (distance === best.distance && key < best.key)) best = { tile, distance, key };
  }
  return best?.tile;
};

/**
 * Where a replacement AFC lands when a player loses their last one but still
 * holds ground. First choice: one of their own empty land tiles, SETTLED or
 * FRONTIER (any owned tile counts). Fallback: an empty, unowned land tile
 * touching their territory -- never an ownerless FRONTIER tile, which a nearby
 * expansion is about to claim. Either way the site nearest the centroid of the
 * player's territory wins (the most interior, hardest to capture next); tile
 * key breaks ties. Returns undefined when neither exists.
 */
export const chooseReplacementAfcSite = (input: ChooseReplacementAfcSiteInput): ReplacementAfcSite | undefined => {
  const owned: DomainTileState[] = [];
  const ownedCandidates: DomainTileState[] = [];
  let sumX = 0;
  let sumY = 0;
  for (const tile of input.tiles.values()) {
    if (tile.ownerId !== input.playerId) continue;
    owned.push(tile);
    sumX += tile.x;
    sumY += tile.y;
    if (tile.terrain === "LAND" && isEmptyAfcSite(tile) && !input.isBlocked(simulationTileKey(tile.x, tile.y))) ownedCandidates.push(tile);
  }
  if (owned.length === 0) return undefined;
  const centerX = sumX / owned.length;
  const centerY = sumY / owned.length;
  const ownedSite = nearestToCenter(ownedCandidates, centerX, centerY);
  if (ownedSite) return { tile: ownedSite, placement: "owned_tile" };

  const neutralCandidates = new Map<string, DomainTileState>();
  for (const tile of owned) {
    for (const [dx, dy] of NEIGHBOR_OFFSETS) {
      const key = simulationTileKey(tile.x + dx, tile.y + dy);
      const neighbor = input.tiles.get(key);
      if (!neighbor || neighbor.ownerId || neighbor.ownershipState === "FRONTIER" || neighbor.terrain !== "LAND") continue;
      if (!isEmptyAfcSite(neighbor) || input.isBlocked(key)) continue;
      neutralCandidates.set(key, neighbor);
    }
  }
  const neutralSite = nearestToCenter([...neutralCandidates.values()], centerX, centerY);
  return neutralSite ? { tile: neutralSite, placement: "adjacent_neutral" } : undefined;
};
