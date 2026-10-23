import { BufferGeometry, type LineSegments } from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
const TILE_CENTER_OFFSET = 0.5;
import { writeBendingMarkerCorners } from "../client-map-3d-bending-marker-geometry/client-map-3d-bending-marker-geometry.js";
export type TileHighlightDeps = {
  sceneOrigin: { camX: number; camY: number };
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  cornerYAt: (x: number, y: number) => number;
  toroidDelta: (from: number, to: number, size: number) => number;
  // Hill dome height above flat ground at tile-local (u, v); see hillRiseAt.
  hillRiseAt?: (wx: number, wy: number, u: number, v: number) => number;
};
export const syncTileHighlightMarker = (
    deps: TileHighlightDeps,
    marker: LineSegments,
    tile: { x: number; y: number } | undefined,
    riseAboveSurface: number
  ): void => {
    if (!tile) {
      marker.visible = false;
      return;
    }
    const dx = deps.toroidDelta(deps.sceneOrigin.camX, tile.x, WORLD_WIDTH);
    const dy = deps.toroidDelta(deps.sceneOrigin.camY, tile.y, WORLD_HEIGHT);
    // Each corner of the marker is anchored to that corner's actual
    // rendered Y so the outline bends with the heightfield instead of
    // floating as a flat plane above bowing terrain.
    const wxNext = deps.wrapX(tile.x + 1);
    const wyNext = deps.wrapY(tile.y + 1);
    // Plus the hill dome's own height at each outline corner (the outline
    // sits 0.48 out from the tile centre), so it lies on a hill instead of
    // under it.
    const hill = (u: number, v: number): number => deps.hillRiseAt?.(tile.x, tile.y, u, v) ?? 0;
    const cornerY00 = deps.cornerYAt(tile.x, tile.y) + hill(-0.48, -0.48);
    const cornerY10 = deps.cornerYAt(wxNext, tile.y) + hill(0.48, -0.48);
    const cornerY01 = deps.cornerYAt(tile.x, wyNext) + hill(-0.48, 0.48);
    const cornerY11 = deps.cornerYAt(wxNext, wyNext) + hill(0.48, 0.48);
    marker.position.set(0, 0, 0);
    writeBendingMarkerCorners(
      marker.geometry as BufferGeometry,
      dx + TILE_CENTER_OFFSET, 0, dy + TILE_CENTER_OFFSET,
      cornerY00, cornerY10, cornerY01, cornerY11,
      riseAboveSurface
    );
    marker.visible = true;
  };
