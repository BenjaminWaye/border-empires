// Renderer-parity note (AGENTS.md): both the 2D canvas and true-3D renderers
// read camera position off the same shared ClientState fields (camX/camY/
// camSubX/camSubY/selected) every frame -- confirmed in client-map-3d.ts and
// the 2D render path, neither of which branches on isTrue3DRendererActive()
// for *where* the camera points. This helper therefore needs no renderer-
// specific code to work in both: setting shared state is sufficient.
//
// Same camX/camY/camSubX/camSubY-reset-and-refresh shape as the existing
// inline pattern in client-hud.ts's feed focus buttons and
// client-muster-flags-panel.ts's wireMusterFocusButtons -- a third copy
// here, not a consolidation of those two (out of scope for this branch;
// worth extracting into one shared helper all three call sites use).
export const focusCameraOnTile = (
  state: { camX: number; camY: number; camSubX: number; camSubY: number; selected?: { x: number; y: number } | undefined },
  x: number,
  y: number,
  deps: { wrapX: (x: number) => number; wrapY: (y: number) => number; requestViewRefresh: () => void }
): void => {
  const wrappedX = deps.wrapX(x);
  const wrappedY = deps.wrapY(y);
  state.camX = wrappedX;
  state.camY = wrappedY;
  state.camSubX = 0;
  state.camSubY = 0;
  state.selected = { x: wrappedX, y: wrappedY };
  deps.requestViewRefresh();
};
