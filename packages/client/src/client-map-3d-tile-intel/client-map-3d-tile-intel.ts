// 3D per-tile "intel" overlays rebuilt with the visible terrain: the
// weak-defensibility warning (the Diplomacy view recolours territory itself,
// see client-diplomacy-overlay.ts). One bundle so
// client-map-3d.ts (over the line cap) creates, clears, fills, commits and
// disposes them in a line each. 2D parity: client-map-2d-tile-intel.ts.

import type { Scene } from "three";
import type { Terrain } from "@border-empires/shared";
import { exposedSidesForTile, isOwnedSettledLandTile, weakDefensibilitySeverity } from "../client-defensibility-tile.js";
import { createDefensibilityOverlay } from "../client-map-3d-defensibility-overlay.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileVisibilityState } from "../client-types.js";

type IntelState = Pick<ClientState, "tiles" | "me" | "showWeakDefensibility">;

export type TileIntelOverlays3DDeps = {
  keyFor: (x: number, y: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  terrainAt: (x: number, y: number) => Terrain;
};

export type TileIntelOverlays3D = {
  /** Clears the overlay and snapshots the state for this rebuild. */
  readonly begin: (state: IntelState) => void;
  readonly addTile: (tile: Tile | undefined, visibility: TileVisibilityState, x: number, z: number, surfaceY: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createTileIntelOverlays3D = (scene: Scene, maxTiles: number, deps: TileIntelOverlays3DDeps): TileIntelOverlays3D => {
  const defensibility = createDefensibilityOverlay(scene, maxTiles);
  let state: IntelState | undefined;

  const begin = (next: IntelState): void => {
    defensibility.clear();
    state = next;
  };

  const addTile = (tile: Tile | undefined, visibility: TileVisibilityState, x: number, z: number, surfaceY: number): void => {
    if (!state || !tile) return;
    if (state.showWeakDefensibility && isOwnedSettledLandTile(tile, state.me)) {
      const exposedSides = exposedSidesForTile(tile, { tiles: state.tiles, me: state.me, ...deps });
      const severity = weakDefensibilitySeverity(exposedSides.length);
      if (severity) defensibility.addInstance(x, z, surfaceY, severity);
    }
  };

  const commit = (): void => {
    defensibility.commit();
  };

  const dispose = (): void => {
    defensibility.dispose();
  };

  return { begin, addTile, commit, dispose };
};
