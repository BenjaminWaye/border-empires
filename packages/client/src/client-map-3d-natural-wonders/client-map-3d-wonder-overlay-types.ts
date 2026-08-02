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
  readonly addInstance: (centerX: number, centerZ: number, surfaceY: number) => void;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};
