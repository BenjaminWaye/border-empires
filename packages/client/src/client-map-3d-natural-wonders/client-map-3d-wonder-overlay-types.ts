import type { Group } from "three";

/**
 * Standard per-wonder overlay lifecycle, matching the InstancedMesh
 * lifecycle used by every other client-map-3d overlay (watchtower, shard,
 * fort, ...): clear at frame start, addInstance per visible tile, commit
 * once geometry is known, update(nowMs) every frame for animation.
 */
export type WonderOverlay = {
  readonly group: Group;
  readonly clear: () => void;
  // wx/wy are the wonder's real (non camera-recentered) world tile
  // coordinates -- needed to sample the surrounding terrain's real
  // elevation for the ground-glow contour (see
  // client-map-3d-wonder-ground-contour.ts), independent of centerX/centerZ
  // which drift every frame as the camera pans.
  readonly addInstance: (centerX: number, centerZ: number, surfaceY: number, wx: number, wy: number) => void;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};
