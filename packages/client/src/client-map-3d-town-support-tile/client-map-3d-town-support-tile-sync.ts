// Per-frame sync of the selected town's support-plot hatches (true-3D),
// extracted from client-map-3d.ts. The 2D renderer draws its own plots from
// the same lookup (client-town-support-plot-lookup.ts).
import type { RoadCutDirections } from "../client-map-3d-hill-shape.js";
import { hillFootprintTopY } from "../client-map-3d-tile-surface-y/client-map-3d-tile-surface-y.js";
import { supportPlotAnchorTown, townSupportPlotEntries, type TownSupportLookupDeps } from "../client-town-support-plot-lookup.js";
import type { TownSupportTileOverlay } from "./client-map-3d-town-support-tile.js";

// Half the hatch frame's 0.36 width (hatchFrameGeo).
const HATCH_HALF_EXTENT = 0.18;
const TILE_CENTER_OFFSET = 0.5;
// Seat heights only change when the terrain rebuilds; selecting towns between
// rebuilds can only add plots, so cap the cache rather than let it grow.
const SEAT_CACHE_MAX = 256;

export type TownSupportTileSyncDeps = {
  readonly overlay: TownSupportTileOverlay;
  readonly lookupDeps: TownSupportLookupDeps;
  readonly selected: () => { readonly x: number; readonly y: number } | undefined;
  readonly sceneOrigin: { readonly camX: number; readonly camY: number };
  readonly toroidDelta: (from: number, to: number, dim: number) => number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly cornerYAt: (cornerX: number, cornerZ: number) => number;
  readonly isHillsAt: (x: number, y: number) => boolean;
  // The latest terrain rebuild's hill cut (roads + AFC pads), read each frame.
  readonly hillCutAt: () => (x: number, y: number) => RoadCutDirections | undefined;
  readonly rise: number;
};

export const createTownSupportTileSync = (deps: TownSupportTileSyncDeps): (() => void) => {
  // Per-frame sync, but the 25-sample dome probe per plot only needs redoing
  // after a terrain rebuild -- which always hands out a fresh hillCutAt.
  const seatCache = new Map<string, number>();
  let seatCacheFor: ((x: number, y: number) => RoadCutDirections | undefined) | undefined;
  return () => {
    const { overlay, lookupDeps } = deps;
    overlay.clear();
    const selectedCoord = deps.selected();
    const selected = selectedCoord ? lookupDeps.tiles.get(lookupDeps.keyFor(selectedCoord.x, selectedCoord.y)) : undefined;
    const anchor = supportPlotAnchorTown(selected, lookupDeps);
    if (!anchor) { overlay.commit(); return; }
    const hillCutAt = deps.hillCutAt();
    if (hillCutAt !== seatCacheFor || seatCache.size > SEAT_CACHE_MAX) {
      seatCache.clear();
      seatCacheFor = hillCutAt;
    }
    for (const { wx, wy, dx, dy, settled } of townSupportPlotEntries(anchor, lookupDeps)) {
      const sx = deps.toroidDelta(deps.sceneOrigin.camX, wx, deps.worldWidth);
      const sy = deps.toroidDelta(deps.sceneOrigin.camY, wy, deps.worldHeight);
      // On a hill the hatch rim sits on the dome (its collar dropping into it),
      // not at ground level where the dome buried it.
      const key = lookupDeps.keyFor(wx, wy);
      let surfaceY = seatCache.get(key);
      if (surfaceY === undefined) {
        surfaceY = hillFootprintTopY({
          cornerYAt: deps.cornerYAt, wx, wy, wxNext: lookupDeps.wrapX(wx + 1), wyNext: lookupDeps.wrapY(wy + 1),
          rise: deps.rise, halfExtent: HATCH_HALF_EXTENT, isHillsAt: deps.isHillsAt,
          wrapX: lookupDeps.wrapX, wrapY: lookupDeps.wrapY, hillCut: hillCutAt(wx, wy)
        });
        seatCache.set(key, surfaceY);
      }
      overlay.addInstance(sx + TILE_CENTER_OFFSET, sy + TILE_CENTER_OFFSET, surfaceY, dx, dy, settled);
    }
    overlay.commit();
  };
};
