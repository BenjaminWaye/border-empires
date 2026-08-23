import { landGatedTileKeysInDisk, tileKey, WORLD_HEIGHT, WORLD_WIDTH, type ReachAnchorKind } from "@border-empires/shared";

// Anchor-disk math extracted out of client-reach-overlay.ts to keep that
// file under the repo's 500-line growth cap (AGENTS.md) — this is the client
// mirror of packages/shared/src/reach/reach.ts's tileKeysInReach.

export type LocalAnchor = { x: number; y: number; kind: ReachAnchorKind };

const REACH_RADIUS_BY_KIND: Record<ReachAnchorKind, number> = {
  TOWN: 3,
  OUTPOST: 5,
  DOCK: 1
};

/** Is the tile at (x, y) LAND terrain? Used to land-gate a local reach preview. */
export type LocalLandConnectivityQuery = (x: number, y: number) => boolean;

/** Every wrapped tile key within an anchor's radius. `isLand`, if given, land-gates via shared's `landGatedTileKeysInDisk` (mirrors server); omitted keeps the pure geometric disk (beacon placement ghost preview has no terrain data). */
export const tileKeysAroundAnchor = (anchor: LocalAnchor, isLand?: LocalLandConnectivityQuery): string[] => {
  const radius = REACH_RADIUS_BY_KIND[anchor.kind];
  if (isLand) return landGatedTileKeysInDisk(anchor.x, anchor.y, radius, isLand);
  const keys: string[] = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const x = ((anchor.x + dx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH;
      const y = ((anchor.y + dy) % WORLD_HEIGHT + WORLD_HEIGHT) % WORLD_HEIGHT;
      keys.push(tileKey(x, y));
    }
  }
  return keys;
};
