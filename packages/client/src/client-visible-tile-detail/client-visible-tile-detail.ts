import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { tileHasTownIdentity } from "../client-town-identity.js";
import type { Tile, TileVisibilityState } from "../client-types.js";

type VisibleTileSnapshot = {
  wx: number;
  wy: number;
  vis: TileVisibilityState;
  t: Tile | undefined;
};

type VisibleTileDetailRequesterDeps = {
  state: Pick<ClientState, "me">;
  keyFor: (x: number, y: number) => string;
  requestTileDetailIfNeeded: (tile: Tile | undefined) => void;
  isMobile: () => boolean;
  now?: () => number;
  minIntervalMs?: number;
};

const toroidDistance = (from: number, to: number, dim: number): number => {
  const delta = Math.abs(to - from);
  return Math.min(delta, dim - delta);
};

// Scoped to towns only: this sweep exists purely to pre-warm the tile-detail
// panel's enriched economy fields (support, food coverage, connected-town
// bonus, etc.) before the player clicks. Bare owned land, resources, docks,
// forts and other structures don't carry that kind of enrichable data (a
// bare settled tile's only extra fact is a fixed, client-computable upkeep
// line), so including them meant this sweep never idled for a large empire
// -- thousands of plain tiles expiring from the 60s freshness cache and
// re-queuing forever. If docks/forts/etc. turn out to need the same
// treatment (visible loading flicker on click), add their identity checks
// back here.
const shouldRequestVisibleTileDetail = (tile: Tile | undefined): tile is Tile => {
  if (!tile || tile.fogged || tile.detailLevel === "full" || tile.terrain !== "LAND") return false;
  return tileHasTownIdentity(tile);
};

const visibleTilePriority = (tile: Tile, me: string, camX: number, camY: number): number => {
  const dx = toroidDistance(camX, tile.x, WORLD_WIDTH);
  const dy = toroidDistance(camY, tile.y, WORLD_HEIGHT);
  const distancePenalty = dx + dy;
  const shellLikeOwnedSummary =
    tile.ownerId &&
    !tile.resource &&
    !tileHasTownIdentity(tile) &&
    !tile.dockId &&
    !tile.fort &&
    !tile.observatory &&
    !tile.siegeOutpost &&
    !tile.economicStructure;

  let score = 0;
  if (tile.ownerId === me) score += 1_000;
  else if (tile.ownerId) score += 700;
  if (tile.ownershipState === "SETTLED") score += 140;
  if (tile.ownershipState === "FRONTIER") score += 80;
  if (tileHasTownIdentity(tile)) score += 340;
  if (tile.resource) score += 300;
  if (tile.dockId) score += 280;
  if (tile.fort || tile.observatory || tile.siegeOutpost || tile.economicStructure) score += 260;
  if (tile.shardSite) score += 220;
  if (shellLikeOwnedSummary) score += 240;
  return score - distancePenalty * 8;
};

export const createVisibleTileDetailRequester = (deps: VisibleTileDetailRequesterDeps) => {
  const now = deps.now ?? (() => Date.now());
  const minIntervalMs = deps.minIntervalMs ?? 160;
  let lastRunAt = 0;

  return (visibleTiles: readonly VisibleTileSnapshot[], camX: number, camY: number): void => {
    const currentTime = now();
    if (currentTime - lastRunAt < minIntervalMs) return;
    lastRunAt = currentTime;
    const requestedThisPass = new Set<string>();
    const maxRequests = deps.isMobile() ? 4 : 8;
    const candidates = visibleTiles
      .filter((entry) => entry.vis === "visible" && shouldRequestVisibleTileDetail(entry.t))
      .map(({ t }) => t!)
      .filter((tile) => {
        const tileKey = deps.keyFor(tile.x, tile.y);
        if (requestedThisPass.has(tileKey)) return false;
        requestedThisPass.add(tileKey);
        return true;
      })
      .sort((a, b) => visibleTilePriority(b, deps.state.me, camX, camY) - visibleTilePriority(a, deps.state.me, camX, camY))
      .slice(0, maxRequests);

    for (const tile of candidates) {
      deps.requestTileDetailIfNeeded(tile);
    }
  };
};
