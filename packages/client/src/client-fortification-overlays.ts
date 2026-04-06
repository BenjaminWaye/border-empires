import type { Tile } from "./client-types.js";

export type FortificationOverlayKind = "FORT" | "SIEGE_OUTPOST" | "WOODEN_FORT" | "LIGHT_OUTPOST";
export type FortificationOpening = "CLOSED" | "NORTH" | "EAST" | "SOUTH" | "WEST";

type FortificationOverlayDeps = {
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
  if (tile.fort) return "FORT";
  if (tile.siegeOutpost) return "SIEGE_OUTPOST";
  if (tile.economicStructure?.type === "WOODEN_FORT") return "WOODEN_FORT";
  if (tile.economicStructure?.type === "LIGHT_OUTPOST") return "LIGHT_OUTPOST";
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
  if (!kind || kind === "LIGHT_OUTPOST" || kind === "SIEGE_OUTPOST") return "CLOSED";
  const ownerId = fortificationOwnerIdForTile(tile);
  if (!ownerId) return "CLOSED";
  for (const step of CARDINAL_STEPS) {
    const neighbor = deps.tiles.get(deps.keyFor(deps.wrapX(tile.x + step.dx), deps.wrapY(tile.y + step.dy)));
    if (!isFortificationOverlayTile(neighbor)) continue;
    if (fortificationOverlayKindForTile(neighbor) === "LIGHT_OUTPOST" || fortificationOverlayKindForTile(neighbor) === "SIEGE_OUTPOST") {
      continue;
    }
    if (fortificationOwnerIdForTile(neighbor) !== ownerId) continue;
    return step.opening;
  }
  return "CLOSED";
};
