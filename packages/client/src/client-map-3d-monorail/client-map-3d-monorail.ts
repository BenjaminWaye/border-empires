import type { Color, Scene, Texture } from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { toroidDelta } from "../client-map-3d-pointer-pick.js";
import { TILE_CENTER_OFFSET } from "../client-map-3d-capture-overlays.js";
import { createRoadOverlay } from "../client-map-3d-road-overlay/client-map-3d-road-overlay.js";
import type { RoadDirections } from "../client-road-network/client-road-network.js";
import type { TerrainWindow } from "../client-map-3d-terrain-window/client-map-3d-terrain-window.js";
import { createMonorailGuideway, RAIL_HEIGHT, type ElevationAt } from "./client-map-3d-monorail-guideway.js";
import { traceMonorailLines } from "./client-map-3d-monorail-routes.js";
import { createMonorailTrains } from "./client-map-3d-monorail-trains.js";

// Town links in the true-3D renderer: an elevated twin-beam monorail on pylons
// with trains running between the towns, over a soft ground shadow. Same
// clear / addInstance / commit lifecycle as the old road ribbon, plus a
// per-frame update() for the trains and junction lights.
//
// The 2D canvas counterpart is client-map-render/client-map-road-2d.ts.

export type MonorailRoadDeps = {
  readonly envMap?: Texture | undefined;
  readonly wrapX: (x: number) => number;
  readonly wrapY: (y: number) => number;
  readonly ownerColorAt: (wx: number, wy: number) => Color | undefined;
};

export type MonorailRoadOverlay = {
  readonly clear: (window: TerrainWindow, roadDirsAt: (wx: number, wy: number) => RoadDirections | undefined) => void;
  readonly addInstance: (tileX: number, tileY: number, sceneX: number, sceneZ: number, elevationAt: ElevationAt, dirs: RoadDirections) => void;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createMonorailRoadOverlay = (scene: Scene, deps: MonorailRoadDeps): MonorailRoadOverlay => {
  const shadow = createRoadOverlay(scene, "shadow");
  const guideway = createMonorailGuideway(scene, deps.envMap);
  const trains = createMonorailTrains(scene, deps.envMap);
  let terrainWindow: TerrainWindow | undefined;
  let roadDirsAt: ((wx: number, wy: number) => RoadDirections | undefined) | undefined;
  let elevationAt: ElevationAt | undefined;
  const visibleTiles: Array<{ wx: number; wy: number; dirs: RoadDirections }> = [];

  return {
    clear: (nextWindow, nextRoadDirsAt) => {
      terrainWindow = nextWindow;
      roadDirsAt = nextRoadDirsAt;
      visibleTiles.length = 0;
      shadow.clear();
      guideway.clear();
    },
    addInstance: (tileX, tileY, sceneX, sceneZ, tileElevationAt, dirs) => {
      elevationAt = tileElevationAt;
      visibleTiles.push({ wx: tileX, wy: tileY, dirs });
      shadow.addInstance(tileX, tileY, sceneX, sceneZ, tileElevationAt, dirs);
      guideway.addTile(tileX, tileY, sceneX, sceneZ, tileElevationAt, dirs);
    },
    commit: () => {
      shadow.commit();
      guideway.commit();
      const camX = terrainWindow?.camX ?? 0, camY = terrainWindow?.camY ?? 0;
      const lines = terrainWindow && roadDirsAt && elevationAt
        ? traceMonorailLines({
          window: terrainWindow,
          sceneXOf: (wx) => toroidDelta(camX, wx, WORLD_WIDTH) + TILE_CENTER_OFFSET,
          sceneZOf: (wy) => toroidDelta(camY, wy, WORLD_HEIGHT) + TILE_CENTER_OFFSET,
          roadDirsAt, wrapX: deps.wrapX, wrapY: deps.wrapY, elevationAt, railHeight: RAIL_HEIGHT
        }, visibleTiles)
        : [];
      trains.setLines(lines, deps.ownerColorAt);
    },
    update: (nowMs) => {
      guideway.update(nowMs);
      trains.update(nowMs);
    },
    dispose: () => {
      shadow.dispose();
      guideway.dispose();
      trains.dispose();
    }
  };
};
