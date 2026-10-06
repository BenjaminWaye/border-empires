import { tileKey, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { authoritativeIsInReach, type ReachAuthoritativeState } from "../client-reach-authoritative/client-reach-authoritative.js";
import { keyForTile } from "../client-app-runtime-utils.js";
import { REACH_RADIUS_BY_KIND, tileKeysAroundAnchor } from "../client-reach-overlay/client-reach-overlay-anchor-disk.js";
import { localAnchorsForTile } from "../client-reach-overlay/client-reach-overlay-anchors.js";
import type { ReachOverlayTileMap } from "../client-reach-overlay/client-reach-overlay.js";
import type { Tile } from "../client-types.js";
import { tileMenuHeaderStatusForTile, type TileMenuHeaderStatus } from "./client-tile-menu-status.js";

const MAX_REACH_RADIUS = Math.max(...Object.values(REACH_RADIUS_BY_KIND));

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

/**
 * Owners (other than `me`) whose reach anchors cover `target`, derived from
 * the tiles this client has cached. Like `computeLocalReachSet` this is an
 * approximation (no contested-tile clipping, fogged anchors are invisible),
 * so an empty result means "unknown", not "nobody".
 */
export const foreignOwnersReachingTile = (tiles: ReachOverlayTileMap, target: Tile, me: string): string[] => {
  const targetKey = tileKey(target.x, target.y);
  const isLand = (x: number, y: number): boolean => {
    const tile = tiles.get(tileKey(x, y));
    return tile ? tile.terrain === "LAND" : true;
  };
  const owners = new Set<string>();
  for (let dy = -MAX_REACH_RADIUS; dy <= MAX_REACH_RADIUS; dy += 1) {
    for (let dx = -MAX_REACH_RADIUS; dx <= MAX_REACH_RADIUS; dx += 1) {
      const tile = tiles.get(tileKey(wrap(target.x + dx, WORLD_WIDTH), wrap(target.y + dy, WORLD_HEIGHT)));
      if (!tile?.ownerId || tile.ownerId === me || owners.has(tile.ownerId)) continue;
      const covers = localAnchorsForTile(tile).some(
        (anchor) =>
          Math.abs(dx) <= REACH_RADIUS_BY_KIND[anchor.kind] &&
          Math.abs(dy) <= REACH_RADIUS_BY_KIND[anchor.kind] &&
          tileKeysAroundAnchor(anchor, isLand).includes(targetKey)
      );
      if (covers) owners.add(tile.ownerId);
    }
  }
  return [...owners];
};

/**
 * Header status for one of the viewer's own tiles, naming the empire(s)
 * whose reach covers it when that is what the "Inside ... Reach" line says.
 */
export const ownTileHeaderStatus = (
  state: ReachAuthoritativeState,
  tile: Tile,
  playerNameForOwner: (ownerId?: string | null) => string | undefined,
  nowMs = Date.now()
): TileMenuHeaderStatus | undefined => {
  const inReach = authoritativeIsInReach(state, keyForTile);
  const reachOwnerNames = (): string[] =>
    foreignOwnersReachingTile(state.tiles, tile, state.me).map((ownerId) => playerNameForOwner(ownerId) ?? ownerId.slice(0, 8));
  return tileMenuHeaderStatusForTile(tile, nowMs, (t) => inReach(t.x, t.y), reachOwnerNames);
};
