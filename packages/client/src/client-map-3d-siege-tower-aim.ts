import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { toroidDelta } from "./client-map-3d-pointer-pick.js";
import type { SiegeTowerBattleTarget } from "./client-map-3d-siege-tower-overlay.js";

// Aim math for the 3D Siege/Dread Tower lens (client-map-3d-siege-tower-overlay.ts):
// where the lens points and how long its beam is, plus the per-frame easing
// that swings it there.

const BEAM_MAX_RANGE_TILES = 4.5;

export type SiegeTowerAim = { readonly yaw: number; readonly pitch: number; readonly beamLen: number };

/** Eases `current` toward `target` by `rate` per frame, snapping once close. */
export const approach = (current: number, target: number, rate: number): number => {
  const delta = target - current;
  return Math.abs(delta) < 0.0005 ? target : current + delta * rate;
};

/** Eases an angle toward `target` along the shortest way round. */
export const turnToward = (current: number, target: number, rate: number): number => {
  const shortest = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return approach(current, current + shortest, rate);
};

/**
 * Where a tower on world tile (towerX, towerY) aims. With a battle, the lens
 * faces it and the beam reaches down toward it (capped at
 * BEAM_MAX_RANGE_TILES). With none, the lens returns to its idle pose,
 * pointing straight down (matching the spawn pose so the cradle doesn't snap).
 * `beamLen` is the full length; the overlay scales it by each tower's own
 * fade so only towers that are actually firing show a beam.
 */
export const siegeTowerAim = (
  towerX: number,
  towerY: number,
  emitterY: number,
  currentYaw: number,
  battle: SiegeTowerBattleTarget | undefined
): SiegeTowerAim => {
  if (battle) {
    const dx = toroidDelta(towerX, battle.x, WORLD_WIDTH);
    const dz = toroidDelta(towerY, battle.y, WORLD_HEIGHT);
    const h0 = Math.hypot(dx, dz);
    if (h0 > 0.001) {
      const hClamp = Math.min(h0, BEAM_MAX_RANGE_TILES);
      return { yaw: Math.atan2(dx, dz), pitch: Math.atan2(emitterY, hClamp), beamLen: Math.hypot(hClamp, emitterY) };
    }
  }
  return { yaw: currentYaw, pitch: Math.PI / 2, beamLen: emitterY };
};
