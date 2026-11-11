// One tile's territory quad in the 3D map: owned land in sight in its owner's colour, or, on the Resources
// lens, resource land in sight in its resource colour and nothing else (ownershipPaint3D in
// client-resource-lens.ts). Extracted from client-map-3d.ts's per-tile rebuild loop.
import type { Color } from "three";
import { observeBarbarianFrontierTint, type BarbarianFrontierTintTracker } from "../client-map-3d-barbarian-frontier-tint.js";
import { placeOwnershipTile3D, type OwnershipTilePlacementDeps } from "../client-map-3d-ownership-tile/client-map-3d-ownership-tile.js";
import { ownershipPaint3D, type ResourceLensState } from "../client-resource-lens/client-resource-lens.js";
import { normalizeColorForThree } from "../client-three-color/client-three-color.js";
import type { Tile } from "../client-types.js";

export type TerritoryPaintDeps = {
  readonly state: ResourceLensState;
  readonly placement: OwnershipTilePlacementDeps;
  readonly effectiveOverlayColor: (ownerId: string) => string;
  readonly barbarianFrontierTint: BarbarianFrontierTintTracker;
  /** Reused for every tile: the overlay copies the colour it is given. */
  readonly scratch: Color;
};

export type TerritoryPaintTile = {
  readonly tile: Tile | undefined;
  readonly tileKey: string;
  readonly wx: number;
  readonly wy: number;
  // Tile centre in scene space.
  readonly x: number;
  readonly z: number;
  readonly visibleLand: boolean;
  readonly isOwnedLand: boolean;
};

/** Places the tile's territory quad and returns the colour used (the shared scratch), or undefined for none. */
export const paintTerritoryTile3D = (deps: TerritoryPaintDeps, p: TerritoryPaintTile): Color | undefined => {
  if (!p.tile) return undefined;
  const paint = ownershipPaint3D(deps.state, p.tile, p.visibleLand, p.isOwnedLand);
  if (!paint) return undefined;
  const ownerColor = deps.scratch.set(normalizeColorForThree(paint.color ?? deps.effectiveOverlayColor(paint.ownerId)));
  placeOwnershipTile3D(deps.placement, {
    tile: p.tile, ownerId: paint.ownerId, ownershipState: paint.ownershipState, wx: p.wx, wy: p.wy, x: p.x, z: p.z, ownerColor,
    // A resource pseudo-owner is never a barbarian, so the lens never starts a fade-in (client-map-3d-barbarian-frontier-tint.ts).
    barbarianTintTransition: observeBarbarianFrontierTint(deps.barbarianFrontierTint, paint.ownerId, paint.ownershipState, p.tileKey, ownerColor)
  });
  return ownerColor;
};
