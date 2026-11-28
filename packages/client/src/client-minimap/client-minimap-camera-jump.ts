// Moves the camera to a world tile, as the minimap and the world map do. Both renderers follow state.camX/camY
// (the 3D camera reads the same fields), so this serves 2D and true-3D alike.

export type CameraJumpState = { camX: number; camY: number; camSubX: number; camSubY: number };

export type CameraJumpDeps = {
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  requestViewRefresh: (radius?: number, force?: boolean) => void;
  maybeRefreshForCamera: (force?: boolean) => void;
};

export const jumpCameraToTile = (state: CameraJumpState, deps: CameraJumpDeps, x: number, y: number): void => {
  state.camX = deps.wrapX(x);
  state.camY = deps.wrapY(y);
  state.camSubX = 0;
  state.camSubY = 0;
  deps.requestViewRefresh(2, true);
  window.setTimeout(() => deps.maybeRefreshForCamera(), 120);
};
