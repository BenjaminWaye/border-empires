// Where an agreed deal (trade, truce, alliance) shows on the map. A deal has no tile of its own, so its
// marker stands on the other House's land: the nearest tile of theirs in sight (nearest to the camera),
// else their capital if the client knows where it is (it may be remembered under fog). With neither, the
// deal shows only in Diplomacy and the feed (owner, 2026-11-28).
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { showActionMarker } from "./client-action-markers.js";

export type DealAnchorState = {
  readonly tiles?: ReadonlyMap<string, Tile>;
  readonly camX?: number;
  readonly camY?: number;
};

const wrappedDistance = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
  return Math.min(dx, WORLD_WIDTH - dx) + Math.min(dy, WORLD_HEIGHT - dy);
};

/** The tile a deal with `otherPlayerId` is shown on, or undefined when none of their land is known. */
export const dealAnchorTile = (state: DealAnchorState, otherPlayerId: string | undefined): { x: number; y: number } | undefined => {
  if (!otherPlayerId || !state.tiles) return undefined;
  const camX = state.camX ?? 0, camY = state.camY ?? 0;
  let nearest: Tile | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  let capital: Tile | undefined;
  for (const tile of state.tiles.values()) {
    if (tile.ownerId !== otherPlayerId) continue;
    if (tile.capital) capital ??= tile;
    if (tile.fogged) continue;
    const distance = wrappedDistance(tile.x, tile.y, camX, camY);
    if (distance < nearestDistance) { nearest = tile; nearestDistance = distance; }
  }
  const anchor = nearest ?? capital;
  return anchor ? { x: anchor.x, y: anchor.y } : undefined;
};

/** Marks an agreed deal on the other House's land; false when there is nowhere to put it. */
export const showDealMarker = (state: DealAnchorState, otherPlayerId: string | undefined, label: string): boolean => {
  const anchor = dealAnchorTile(state, otherPlayerId);
  if (!anchor) return false;
  showActionMarker(anchor.x, anchor.y, label);
  return true;
};
