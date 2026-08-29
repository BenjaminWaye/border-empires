// The window of world tiles the 3D renderer has populated into its buffers.
//
// `rebuildVisibleTerrain()` tears down and repopulates ~40 overlay systems plus
// the heightfield, and every attribute it touches is re-uploaded to the GPU on
// the next `renderer.render()`. That upload — not the rebuild's own JS — is the
// dominant frame cost: a trace of a zoom gesture spent 8.8s of 14s inside
// `bufferSubData`, with rebuilds running back to back at ~106ms each.
//
// It used to fire whenever camX/camY/zoom/width/height changed *at all*, and a
// wheel or pan gesture changes those on nearly every frame. But the camera
// transform itself (applyCamera) is a few float ops that already run unthrottled
// every frame, so the picture is already correct without a rebuild — the rebuild
// only exists to change *which tiles* are in the buffers.
//
// So: build a window padded beyond what the camera strictly needs, and rebuild
// only when the camera asks for tiles outside it. Zooming in shrinks the
// requirement and never rebuilds at all; zooming out or panning rebuilds once
// per pad-width of travel instead of once per input event.

export type TerrainWindow = {
  readonly camX: number;
  readonly camY: number;
  readonly halfW: number;
  readonly halfH: number;
};

export type RequiredWindowInput = {
  readonly zoom: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly camX: number;
  readonly camY: number;
};

// Extra window beyond the exact camera fit, per axis. 0.25 gives a zoom-out
// gesture ~25% of travel between rebuilds (~2 wheel notches at the 1.15 factor
// in client-map-zoom-step) and absorbs a quarter-screen pan for free. Higher
// values rebuild less but draw more permanently-offscreen instances every
// frame; drawing is far cheaper than re-uploading, but not free.
export const TERRAIN_WINDOW_PAD = 0.25;

// Minimum slack in whole tiles, so small windows (high zoom, few tiles on
// screen) still get hysteresis rather than a pad that rounds away to nothing.
const MIN_PAD_TILES = 2;

// `rebuildVisibleTerrain` walks an inclusive window one tile past the
// half-extent on each side: -halfW-1 .. halfW+1. Matches the visibleTileCount
// accounting it reports to the perf metrics.
export const tileCountForWindow = (halfW: number, halfH: number): number =>
  (2 * halfW + 3) * (2 * halfH + 3);

// The exact half-extents the camera needs at this zoom — unchanged from what
// rebuildVisibleTerrain computed inline before this module existed.
export const requiredTerrainWindow = ({
  zoom,
  canvasWidth,
  canvasHeight,
  camX,
  camY
}: RequiredWindowInput): TerrainWindow => {
  const size = Math.max(1, zoom);
  return {
    camX,
    camY,
    halfW: Math.max(1, Math.floor(canvasWidth / size / 2)),
    halfH: Math.max(1, Math.floor(canvasHeight / size / 2))
  };
};

const padExtent = (half: number): number =>
  half + Math.max(MIN_PAD_TILES, Math.ceil(half * TERRAIN_WINDOW_PAD));

// Pads the required window, then shrinks it back toward the requirement until
// it fits the preallocated buffer budget. Never returns less than required:
// at MIN_ZOOM the budget is sized for exactly the unpadded window, so the pad
// legitimately vanishes there.
export const padTerrainWindow = (required: TerrainWindow, maxTiles: number): TerrainWindow => {
  let halfW = padExtent(required.halfW);
  let halfH = padExtent(required.halfH);

  // Shrink whichever axis has more pad left, one tile at a time, so the
  // padded window keeps the aspect ratio of the screen rather than
  // collapsing one axis. The loop guard guarantees at least one axis still
  // has slack whenever this runs.
  while (tileCountForWindow(halfW, halfH) > maxTiles && (halfW > required.halfW || halfH > required.halfH)) {
    const wSlack = halfW - required.halfW;
    const hSlack = halfH - required.halfH;
    if (wSlack >= hSlack) halfW -= 1;
    else halfH -= 1;
  }

  return { camX: required.camX, camY: required.camY, halfW, halfH };
};

// Shortest signed distance from `from` to `to` on a wrapping axis of `size`.
// Same contract as toroidDelta in client-map-3d-pointer-pick.ts; duplicated
// rather than imported so this module stays free of the `three` dependency
// that file pulls in — this module's tests run pure, with no WebGL/three
// setup, and every call site here is on the hot rebuild-decision path.
const wrappedDelta = (from: number, to: number, size: number): number => {
  if (size <= 0) return to - from;
  const raw = ((to - from) % size + size) % size;
  return raw > size / 2 ? raw - size : raw;
};

const axisCovers = (
  builtHalf: number,
  builtCenter: number,
  requiredHalf: number,
  requiredCenter: number,
  worldSize: number
): boolean => {
  // A window spanning the whole wrapping axis covers every center.
  if (2 * builtHalf + 1 >= worldSize) return true;
  const drift = Math.abs(wrappedDelta(builtCenter, requiredCenter, worldSize));
  return builtHalf >= requiredHalf + drift;
};

// True when the already-populated window still contains everything the camera
// needs, so no rebuild is required. Both windows use the same half-extent
// convention, so the loop's +1 margin cancels out and is not modelled here.
export const terrainWindowCovers = (
  built: TerrainWindow | undefined,
  required: TerrainWindow,
  worldWidth: number,
  worldHeight: number
): boolean => {
  if (!built) return false;
  return (
    axisCovers(built.halfW, built.camX, required.halfW, required.camX, worldWidth) &&
    axisCovers(built.halfH, built.camY, required.halfH, required.camY, worldHeight)
  );
};

// True when the camera has panned since the last rebuild, i.e. builtWindow's
// camX/camY no longer matches the live camera.
//
// NOT used by client-map-3d.ts's maybeRebuild anymore. It used to force a
// rebuild on any nonzero camX/camY drift, because every 3D overlay (border
// pylons, flags, badges, selection markers...) repositioned itself every
// frame straight off the live camera while the terrain's baked geometry only
// updated on rebuild -- so the two would visibly separate mid-pan the moment
// they used different anchors. client-map-3d.ts now fixes that by anchoring
// EVERY per-frame overlay to the same "sceneOrigin" the terrain was last
// rebuilt against (updated only when a rebuild commits), and moving the
// camera itself to carry the live pan in between -- so terrain and overlays
// never disagree about their anchor, and this exact-match check is no longer
// needed to prevent that. Kept as a public, independently testable predicate
// (and its own unit tests) in case a future caller needs "did the window
// itself move" rather than "does it still cover what's required"
// (terrainWindowCovers, which maybeRebuild uses instead).
export const terrainWindowPanned = (
  built: TerrainWindow | undefined,
  required: TerrainWindow
): boolean => {
  if (!built) return false;
  return built.camX !== required.camX || built.camY !== required.camY;
};
