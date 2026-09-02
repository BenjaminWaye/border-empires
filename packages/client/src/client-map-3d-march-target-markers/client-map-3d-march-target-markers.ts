import { createWaypointFlag, type WaypointFlag } from "../client-map-3d-waypoint-flag/client-map-3d-waypoint-flag.js";
import { listMarchTargets } from "../client-muster-march-targeting.js";
import type { Group } from "three";
import type { ClientState } from "../client-state/client-state.js";

// Small radial offset applied per stacked flag sharing a destination tile,
// spaced evenly around a fixed number of slots so they don't render exactly
// on top of one another. Independent of MARCH_TARGET_CAP (the total pool
// size across the whole map, not how many can stack on one tile).
const STACK_OFFSET = 0.16;
const STACK_VISUAL_SLOTS = 6;
const stackOffsetFor = (stackIndex: number): { x: number; z: number } =>
  stackIndex === 0
    ? { x: 0, z: 0 }
    : {
        x: Math.cos((stackIndex * 2 * Math.PI) / STACK_VISUAL_SLOTS) * STACK_OFFSET,
        z: Math.sin((stackIndex * 2 * Math.PI) / STACK_VISUAL_SLOTS) * STACK_OFFSET
      };

// March-To target markers: reuse the waypoint flag model, tinted war red
// instead of empire color, planted on the destination tile of a
// "March To…" muster order. Extracted from client-map-3d.ts (over the
// 500-line file-size limit) to keep that file from growing further.
//
// Capped generously above the server's base muster-flag limit
// (MUSTER_MAX_TILES = 2, packages/shared/src/config.ts) to leave headroom
// for tech/wonder bonuses (musterMaxTilesAdd, wonderMusterExtraFlag -- see
// runtime-structure-lifecycle-command-handlers.ts) that can raise a single
// player's real cap well past the base -- a heavily-teched player marching
// more flags than this pool holds simply won't get a marker for the
// overflow ones, rather than this cap ever being load-bearing for
// correctness.
export const MARCH_TARGET_CAP = 12;
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
