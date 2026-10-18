import { isDormantFrontierTile } from "../client-reach-overlay/client-reach-overlay.js";
import { incursionHatchColors, incursionMarkColor, incursionNeighbourKindAt, incursionOwnerAt, rivalReachOverMyTile, type IncursionDeps } from "../client-reach-incursion/client-reach-incursion.js";
import { cachedIncursionBreachLayout } from "../client-reach-incursion/client-incursion-breach-layout-cache.js";
import { incursionBreachStyle, type IncursionBreachStyle } from "../client-reach-incursion/client-incursion-breach-style.js";
import type { ReachOverlay3D } from "../client-map-3d-aether-survey-line/client-map-3d-aether-survey-line.js";
import type { Tile } from "../client-types.js";

export type ReachTileOverlayDeps = IncursionDeps & {
  readonly me: string;
  /** The (viewer-separated) owner colour lookup the ownership fill uses; the hatch pairs the intruder's colour with the viewer's. */
  readonly ownerColor: (ownerId: string) => string;
  /** Pocket-edge look on sides facing the viewer's land; defaults to the live setting (spikes unless an admin changed it; client-incursion-breach-style.ts). */
  readonly breachStyle?: IncursionBreachStyle;
};

/**
 * Per-tile reach overlays for one visible tile in the 3D terrain rebuild:
 * the dormant-frontier tint on the viewer's own tiles (mirrors the 2D path in
 * client-runtime-loop.ts), the rival-reach lines on the viewer's own tiles
 * inside a rival's reach, and the incursion hatch + pocket edge on rival
 * tiles inside the viewer's reach (with the breach outline on the sides that
 * face the viewer's own land). Extracted from client-map-3d.ts's tile loop.
 */
export const addReachTileOverlays3D = (
  overlay: Pick<ReachOverlay3D, "addDormantFrontierTile" | "addIncursionTile" | "addRivalReachTile">,
  tile: Tile,
  wx: number,
  wy: number,
  scene: { readonly x: number; readonly z: number; readonly y: number },
  myReach: ReadonlySet<string>,
  deps: ReachTileOverlayDeps
): void => {
  if (tile.ownerId === deps.me) {
    if (isDormantFrontierTile(tile)) overlay.addDormantFrontierTile(scene.x, scene.z, scene.y, 1);
    const rival = rivalReachOverMyTile(tile, deps.me);
    if (rival) overlay.addRivalReachTile(scene.x, scene.z, scene.y, deps.ownerColor(rival));
    return;
  }
  const intruder = incursionOwnerAt(tile, deps.keyFor(wx, wy), deps.me, myReach);
  if (!intruder) return;
  const intruderColor = deps.ownerColor(intruder);
  const style = deps.breachStyle ?? incursionBreachStyle();
  const layout = cachedIncursionBreachLayout(style, incursionNeighbourKindAt(wx, wy, intruder, deps.me, deps, myReach), wx, wy);
  overlay.addIncursionTile(
    scene.x,
    scene.z,
    scene.y,
    incursionHatchColors(intruderColor, deps.ownerColor(deps.me)),
    incursionMarkColor(intruderColor),
    layout.straightEdges,
    { style, worldX: wx, worldY: wy, layout }
  );
};
