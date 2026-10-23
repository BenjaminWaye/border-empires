import type { MapPrepStage } from "../client-map-prep/client-map-prep-stages.js";
import type { ClientState } from "../client-state/client-state.js";
import type { DockPair, Tile, TileVisibilityState } from "../client-types.js";

// What the true-3D renderer needs from the client (extracted from
// client-map-3d.ts, 500-line budget).
type TileTimedProgress = {
  readonly startAt: number;
  readonly resolvesAt: number;
};

export type ClientThreeTerrainRendererDeps = {
  state: ClientState;
  canvas: HTMLCanvasElement;
  keyFor: (x: number, y: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  terrainAt: (x: number, y: number) => Tile["terrain"];
  effectiveOverlayColor: (ownerId: string) => string;
  tileVisibilityStateAt: (x: number, y: number, tile?: Tile) => TileVisibilityState;
  settlementProgressForTile: (x: number, y: number) => TileTimedProgress | undefined;
  isPlacementValidForTile: (tile: Tile | undefined) => boolean; resolveDockSeaRoute: (pair: DockPair) => Array<{ x: number; y: number }>; isDockRouteVisibleForPlayer: (pair: DockPair) => boolean;
  // Fires when the GPU drops the WebGL context; the host tears this instance down and falls back to 2D (client-map-3d-render-target.ts).
  onContextLost?: (reason: string) => void;
  // Called before each heavy build step so the login overlay can show and paint it (client-map-prep.ts).
  onStage?: (stage: MapPrepStage) => Promise<void>;
};
