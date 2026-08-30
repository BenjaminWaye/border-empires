// The 2D canvas draw() loop in client-runtime-loop.ts throttles its own
// redraw cadence -- but in 3D mode it only draws a thin badge/marker/corner-
// icon layer over the WebGL canvas (most of its per-tile work is gated
// behind !isTrue3DRendererActive()), while the 24/40ms throttle below was
// tuned for the MUCH heavier full 2D-canvas tile render. Since the WebGL
// renderLoop (client-map-3d.ts) moves the camera continuously every single
// animation frame (client-map-input.ts's sub-tile pan), throttling this icon
// layer to a slower cadence than that made icons visibly lag/jitter behind
// the smoothly-panning terrain -- undetectable when panning snapped a whole
// tile at a time, obvious once it doesn't. Desktop rides the full rAF rate
// in 3D mode to stay in lockstep; mobile keeps a lighter cap since its GPUs
// are more constrained. The heavier 2D-only render keeps its original caps.
export const drawLoopMinFrameGapMs = (isTrue3DActive: boolean, isMobile: boolean): number => {
  if (isTrue3DActive) return isMobile ? 16 : 0;
  return isMobile ? 40 : 24;
};
