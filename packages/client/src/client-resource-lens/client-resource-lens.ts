// Resources map view (a map lens, picked from the minimap's lens button): every empire's territory fill and
// border goes away, and each known resource tile is painted brightly in its resource's colour (the same colour
// as its marker, resourceColor in client-map-display.ts), owned or not. The 2D map, the 3D map and the minimap
// each ask resourceLensTileColor per tile in place of the owner colour; see their call sites.

import { resourceColor } from "../client-map-display.js";
import type { Tile } from "../client-types.js";

export type ResourceLensState = { readonly showResourceOverlay?: boolean };

/** The pseudo-owner a resource tile is painted under in 3D, so same-resource neighbours read as one patch. */
export const resourceLensOwnerId = (resource: Tile["resource"]): string => `resource:${resource ?? ""}`;

/**
 * Undefined while the lens is off (paint ownership as usual). While it is on: the tile's resource colour, or
 * null for a tile without a resource, which then gets no territory paint at all.
 */
export const resourceLensTileColor = (state: ResourceLensState, tile: Pick<Tile, "resource"> | undefined): string | null | undefined => {
  if (!state.showResourceOverlay) return undefined;
  return resourceColor(tile?.resource) ?? null;
};

/** Fill alpha of a resource tile in the 2D map and minimap: well above the ownership tint so it reads as bright. */
export const RESOURCE_LENS_FILL_ALPHA = 0.62;

/** The 2D map's resource tile: a strong fill in the resource colour with a solid inner edge. */
export const drawResourceLensTile2D = (ctx: CanvasRenderingContext2D, color: string, px: number, py: number, size: number): void => {
  ctx.fillStyle = color;
  ctx.globalAlpha = RESOURCE_LENS_FILL_ALPHA;
  ctx.fillRect(px, py, size, size);
  ctx.globalAlpha = 1;
  const edge = Math.max(1, Math.round(size * 0.08));
  ctx.strokeStyle = color;
  ctx.lineWidth = edge;
  ctx.strokeRect(px + edge / 2, py + edge / 2, size - edge, size - edge);
  ctx.lineWidth = 1;
};

/** How the 3D map paints one tile's territory quad, or undefined for none. */
export type OwnershipPaint3D = {
  readonly ownerId: string;
  readonly ownershipState: Tile["ownershipState"];
  /** Set on the Resources lens: the resource colour, used instead of the owner's. */
  readonly color?: string;
};

/**
 * The 3D map's per-tile territory paint. Off the Resources lens: owned land in sight, in its owner's colour.
 * On it: only land in sight with a resource, settled-style in the resource colour under a per-resource
 * pseudo-owner (resourceLensOwnerId); every other tile, owned or not, gets nothing.
 */
export const ownershipPaint3D = (
  state: ResourceLensState,
  tile: Pick<Tile, "resource" | "ownerId" | "ownershipState"> | undefined,
  visibleLand: boolean,
  isOwnedLand: boolean
): OwnershipPaint3D | undefined => {
  const lensColor = resourceLensTileColor(state, tile);
  if (lensColor === undefined) return isOwnedLand && tile?.ownerId ? { ownerId: tile.ownerId, ownershipState: tile.ownershipState } : undefined;
  if (lensColor === null || !visibleLand) return undefined;
  return { ownerId: resourceLensOwnerId(tile?.resource), ownershipState: "SETTLED", color: lensColor };
};
