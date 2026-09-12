import type { Tile } from "../client-types.js";

export type FortificationOverlayKind = "FORT" | "TITANIUM_BASTION" | "THUNDER_BASTION" | "SIEGE_OUTPOST" | "WOODEN_FORT" | "RELAY_BEACON";
export type FortificationOpening = "CLOSED" | "NORTH" | "EAST" | "SOUTH" | "WEST";

export type FortificationOverlayDeps = {
  tiles: Map<string, Tile>;
  keyFor: (x: number, y: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
};

const CARDINAL_STEPS: Array<{ dx: number; dy: number; opening: Exclude<FortificationOpening, "CLOSED"> }> = [
  { dx: 0, dy: -1, opening: "NORTH" },
  { dx: 1, dy: 0, opening: "EAST" },
  { dx: 0, dy: 1, opening: "SOUTH" },
  { dx: -1, dy: 0, opening: "WEST" }
];

export const fortificationOverlayKindForTile = (tile: Tile | undefined): FortificationOverlayKind | undefined => {
  if (!tile) return undefined;
  if (tile.fort) {
    const variant = tile.fort.variant;
    if (variant === "TITANIUM_BASTION") return "TITANIUM_BASTION";
    if (variant === "THUNDER_BASTION") return "THUNDER_BASTION";
    return "FORT";
  }
  if (tile.siegeOutpost) return "SIEGE_OUTPOST";
  if (tile.economicStructure?.type === "WOODEN_FORT") return "WOODEN_FORT";
  if (tile.economicStructure?.type === "RELAY_BEACON") return "RELAY_BEACON";
  return undefined;
};

export const isFortificationOverlayTile = (tile: Tile | undefined): boolean => Boolean(fortificationOverlayKindForTile(tile));

export const fortificationOwnerIdForTile = (tile: Tile | undefined): string | undefined =>
  tile?.fort?.ownerId ?? tile?.siegeOutpost?.ownerId ?? tile?.economicStructure?.ownerId ?? tile?.ownerId;

export const fortificationOverlayAlphaForTile = (tile: Tile | undefined): number => {
  if (!tile) return 1;
  const status = tile.fort?.status ?? tile.siegeOutpost?.status ?? tile.economicStructure?.status;
  if (status === "active") return 1;
  if (status === "under_construction") return 0.82;
  if (status === "inactive") return 0.78;
  if (status === "removing") return 0.64;
  return 1;
};

export const fortificationOpeningForTile = (
  tile: Tile | undefined,
  deps: FortificationOverlayDeps
): FortificationOpening => {
  if (!tile) return "CLOSED";
  const kind = fortificationOverlayKindForTile(tile);
  if (!kind || kind === "RELAY_BEACON" || kind === "SIEGE_OUTPOST") return "CLOSED";
  const ownerId = fortificationOwnerIdForTile(tile);
  if (!ownerId) return "CLOSED";
  for (const step of CARDINAL_STEPS) {
    const neighbor = deps.tiles.get(deps.keyFor(deps.wrapX(tile.x + step.dx), deps.wrapY(tile.y + step.dy)));
    if (!isFortificationOverlayTile(neighbor)) continue;
    if (fortificationOverlayKindForTile(neighbor) === "RELAY_BEACON" || fortificationOverlayKindForTile(neighbor) === "SIEGE_OUTPOST") {
      continue;
    }
    if (fortificationOwnerIdForTile(neighbor) !== ownerId) continue;
    return step.opening;
  }
  return "CLOSED";
};

// Search radius (in tiles) for the Siege Battery's aim heuristic below.
// Client-visual only: bounded so the scan stays cheap (168 lookups worst
// case) regardless of map size, and because a battery aiming at a target
// this far outside its own reach ring would not read as "aiming at the
// threat" anyway.
const FACING_SEARCH_RADIUS = 6;

// All (dx, dy) offsets in the search box, excluding the origin, sorted by
// ascending distance so the loop below finds the *nearest* rival tile.
// Precomputed once at module load rather than per call.
const FACING_SEARCH_OFFSETS: ReadonlyArray<{ dx: number; dy: number }> = (() => {
  const offsets: Array<{ dx: number; dy: number }> = [];
  for (let dy = -FACING_SEARCH_RADIUS; dy <= FACING_SEARCH_RADIUS; dy += 1) {
    for (let dx = -FACING_SEARCH_RADIUS; dx <= FACING_SEARCH_RADIUS; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      offsets.push({ dx, dy });
    }
  }
  offsets.sort((a, b) => a.dx * a.dx + a.dy * a.dy - (b.dx * b.dx + b.dy * b.dy));
  return offsets;
})();

/**
 * Yaw (radians, matching the 3D model's rotationY convention where 0 already
 * faces tile-local +z/"south") for a Siege Battery to visually aim itself at
 * the nearest rival-owned tile within FACING_SEARCH_RADIUS. Purely cosmetic:
 * it only reorients the model/sprite, it does not change targeting, range,
 * or combat math. Falls back to the model's default south-facing pose (0)
 * when the tile isn't a battery, has no owner, or no rival tile is known
 * within range (including simply being out of this player's vision).
 */
export const siegeBatteryFacingRadiansForTile = (
  tile: Tile | undefined,
  deps: FortificationOverlayDeps
): number => {
  if (!tile || fortificationOverlayKindForTile(tile) !== "SIEGE_OUTPOST") return 0;
  const ownerId = fortificationOwnerIdForTile(tile);
  if (!ownerId) return 0;
  for (const { dx, dy } of FACING_SEARCH_OFFSETS) {
    const neighbor = deps.tiles.get(deps.keyFor(deps.wrapX(tile.x + dx), deps.wrapY(tile.y + dy)));
    const neighborOwnerId = neighbor?.ownerId;
    if (neighborOwnerId && neighborOwnerId !== ownerId) return Math.atan2(dx, dy);
  }
  return 0;
};
