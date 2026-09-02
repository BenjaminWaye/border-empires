import { createWaypointFlag, type WaypointFlag } from "../client-map-3d-waypoint-flag/client-map-3d-waypoint-flag.js";
import { listMarchTargets } from "../client-muster-march-targeting.js";
import type { Group } from "three";
import type { ClientState } from "../client-state/client-state.js";

// Small radial offset applied per stacked flag sharing a destination tile
// (up to MUSTER_LIMIT origins can legally March-To the same tile), so they
// don't render exactly on top of one another.
const STACK_OFFSET = 0.16;
const stackOffsetFor = (stackIndex: number): { x: number; z: number } =>
  stackIndex === 0
    ? { x: 0, z: 0 }
    : { x: Math.cos((stackIndex * 2 * Math.PI) / 3) * STACK_OFFSET, z: Math.sin((stackIndex * 2 * Math.PI) / 3) * STACK_OFFSET };

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
  const orders = listMarchTargets(deps.state);
  const stackIndexByDest = new Map<string, number>();
  let i = 0;
  for (const order of orders) {
    const flag = flags[i];
    if (!flag) break;
    const destKey = deps.keyFor(order.targetX, order.targetY);
    const stackIndex = stackIndexByDest.get(destKey) ?? 0;
    stackIndexByDest.set(destKey, stackIndex + 1);
    flag.setTint(MARCH_TARGET_COLOR, MARCH_TARGET_COLOR);
    flag.setHalted(false);
    flag.setOpacityScale(1);
    flag.setQueueNumber(stackIndex > 0 ? stackIndex + 1 : undefined);
    const offset = stackOffsetFor(stackIndex);
    const dx = deps.toroidDelta(deps.sceneOrigin.camX, order.targetX, deps.worldWidth);
    const dy = deps.toroidDelta(deps.sceneOrigin.camY, order.targetY, deps.worldHeight);
    const surfaceY = deps.surfaceYAt(order.targetX, order.targetY);
    flag.group.position.set(dx + deps.tileCenterOffset + offset.x, surfaceY + deps.markerRise, dy + deps.tileCenterOffset + offset.z);
    flag.tick(deps.nowMs);
    flag.group.visible = true;
    i += 1;
  }
};
