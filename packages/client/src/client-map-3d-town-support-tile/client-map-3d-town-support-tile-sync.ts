import { MAX_SUPPORT_RING_RADIUS } from "@border-empires/shared";
import { HEIGHTFIELD_HILLS_ELEVATION_BONUS } from "../client-map-3d-heightfield-terrain.js";
import { hillBumpsWithCorridorAt, hillNeighborFlagsAt, hillShapeHeight, type RoadCutDirections } from "../client-map-3d-hill-shape.js";
import { supportPlotAnchorTown, townSupportPlotEntries, type TownSupportLookupDeps } from "../client-town-support-plot-lookup.js";
import { PLOT_VERTICES } from "../client-town-support-plot/plot-style.js";
import type { TownSupportTileOverlay } from "./client-map-3d-town-support-tile.js";

type Coord = { readonly x: number; readonly y: number };
export type TownSupportTileSyncDeps = {
  readonly overlay: TownSupportTileOverlay;
  readonly lookupDeps: TownSupportLookupDeps;
  readonly selected: () => Coord | undefined;
  readonly hover?: () => Coord | undefined;
  readonly visibleAt?: (x: number, y: number) => boolean;
  readonly sceneOrigin: { readonly camX: number; readonly camY: number };
  readonly toroidDelta: (from: number, to: number, dim: number) => number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly cornerYAt: (cornerX: number, cornerZ: number) => number;
  readonly isHillsAt: (x: number, y: number) => boolean;
  readonly hillCutAt: () => (x: number, y: number) => RoadCutDirections | undefined;
  readonly rise: number;
};

export const plotSurfaceHeights = (wx: number, wy: number, deps: TownSupportTileSyncDeps): Float32Array => {
  const { lookupDeps: lookup } = deps;
  const c00 = deps.cornerYAt(wx, wy), c10 = deps.cornerYAt(lookup.wrapX(wx + 1), wy);
  const c01 = deps.cornerYAt(wx, lookup.wrapY(wy + 1)), c11 = deps.cornerYAt(lookup.wrapX(wx + 1), lookup.wrapY(wy + 1));
  const hills = deps.isHillsAt(wx, wy);
  const bumps = hillBumpsWithCorridorAt(wx, wy, hillNeighborFlagsAt(wx, wy, deps.isHillsAt, lookup.wrapX, lookup.wrapY));
  const cut = deps.hillCutAt()(wx, wy);
  const sample = (u: number, v: number): number => {
    const ground = (c00 * (1 - u) + c10 * u) * (1 - v) + (c01 * (1 - u) + c11 * u) * v;
    const bump = hills ? HEIGHTFIELD_HILLS_ELEVATION_BONUS * hillShapeHeight(u - 0.5, v - 0.5, bumps, wx, wy, cut) : 0;
    return ground + bump;
  };
  // Match the actual triangles: the plain heightfield has one quad per tile;
  // client-map-3d-hills.ts subdivides it 10 times with the same diagonal.
  // Bilinear interpolation alone can sink markers below a nonplanar quad.
  const subdivisions = hills ? 10 : 1;
  return Float32Array.from(PLOT_VERTICES, ([x, z]) => {
    const u = (x + 0.5) * subdivisions, v = (z + 0.5) * subdivisions;
    const a = Math.floor(u), b = Math.floor(v), fu = u - a, fv = v - b;
    const h00 = sample(a / subdivisions, b / subdivisions);
    const h10 = sample((a + 1) / subdivisions, b / subdivisions);
    const h01 = sample(a / subdivisions, (b + 1) / subdivisions);
    const h11 = sample((a + 1) / subdivisions, (b + 1) / subdivisions);
    const height = fu + fv <= 1
      ? h00 * (1 - fu - fv) + h10 * fu + h01 * fv
      : h11 * (fu + fv - 1) + h01 * (1 - fu) + h10 * (1 - fv);
    return height + deps.rise;
  });
};

export const createTownSupportTileSync = (deps: TownSupportTileSyncDeps): (() => void) => {
  // Fixed-size cache for ONE anchor, never an accumulating world/town map.
  const width = MAX_SUPPORT_RING_RADIUS * 2 + 1;
  const heights: (Float32Array | undefined)[] = Array.from({ length: width * width });
  let anchorKey = "";
  let terrain: ReturnType<TownSupportTileSyncDeps["hillCutAt"]> | undefined;
  return () => {
    const { overlay, lookupDeps: lookup } = deps;
    overlay.clear();
    const selected = deps.selected(), hover = deps.hover?.();
    const tile = selected ? lookup.tiles.get(lookup.keyFor(selected.x, selected.y)) : undefined;
    const anchor = supportPlotAnchorTown(tile, lookup);
    if (!anchor) { overlay.commit(); return; }
    const key = lookup.keyFor(anchor.x, anchor.y), hillCutAt = deps.hillCutAt();
    if (key !== anchorKey || terrain !== hillCutAt) {
      heights.fill(undefined);
      anchorKey = key;
      terrain = hillCutAt;
    }
    for (const { wx, wy, dx, dy } of townSupportPlotEntries(anchor, lookup)) {
      if (deps.visibleAt && !deps.visibleAt(wx, wy)) continue;
      const index = (dy + MAX_SUPPORT_RING_RADIUS) * width + dx + MAX_SUPPORT_RING_RADIUS;
      const surface = heights[index] ?? (heights[index] = plotSurfaceHeights(wx, wy, deps));
      const sx = deps.toroidDelta(deps.sceneOrigin.camX, wx, deps.worldWidth);
      const sz = deps.toroidDelta(deps.sceneOrigin.camY, wy, deps.worldHeight);
      const highlighted = (hover?.x === wx && hover.y === wy) || (selected?.x === wx && selected.y === wy);
      overlay.addInstance(sx + 0.5, sz + 0.5, surface, highlighted);
    }
    overlay.commit();
  };
};
