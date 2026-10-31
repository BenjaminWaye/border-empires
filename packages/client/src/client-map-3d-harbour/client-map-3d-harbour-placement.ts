import { dockEndpointKeySet, harbourFacingAt, rotationForFacing, slipwayPlacementsFor, type SlipwayPlacement } from "../client-harbour-slipways/client-harbour-slipways.js";
import type { DockOverlay } from "../client-map-3d-dock-overlay.js";
import type { DockPair, Tile } from "../client-types.js";

// Per-rebuild harbour placement for client-map-3d.ts's tile loop: which tiles
// carry a quay (dock endpoints) and which carry a landing slipway (beaches of
// a dock's landing ground, client-harbour-slipways.ts). Extracted from the
// loop so the quay and slipway share one place.

export type HarbourFrame = {
  readonly dockEndpointKeys: ReadonlySet<string>;
  readonly slipways: ReadonlyMap<string, SlipwayPlacement>;
};

export type HarbourPieceDeps = {
  readonly dockOverlay: Pick<DockOverlay, "addInstance" | "addSlipway">;
  readonly terrainAt: (x: number, y: number) => Tile["terrain"];
  /** Ground height under a harbour piece; the quay and slipways sit on the land and overhang the water. */
  readonly landYAt: (x: number, y: number) => number;
  readonly addShadow: (x: number, z: number, y: number, kind: "quay" | "slipway") => void;
};

export const buildHarbourFrame = (
  state: { readonly dockPairs: readonly DockPair[]; readonly tiles: ReadonlyMap<string, Tile> },
  keyFor: (x: number, y: number) => string,
  terrainAt: (x: number, y: number) => Tile["terrain"]
): HarbourFrame => {
  return { dockEndpointKeys: dockEndpointKeySet(state.dockPairs, keyFor), slipways: slipwayPlacementsFor(state, terrainAt) };
};

/** Adds the quay or the slipway standing on one LAND tile, if any. */
export const addHarbourPieceAt = (
  frame: HarbourFrame,
  deps: HarbourPieceDeps,
  tile: Tile | undefined,
  tileKey: string,
  wx: number,
  wy: number,
  x: number,
  z: number
): void => {
  const surfaceY = Math.max(deps.landYAt(wx, wy), -0.04) + 0.02;
  if (tile?.dockId || frame.dockEndpointKeys.has(tileKey)) {
    deps.dockOverlay.addInstance(x, z, surfaceY, rotationForFacing(harbourFacingAt(deps.terrainAt, wx, wy)), wx, wy);
    deps.addShadow(x, z, surfaceY, "quay");
    return;
  }
  const slipway = frame.slipways.get(tileKey);
  if (!slipway) return;
  deps.dockOverlay.addSlipway(x, z, surfaceY, rotationForFacing(slipway.facing), slipway.fit);
  deps.addShadow(x, z, surfaceY, "slipway");
};
