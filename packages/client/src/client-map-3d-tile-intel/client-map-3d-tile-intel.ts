// 3D per-tile "intel" overlays rebuilt with the visible terrain: the
// weak-defensibility warning and the Diplomacy map tint. One bundle so
// client-map-3d.ts (over the line cap) creates, clears, fills, commits and
// disposes them in a line each. 2D parity: client-map-2d-tile-intel.ts.

import type { Scene } from "three";
import type { Terrain } from "@border-empires/shared";
import { diplomacyStanceLookup, type DiplomacyStanceLookup } from "../client-diplomacy-overlay/client-diplomacy-overlay.js";
import { exposedSidesForTile, isOwnedSettledLandTile, weakDefensibilitySeverity } from "../client-defensibility-tile.js";
import { createDefensibilityOverlay } from "../client-map-3d-defensibility-overlay.js";
import { createDiplomacyOverlay3D } from "../client-map-3d-diplomacy-overlay.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileVisibilityState } from "../client-types.js";

type IntelState = Pick<ClientState, "tiles" | "me" | "showWeakDefensibility" | "showDiplomacyOverlay" | "allies" | "activeTruces">;

export type TileIntelOverlays3DDeps = {
  keyFor: (x: number, y: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  terrainAt: (x: number, y: number) => Terrain;
};

export type TileIntelOverlays3D = {
  /** Clears both overlays and snapshots the stances for this rebuild. */
  readonly begin: (state: IntelState) => void;
  readonly addTile: (tile: Tile | undefined, visibility: TileVisibilityState, x: number, z: number, surfaceY: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createTileIntelOverlays3D = (scene: Scene, maxTiles: number, deps: TileIntelOverlays3DDeps): TileIntelOverlays3D => {
  const defensibility = createDefensibilityOverlay(scene, maxTiles);
  const diplomacy = createDiplomacyOverlay3D(scene, maxTiles);
  let state: IntelState | undefined;
  let stanceOf: DiplomacyStanceLookup | undefined;

  const begin = (next: IntelState): void => {
    defensibility.clear();
    diplomacy.clear();
    state = next;
    stanceOf = next.showDiplomacyOverlay ? diplomacyStanceLookup(next) : undefined;
  };

  const addTile = (tile: Tile | undefined, visibility: TileVisibilityState, x: number, z: number, surfaceY: number): void => {
    if (!state || !tile) return;
    if (stanceOf && visibility !== "unexplored") {
      const stance = stanceOf(tile.ownerId);
      if (stance) diplomacy.addInstance(x, z, surfaceY, stance);
    }
    if (state.showWeakDefensibility && isOwnedSettledLandTile(tile, state.me)) {
      const exposedSides = exposedSidesForTile(tile, { tiles: state.tiles, me: state.me, ...deps });
      const severity = weakDefensibilitySeverity(exposedSides.length);
      if (severity) defensibility.addInstance(x, z, surfaceY, severity);
    }
  };

  const commit = (): void => {
    defensibility.commit();
    diplomacy.commit();
  };

  const dispose = (): void => {
    defensibility.dispose();
    diplomacy.dispose();
  };

  return { begin, addTile, commit, dispose };
};
