import type { Tile } from "../client-types.js";

export interface ReachOverlayCornerVisibilityDeps {
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  keyFor: (x: number, y: number) => string;
  getTile: (key: string) => Tile | undefined;
  tileVisibilityStateAt: (x: number, y: number, tile?: Tile) => "visible" | "fogged" | "unexplored";
  discoveredTiles: { has: (key: string) => boolean };
  fogDisabled: boolean;
  revealWholeMap: boolean;
}

// A reach-boundary corner touches up to 4 tiles; it's visible if any of them is.
//
// The true-3D renderer only keeps map chunks loaded near the current camera
// position (see client-view-refresh.ts), so an owned island the camera isn't
// near right now has no entry in state.tiles even though it was discovered
// long ago. tileVisibilityStateAt() treats a missing tile the same as
// genuinely fogged ("!tile || tile.fogged" -> "fogged"), which silently
// dropped the Aether Survey Line border overlay on every island but the one
// nearest the camera. When there's no locally-cached tile, fall back to
// discoveredTiles (which persists independent of the current viewport)
// instead of treating "not streamed yet" the same as "actually fogged".
export const isReachOverlayCornerVisible = (cx: number, cy: number, deps: ReachOverlayCornerVisibilityDeps): boolean => {
  const candidates: Array<[number, number]> = [
    [cx, cy],
    [cx - 1, cy],
    [cx, cy - 1],
    [cx - 1, cy - 1]
  ];
  return candidates.some(([tx, ty]) => {
    const wx = deps.wrapX(tx);
    const wy = deps.wrapY(ty);
    const key = deps.keyFor(wx, wy);
    const tile = deps.getTile(key);
    if (tile) {
      const v = deps.tileVisibilityStateAt(wx, wy, tile);
      return v === "visible" || (v === "unexplored" && deps.revealWholeMap);
    }
    return deps.revealWholeMap || deps.fogDisabled || deps.discoveredTiles.has(key);
  });
};
