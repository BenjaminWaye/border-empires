// Places one visible owned land tile into the 3D ownership overlay: corner
// heights, the hill-drape vs flat-quad choice, the settled edge glow mask,
// and registering the buffer index with the per-frame frontier decay pulse
// and barbarian fade-in trackers. Extracted from client-map-3d.ts's per-tile
// rebuild loop.
import type { Color } from "three";
import type { BarbarianFrontierTintTracker } from "../client-map-3d-barbarian-frontier-tint.js";
import type { FrontierDecayPulseTracker } from "../client-map-3d-frontier-decay-pulse.js";
import { hillNeighborFlagsAt, type RoadCutDirections } from "../client-map-3d-hill-shape.js";
import type { OwnershipOverlay } from "../client-map-3d-ownership-overlay.js";
import { OWNERSHIP_RISE_ABOVE_HEIGHTFIELD } from "../client-map-3d-ownership-shore.js";
import { settledEdgeMaskForOwner, type SettledEdgeNeighbourDeps } from "../client-settled-edge-glow/client-settled-edge-glow.js";
import type { Tile } from "../client-types.js";

type BarbarianTintTransition = Parameters<BarbarianFrontierTintTracker["track"]>[2];

export type OwnershipTilePlacementDeps = {
  readonly overlay: Pick<OwnershipOverlay, "addTile" | "addHillTile">;
  readonly cornerYAt: (wx: number, wy: number) => number;
  readonly isHillsTile: (wx: number, wy: number) => boolean;
  readonly hillCutAt: (wx: number, wy: number) => RoadCutDirections | undefined;
  readonly neighbours: SettledEdgeNeighbourDeps;
  readonly frontierDecayPulse: Pick<FrontierDecayPulseTracker, "track">;
  readonly barbarianFrontierTint: Pick<BarbarianFrontierTintTracker, "track">;
};

export type OwnershipTilePlacement = {
  readonly tile: Pick<Tile, "frontierDecayAt" | "frontierDecayKind">;
  readonly ownerId: string;
  readonly ownershipState: Tile["ownershipState"];
  readonly wx: number;
  readonly wy: number;
  // Tile centre in scene space.
  readonly x: number;
  readonly z: number;
  // Copied by the overlay, so callers may pass a reused Color.
  readonly ownerColor: Color;
  readonly barbarianTintTransition: BarbarianTintTransition | undefined;
};

export const placeOwnershipTile3D = (deps: OwnershipTilePlacementDeps, p: OwnershipTilePlacement): void => {
  const { wx, wy, ownerColor } = p;
  const isFrontier = p.ownershipState === "FRONTIER";
  // Decay countdown pulse is applied every frame by frontierDecayPulse.render() instead of baked in here, so camera pan/zoom rebuilds can't make it jump -- see client-map-3d-frontier-decay-pulse.ts.
  const isDecayingFrontierTile = isFrontier && typeof p.tile.frontierDecayAt === "number";
  const settledEdgeMask = isFrontier ? 0 : settledEdgeMaskForOwner(wx, wy, p.ownerId, deps.neighbours);
  const wxOwn = deps.neighbours.wrapX(wx + 1);
  const wyOwn = deps.neighbours.wrapY(wy + 1);
  // cornerYAt returns the heightfield's *rendered* Y for each
  // corner — the same value written into the position buffer
  // (including coastEdgeY pull-down at mixed corners and the
  // explored-only filter), so the ownership quad traces the
  // visible surface exactly. Previously this block averaged
  // base elevations of the 4 surrounding tiles, which sat
  // below the rendered surface near coast/explored boundaries
  // and let the overlay sink under the heightfield.
  // Hills are a separate dome mesh layered on top of the flat
  // heightfield (see client-map-3d-hills.ts), so cornerYAt alone
  // never reflects their raised surface. Each tile's quad has
  // private, unshared corner vertices, so it's safe to bump the
  // whole quad up to clear the dome peak without creating seams.
  const corner00Y = deps.cornerYAt(wx, wy) + OWNERSHIP_RISE_ABOVE_HEIGHTFIELD;
  const corner10Y = deps.cornerYAt(wxOwn, wy) + OWNERSHIP_RISE_ABOVE_HEIGHTFIELD;
  const corner01Y = deps.cornerYAt(wx, wyOwn) + OWNERSHIP_RISE_ABOVE_HEIGHTFIELD;
  const corner11Y = deps.cornerYAt(wxOwn, wyOwn) + OWNERSHIP_RISE_ABOVE_HEIGHTFIELD;
  const x0 = p.x - 0.5;
  const x1 = p.x + 0.5;
  const z0 = p.z - 0.5;
  const z1 = p.z + 0.5;
  const isHill = deps.isHillsTile(wx, wy);
  const index = isHill
    // Drape the overlay over the dome's own curve instead of
    // bridging it with one flat plane (see addHillTile).
    ? deps.overlay.addHillTile(
      x0, x1, z0, z1,
      corner00Y, corner10Y, corner01Y, corner11Y,
      ownerColor, isFrontier,
      hillNeighborFlagsAt(wx, wy, deps.isHillsTile, deps.neighbours.wrapX, deps.neighbours.wrapY), wx, wy, deps.hillCutAt(wx, wy), settledEdgeMask
    )
    : deps.overlay.addTile(
      x0, corner00Y, z0,
      x1, corner10Y, z0,
      x0, corner01Y, z1,
      x1, corner11Y, z1,
      ownerColor,
      isFrontier, settledEdgeMask
    );
  if (index < 0) return;
  if (isDecayingFrontierTile) deps.frontierDecayPulse.track({ index, isHill, frontierDecayAt: p.tile.frontierDecayAt as number, frontierDecayKind: p.tile.frontierDecayKind, baseColor: ownerColor.clone() });
  if (p.barbarianTintTransition) deps.barbarianFrontierTint.track(index, isHill, p.barbarianTintTransition);
};
