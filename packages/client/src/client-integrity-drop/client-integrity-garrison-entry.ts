// "Garrison Many" from the Integrity panel's "Why it fell" card: pans to your
// nearest frontier (ungarrisoned) land tile and opens its tile menu on the
// Actions tab, where Garrison Many starts the multi-tile selection
// (client-garrison-many/). The menu is drawn by renderClientHud from
// state.tileActionMenu, the same fields openSingleTileActionMenu sets.

import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { focusCameraOnTile } from "../client-activity-dashboard/client-activity-dashboard-center.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

type GarrisonEntryState = Pick<ClientState, "tiles" | "me" | "camX" | "camY" | "camSubX" | "camSubY" | "selected" | "tileActionMenu" | "activePanel">;

const wrappedDistanceSq = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = Math.min(Math.abs(ax - bx), WORLD_WIDTH - Math.abs(ax - bx));
  const dy = Math.min(Math.abs(ay - by), WORLD_HEIGHT - Math.abs(ay - by));
  return dx * dx + dy * dy;
};

/** Your frontier land tile nearest (x, y), or undefined when all your land is garrisoned. */
export const nearestOwnFrontierTile = (tiles: ReadonlyMap<string, Tile>, me: string, x: number, y: number): Tile | undefined => {
  let best: Tile | undefined;
  let bestDistance = Infinity;
  for (const tile of tiles.values()) {
    if (tile.ownerId !== me || tile.terrain !== "LAND" || tile.ownershipState !== "FRONTIER" || tile.fogged) continue;
    const distance = wrappedDistanceSq(tile.x, tile.y, x, y);
    if (distance < bestDistance || (distance === bestDistance && best && (tile.y < best.y || (tile.y === best.y && tile.x < best.x)))) {
      best = tile;
      bestDistance = distance;
    }
  }
  return best;
};

/** True when a frontier tile was found and its menu opened. */
export const openGarrisonManyFromIntegrity = (
  state: GarrisonEntryState,
  deps: { keyFor: (x: number, y: number) => string; wrapX: (x: number) => number; wrapY: (y: number) => number; requestViewRefresh: () => void; viewport: { width: number; height: number } }
): boolean => {
  const tile = nearestOwnFrontierTile(state.tiles, state.me, state.camX, state.camY);
  if (!tile) return false;
  focusCameraOnTile(state, tile.x, tile.y, deps);
  state.activePanel = null;
  Object.assign(state.tileActionMenu, {
    visible: true,
    mode: "single",
    bulkKeys: [],
    currentTileKey: deps.keyFor(tile.x, tile.y),
    x: deps.viewport.width / 2,
    y: deps.viewport.height / 2,
    activeTab: "actions",
    scrollTopByTab: {},
    renderSignature: ""
  });
  return true;
};
