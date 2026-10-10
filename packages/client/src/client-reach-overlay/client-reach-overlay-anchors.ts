import { tileHasTownIdentity } from "../client-town-identity.js";
import type { Tile } from "../client-types.js";
import type { LocalAnchor } from "./client-reach-overlay-anchor-disk.js";

export const OUTPOST_STRUCTURE_TYPES = new Set(["RELAY_BEACON", "SIEGE_OUTPOST", "SIEGE_TOWER", "DREAD_TOWER"]);

/**
 * The reach anchors (town / dock / outpost-family structure) this tile
 * contributes for whoever owns it. Client mirror of the server's
 * gatherReachAnchors; see `computeLocalReachSet` for why it is an
 * approximation.
 */
export const localAnchorsForTile = (tile: Tile): LocalAnchor[] => {
  if (!tile.ownerId) return [];
  const anchors: LocalAnchor[] = [];
  // Mirrors the server's ownershipState gate (runtime.ts's
  // gatherReachAnchors): a dormant/unsettled tile keeps its town/outpost
  // fields but must not count as a live reach anchor, or this preview
  // would overstate reach for previously-overtaken ground. Docks are
  // deliberately left ungated, same rationale as server-side.
  const isSettled = tile.ownershipState === "SETTLED";
  // Same detail-payload-vs-lightweight-reference bug the dock anchor had:
  // `tile.town` is the heavy detail object (goldPerMinute, population,
  // etc.), only populated once the client has fetched full detail for
  // that specific tile -- most map tiles never do, including a player's
  // own town if it hasn't been recently viewed. `townType` is the
  // lightweight reference always present regardless of detail level
  // (same convention client-town-identity.ts's townIdentityForTile
  // already uses) -- gating on `tile.town` alone silently zeroed out the
  // single most common reach anchor for smaller empires.
  if (isSettled && tileHasTownIdentity(tile)) anchors.push({ x: tile.x, y: tile.y, kind: "TOWN" });
  if (isSettled && tile.afc?.ownerId === tile.ownerId && tile.afc.status === "active") anchors.push({ x: tile.x, y: tile.y, kind: "TOWN" });
  // Server-side (runtime.ts's gatherReachAnchors) a dock anchor only ever
  // needs the tile to be an owned dock tile (from the docks registry) --
  // it doesn't require the tile's full economic-detail payload. `tile.dock`
  // is that heavy detail object (goldPerMinute, modifiers, etc.), only
  // populated once the client has fetched full detail for that specific
  // tile -- most map tiles never do, so gating on it here silently dropped
  // almost every real dock anchor. `dockId` is the lightweight reference
  // already present on any dock-linked tile regardless of detail level,
  // matching what the server actually checks.
  if (tile.dockId) anchors.push({ x: tile.x, y: tile.y, kind: "DOCK" });
  const outpostType = tile.economicStructure?.type;
  const isActiveOutpostEconomic =
    isSettled &&
    tile.economicStructure?.ownerId === tile.ownerId &&
    tile.economicStructure?.status === "active" &&
    outpostType !== undefined &&
    OUTPOST_STRUCTURE_TYPES.has(outpostType);
  const isActiveSiegeOutpost = isSettled && tile.siegeOutpost?.ownerId === tile.ownerId && tile.siegeOutpost?.status === "active";
  if (isActiveOutpostEconomic || isActiveSiegeOutpost) anchors.push({ x: tile.x, y: tile.y, kind: "OUTPOST" });
  return anchors;
};
