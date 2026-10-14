import { isDormantFrontierTile } from "../client-reach-overlay/client-reach-overlay.js";
import { incursionHatchColors, incursionMarkColor, incursionOwnerAt, incursionPocketEdges, type IncursionDeps } from "../client-reach-incursion/client-reach-incursion.js";
import type { ReachOverlay3D } from "../client-map-3d-aether-survey-line/client-map-3d-aether-survey-line.js";
import type { Tile } from "../client-types.js";

export type ReachTileOverlayDeps = IncursionDeps & {
  readonly me: string;
  /** The (viewer-separated) owner colour lookup the ownership fill uses; the hatch pairs the intruder's colour with the viewer's. */
  readonly ownerColor: (ownerId: string) => string;
};

/**
 * Per-tile reach overlays for one visible tile in the 3D terrain rebuild:
 * the dormant-frontier tint on the viewer's own tiles (mirrors the 2D path in
 * client-runtime-loop.ts), and the incursion hatch + pocket edge on rival
 * tiles inside the viewer's reach. Extracted from client-map-3d.ts's tile loop.
 */
export const addReachTileOverlays3D = (
  overlay: Pick<ReachOverlay3D, "addDormantFrontierTile" | "addIncursionTile">,
  tile: Tile,
  wx: number,
  wy: number,
  scene: { readonly x: number; readonly z: number; readonly y: number },
  myReach: ReadonlySet<string>,
  deps: ReachTileOverlayDeps
): void => {
  if (tile.ownerId === deps.me && isDormantFrontierTile(tile)) {
    overlay.addDormantFrontierTile(scene.x, scene.z, scene.y, 1);
    return;
  }
  const intruder = incursionOwnerAt(tile, deps.keyFor(wx, wy), deps.me, myReach);
  if (!intruder) return;
  const intruderColor = deps.ownerColor(intruder);
  overlay.addIncursionTile(scene.x, scene.z, scene.y, incursionHatchColors(intruderColor, deps.ownerColor(deps.me)), incursionMarkColor(intruderColor), incursionPocketEdges(wx, wy, intruder, deps));
};
