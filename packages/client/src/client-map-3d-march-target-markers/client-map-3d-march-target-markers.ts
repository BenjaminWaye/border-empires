import { createWaypointFlag, type WaypointFlag } from "../client-map-3d-waypoint-flag/client-map-3d-waypoint-flag.js";
import { collectMarchTargets } from "../client-muster-march-targeting.js";
import type { Group } from "three";
import type { ClientState } from "../client-state/client-state.js";

// March-To target markers: reuse the waypoint flag model, tinted war red
// instead of empire color, planted on the destination tile of a
// "March To…" muster order. Capped at 3 -- the server's max muster flags
// per player (MUSTER_LIMIT). Extracted from client-map-3d.ts (over the
// 500-line file-size limit) to keep that file from growing further.
export const MARCH_TARGET_CAP = 3;
export const MARCH_TARGET_COLOR = "#ef4444";

/** Creates the flag pool, hides it, disables frustum culling (toroidal wrap can put it off the naive view frustum), and returns the groups to add to the scene. */
export const createMarchTargetMarkerPool = (): { flags: WaypointFlag[]; groups: Group[] } => {
  const flags = Array.from({ length: MARCH_TARGET_CAP }, () => createWaypointFlag());
  for (const flag of flags) {
    flag.group.visible = false;
    flag.group.frustumCulled = false;
    for (const child of flag.group.children) child.frustumCulled = false;
  }
  return { flags, groups: flags.map((flag) => flag.group) };
};

export const disposeMarchTargetMarkerPool = (flags: readonly WaypointFlag[]): void => {
  for (const flag of flags) flag.dispose();
};

export type MarchTargetMarkerDeps = {
  state: Pick<ClientState, "tiles" | "me">;
  keyFor: (x: number, y: number) => string;
  sceneOrigin: { camX: number; camY: number };
  worldWidth: number;
  worldHeight: number;
  toroidDelta: (origin: number, value: number, size: number) => number;
  surfaceYAt: (x: number, y: number) => number;
  tileCenterOffset: number;
  markerRise: number;
  nowMs: number;
};

export const syncMarchTargetMarkers = (flags: readonly WaypointFlag[], deps: MarchTargetMarkerDeps): void => {
  for (const flag of flags) flag.group.visible = false;
  const targets = collectMarchTargets(deps.state, deps.keyFor);
  let i = 0;
  for (const [, origin] of targets) {
    const flag = flags[i];
    if (!flag) break;
    const tile = deps.state.tiles.get(deps.keyFor(origin.originX, origin.originY));
    const targetX = tile?.muster?.targetX;
    const targetY = tile?.muster?.targetY;
    if (targetX === undefined || targetY === undefined) continue;
    flag.setTint(MARCH_TARGET_COLOR, MARCH_TARGET_COLOR);
    flag.setHalted(false);
    flag.setOpacityScale(1);
    flag.setQueueNumber(undefined);
    const dx = deps.toroidDelta(deps.sceneOrigin.camX, targetX, deps.worldWidth);
    const dy = deps.toroidDelta(deps.sceneOrigin.camY, targetY, deps.worldHeight);
    const surfaceY = deps.surfaceYAt(targetX, targetY);
    flag.group.position.set(dx + deps.tileCenterOffset, surfaceY + deps.markerRise, dy + deps.tileCenterOffset);
    flag.tick(deps.nowMs);
    flag.group.visible = true;
    i += 1;
  }
};
