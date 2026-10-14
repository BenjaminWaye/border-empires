import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { toroidDelta } from "./client-map-3d-pointer-pick.js";
import type { DockRouteOverlay } from "./client-map-3d-dock-route-overlay.js";
import type { ClientState } from "./client-state/client-state.js";
import type { DockPair } from "./client-types.js";

const TILE_CENTER_OFFSET = 0.5;

type RoutePoint = { x: number; y: number };

// Converts a world-space route into continuous scene-space polylines.
//
// Each point used to be placed independently via toroidDelta from the scene
// origin, which wraps at half the world. That broke long routes in two ways:
// a hop crossing the world seam (x 639 -> 0) was dropped, leaving a gap; and
// a hop straddling the point opposite the scene origin flipped from +W/2 to
// -W/2, drawing a stray line across the map. Instead, walk the route as
// unwrapped steps from one anchor, choosing the anchor as the route point
// nearest the scene origin so the part the player is looking at lands in
// its true place. A hop that is not an adjacent step (malformed route)
// starts a new polyline rather than being bridged.
export const dockRouteScenePaths = (
  route: readonly RoutePoint[],
  sceneOrigin: { readonly camX: number; readonly camY: number }
): Array<Array<{ x: number; z: number }>> => {
  const runs: RoutePoint[][] = [];
  let current: RoutePoint[] = [];
  for (const point of route) {
    const prev = current[current.length - 1];
    if (prev) {
      const stepX = toroidDelta(prev.x, point.x, WORLD_WIDTH);
      const stepY = toroidDelta(prev.y, point.y, WORLD_HEIGHT);
      if (Math.abs(stepX) > 1 || Math.abs(stepY) > 1) {
        runs.push(current);
        current = [];
      }
    }
    current.push(point);
  }
  runs.push(current);

  const paths: Array<Array<{ x: number; z: number }>> = [];
  for (const run of runs) {
    if (run.length < 2) continue;
    const unwrapped: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];
    for (let i = 1; i < run.length; i += 1) {
      const prev = unwrapped[i - 1]!;
      unwrapped.push({
        x: prev.x + toroidDelta(run[i - 1]!.x, run[i]!.x, WORLD_WIDTH),
        y: prev.y + toroidDelta(run[i - 1]!.y, run[i]!.y, WORLD_HEIGHT)
      });
    }
    let anchor = 0;
    let anchorDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < run.length; i += 1) {
      const distance =
        Math.abs(toroidDelta(sceneOrigin.camX, run[i]!.x, WORLD_WIDTH)) + Math.abs(toroidDelta(sceneOrigin.camY, run[i]!.y, WORLD_HEIGHT));
      if (distance < anchorDistance) {
        anchorDistance = distance;
        anchor = i;
      }
    }
    const baseX = toroidDelta(sceneOrigin.camX, run[anchor]!.x, WORLD_WIDTH) - unwrapped[anchor]!.x;
    const baseZ = toroidDelta(sceneOrigin.camY, run[anchor]!.y, WORLD_HEIGHT) - unwrapped[anchor]!.y;
    paths.push(unwrapped.map((u) => ({ x: baseX + u.x + TILE_CENTER_OFFSET, z: baseZ + u.y + TILE_CENTER_OFFSET })));
  }
  return paths;
};

// True-3D counterpart of client-dock-route-draw.ts. Populates the sea-route
// overlay for every pairing that has the selected tile as an endpoint (a
// dock can have several connectedDockIds, not just one pairedDockId, so this
// must not stop after the first match) using the same server-authoritative/
// A*-fallback route data as the 2D renderer -- see resolveDockSeaRoute.
//
// The cached wrapper below also invalidates when discovery or fog changes.
// Route geometry is not rebuilt every frame, so
// positions must be anchored to sceneOrigin.camX/camY (the terrain's stable
// rebuild anchor, which every other overlay in that module uses), not the
// live state.camX/camY, which moves continuously while the user pans and
// would leave the line glued to the screen instead of the terrain.
export function syncDockRouteOverlay(
  state: ClientState,
  sceneOrigin: { readonly camX: number; readonly camY: number },
  dockRouteOverlay: DockRouteOverlay,
  resolveDockSeaRoute: (pair: DockPair) => Array<{ x: number; y: number }>,
  isDockRouteVisibleForPlayer: (pair: DockPair) => boolean
): void {
  const selected = state.selected;
  if (!selected) return;
  for (const pair of state.dockPairs) {
    if (!isDockRouteVisibleForPlayer(pair)) continue;
    const isEndpoint =
      (pair.ax === selected.x && pair.ay === selected.y) || (pair.bx === selected.x && pair.by === selected.y);
    if (!isEndpoint) continue;
    const route = resolveDockSeaRoute(pair);
    if (route.length < 2) continue;
    for (const path of dockRouteScenePaths(route, sceneOrigin)) dockRouteOverlay.addPath(path);
  }
}


export type DockRouteSync = (
  state: ClientState,
  sceneOrigin: { readonly camX: number; readonly camY: number },
  resolveDockSeaRoute: (pair: DockPair) => Array<{ x: number; y: number }>,
  isDockRouteVisibleForPlayer: (pair: DockPair) => boolean
) => void;

// Selection alone cannot invalidate routes: garrison vision arrives later,
// and administrative fog toggles can change visibility without moving the camera.
export const createDockRouteSync = (overlay: DockRouteOverlay): DockRouteSync => {
  let previousKey = "";
  let previousPairs: readonly DockPair[] | undefined;
  return (state, sceneOrigin, resolveDockSeaRoute, isDockRouteVisibleForPlayer): void => {
    const selected = state.selected;
    const key = [selected?.x, selected?.y, state.dockPairs.length, state.discoveredDockTiles.size,
      state.fogDisabled, sceneOrigin.camX, sceneOrigin.camY].join(":");
    if (key === previousKey && state.dockPairs === previousPairs) return;
    previousKey = key;
    previousPairs = state.dockPairs;
    overlay.clear();
    syncDockRouteOverlay(state, sceneOrigin, overlay, resolveDockSeaRoute, isDockRouteVisibleForPlayer);
    overlay.commit();
  };
};
