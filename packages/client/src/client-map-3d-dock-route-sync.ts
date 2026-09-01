import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { toroidDelta } from "./client-map-3d-pointer-pick.js";
import type { Heightfield } from "./client-map-3d-heightfield/client-map-3d-heightfield.js";
import type { DockRouteOverlay } from "./client-map-3d-dock-route-overlay.js";
import type { ClientState } from "./client-state/client-state.js";
import type { DockPair } from "./client-types.js";

const TILE_CENTER_OFFSET = 0.5;

// True-3D counterpart of client-dock-route-draw.ts. Populates the currently
// selected dock's sea-route overlay (same server-authoritative/A*-fallback
// route data as the 2D renderer -- see resolveDockSeaRoute) placed via
// toroidDelta + the live heightfield surface instead of the 2D flat-grid
// worldToScreen projection, so it actually follows the 3D terrain instead of
// floating misaligned over it.
//
// This sync only re-runs when the selection/dockPairs key changes (see the
// call site in client-map-3d.ts), not every frame -- so its segment
// positions must be anchored to sceneOrigin.camX/camY (the terrain's stable
// rebuild anchor, which every other overlay in that module uses), not the
// live state.camX/camY. state.camX/camY change continuously while the user
// pans (the camera moves smoothly against sceneOrigin every frame -- see
// applyCamera's offsetX/offsetZ), so anchoring segments to it baked in
// whatever pan offset happened to be live at the moment the dock was
// selected, then left that offset fixed: the line stayed glued to the
// screen instead of the terrain and visibly drifted as the camera panned.
export function syncDockRouteOverlay(
  state: ClientState,
  sceneOrigin: { readonly camX: number; readonly camY: number },
  heightfield: Heightfield,
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
    if (route.length < 2) return;
    const surfaceYAt = (x: number, y: number): number => Math.max(heightfield.elevationAt(x, y), heightfield.cornerYAt(x, y));
    for (let i = 1; i < route.length; i += 1) {
      const a = route[i - 1]!;
      const b = route[i]!;
      // A hop that jumps more than half the world across is the route
      // wrapping the toroidal seam, not an adjacent step -- skip it rather
      // than drawing a line clear across the map (mirrors the 2D renderer's
      // segmentWraps check in client-dock-route-draw.ts).
      if (Math.abs(a.x - b.x) > WORLD_WIDTH / 2 || Math.abs(a.y - b.y) > WORLD_HEIGHT / 2) continue;
      const aDx = toroidDelta(sceneOrigin.camX, a.x, WORLD_WIDTH) + TILE_CENTER_OFFSET;
      const aDy = toroidDelta(sceneOrigin.camY, a.y, WORLD_HEIGHT) + TILE_CENTER_OFFSET;
      const bDx = toroidDelta(sceneOrigin.camX, b.x, WORLD_WIDTH) + TILE_CENTER_OFFSET;
      const bDy = toroidDelta(sceneOrigin.camY, b.y, WORLD_HEIGHT) + TILE_CENTER_OFFSET;
      dockRouteOverlay.addSegment(aDx, aDy, surfaceYAt(a.x, a.y), bDx, bDy, surfaceYAt(b.x, b.y));
    }
    return;
  }
}
