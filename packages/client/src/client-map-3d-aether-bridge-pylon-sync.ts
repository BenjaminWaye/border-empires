import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { toroidDelta } from "./client-map-3d-pointer-pick.js";
import type { ActiveAetherBridgeView } from "./client-types.js";
import type { AetherBridgePylonOverlay } from "./client-map-3d-aether-bridge-pylon-overlay.js";

// Wires `AetherBridgePylonOverlay` up to live game state: one pooled pylon at
// each end of every active Aether bridge, rotated so its twin spires straddle
// the lane. Extracted from client-map-3d.ts (sibling of
// client-map-3d-aether-wall-pylon-sync.ts).

export type AetherBridgePylonSyncDeps = {
  readonly tileCenterOffset: number;
  readonly markerRise: number;
  /** Surface height a bridge-end marker sits on. */
  readonly tileSurfaceY: (wx: number, wy: number) => number;
  /** Live scene anchor; read on every call, so it may be mutated in place. */
  readonly sceneOrigin: { camX: number; camY: number };
};

export const createAetherBridgePylonSync = (
  overlay: AetherBridgePylonOverlay,
  deps: AetherBridgePylonSyncDeps
) => (activeAetherBridges: readonly ActiveAetherBridgeView[], nowMs: number): void => {
  overlay.beginFrame();
  const now = Date.now();
  for (const bridge of activeAetherBridges) {
    if (bridge.endsAt <= now) continue;
    const fromX = toroidDelta(deps.sceneOrigin.camX, bridge.from.x, WORLD_WIDTH) + deps.tileCenterOffset;
    const fromZ = toroidDelta(deps.sceneOrigin.camY, bridge.from.y, WORLD_HEIGHT) + deps.tileCenterOffset;
    const toX = toroidDelta(deps.sceneOrigin.camX, bridge.to.x, WORLD_WIDTH) + deps.tileCenterOffset;
    const toZ = toroidDelta(deps.sceneOrigin.camY, bridge.to.y, WORLD_HEIGHT) + deps.tileCenterOffset;
    // Rotate each pylon so its twin spires straddle the lane (the energy
    // gate opens toward the far coast).
    const faceAngle = Math.atan2(toX - fromX, toZ - fromZ);
    overlay.place(fromX, deps.tileSurfaceY(bridge.from.x, bridge.from.y) + deps.markerRise, fromZ, faceAngle, nowMs);
    overlay.place(toX, deps.tileSurfaceY(bridge.to.x, bridge.to.y) + deps.markerRise, toZ, faceAngle + Math.PI, nowMs);
  }
  overlay.endFrame();
};
