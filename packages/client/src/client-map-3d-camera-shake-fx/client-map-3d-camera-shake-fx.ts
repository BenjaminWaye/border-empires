import type { PerspectiveCamera } from "three";

// Global "the ground just moved" feedback for a World Engine strike — every
// connected client plays this once, live, when the broadcast arrives (see
// client-network.ts's WORLD_ENGINE_STRIKE_ANNOUNCEMENT handling). Flat
// magnitude/duration for every strike; not scaled by population lost or by
// camera distance from the target, since the broadcast itself is unconditional
// for every player regardless of where they're looking.
const DURATION_MS = 500;
const AMPLITUDE = 0.4;

export type CameraShakeFx = {
  readonly trigger: (nowMs: number) => void;
  readonly update: (nowMs: number) => void;
};

export const createCameraShakeFx = (camera: PerspectiveCamera): CameraShakeFx => {
  let startedAt: number | undefined;
  // Offset applied to camera.position on the previous tick, so each tick can
  // subtract it back out before computing the next one — this keeps the
  // jitter additive around whatever camera.position actually is (including a
  // zoom change mid-shake via applyPerspectiveCamera) instead of drifting.
  let appliedX = 0;
  let appliedY = 0;
  let appliedZ = 0;

  const trigger = (nowMs: number): void => {
    startedAt = nowMs;
  };

  const update = (nowMs: number): void => {
    camera.position.x -= appliedX;
    camera.position.y -= appliedY;
    camera.position.z -= appliedZ;
    appliedX = 0;
    appliedY = 0;
    appliedZ = 0;

    if (startedAt === undefined) return;
    const age = nowMs - startedAt;
    if (age >= DURATION_MS) {
      startedAt = undefined;
      return;
    }

    const decay = 1 - age / DURATION_MS;
    appliedX = Math.sin(age * 0.09) * AMPLITUDE * decay;
    appliedZ = Math.cos(age * 0.07) * AMPLITUDE * decay;
    appliedY = Math.sin(age * 0.13) * AMPLITUDE * 0.3 * decay;
    camera.position.x += appliedX;
    camera.position.y += appliedY;
    camera.position.z += appliedZ;
    camera.updateMatrixWorld(true);
  };

  return { trigger, update };
};
