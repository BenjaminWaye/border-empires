// Trailing-edge throttle for the 3D border overlay's pylon/segment PLACEMENT
// pass (client-map-3d.ts's renderReachOverlay3DPylons) -- extracted so the
// throttle-vs-sceneOrigin coupling below has its own home instead of adding
// more lines to the already-oversized client-map-3d.ts.
//
// Placement recomputes a full visibility filter + diffTransitions() over
// every pylon/segment plus a draw call per one, so it's floored to run at
// most once per `minIntervalMs` while the camera is idle and nothing is
// transitioning. But every placed pylon/segment's scene position is
// computed relative to sceneOrigin (the terrain rebuild anchor), and
// sceneOrigin jumps atomically whenever a rebuild commits -- independent of
// this throttle's own cadence. Flooring on elapsed time alone let a rebuild
// land inside the cooldown window and leave already-placed geometry
// rendering at its OLD sceneOrigin-relative position for up to
// `minIntervalMs` after the terrain/camera had already jumped to the new
// anchor: the border overlay would briefly detach and appear to "follow"
// the camera pan, then snap back once the throttle finally let a recompute
// through. So the floor is bypassed whenever sceneOrigin has moved since
// the last call, keeping placement in lockstep with every rebuild.
export const createReachOverlayPlacementThrottle = (minIntervalMs: number) => {
  let lastAt = 0;
  let lastOriginX = Number.NaN;
  let lastOriginY = Number.NaN;
  return {
    /** Returns whether the caller should run its full placement pass this call, and records that it did. */
    shouldRun: (nowMs: number, sceneOriginX: number, sceneOriginY: number): boolean => {
      const originMoved = sceneOriginX !== lastOriginX || sceneOriginY !== lastOriginY;
      if (!originMoved && lastAt !== 0 && nowMs - lastAt < minIntervalMs) return false;
      lastAt = nowMs;
      lastOriginX = sceneOriginX;
      lastOriginY = sceneOriginY;
      return true;
    }
  };
};
