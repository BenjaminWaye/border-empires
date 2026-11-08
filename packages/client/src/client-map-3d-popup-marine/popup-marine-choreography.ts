// Four complete, outcome-neutral movement patterns. Selected before resolution
// from the tile seed, so the opening never exposes hidden odds or the winner.
// Resolution still supplies the real casualties and winning side.
import { APPROACH_MS, clamp01, marineKitFor, type MarinePose, type MarineKit } from "./popup-marine-timeline.js";

export type BattleChoreography = "assault" | "crossfire" | "holdout" | "counterpush";
const PATTERNS: readonly BattleChoreography[] = ["assault", "crossfire", "holdout", "counterpush"];
export const battleChoreographyFor = (seed: number): BattleChoreography => PATTERNS[(seed >>> 0) % PATTERNS.length]!;

export interface ChoreographyFrame {
  choreography?: BattleChoreography;
  choreographyStartAt?: number;
  startAt: number;
  hashSeed: number;
}
/** Fire-team rhythm belongs to the same full animation as its movement. */
export const choreographyMarineKitFor = (b: Pick<ChoreographyFrame, "choreography" | "hashSeed">, side: 0 | 1, i: number): MarineKit => {
  const kit = marineKitFor(b.hashSeed, side, i);
  if (!b.choreography) return kit;
  let fireAt: MarineKit["fireAt"] = kit.fireAt;
  switch (b.choreography) {
    case "assault": fireAt = side === 0 ? [0.06, 0.2, 0.34] : [0.22, 0.54, 0.82]; break;
    case "crossfire": fireAt = i % 2 === 0 ? [0.06, 0.18, 0.3] : [0.53, 0.65, 0.77]; break;
    case "holdout": fireAt = side === 0 ? [0.2, 0.55, 0.87] : [0.05, 0.25, 0.45]; break;
    case "counterpush": fireAt = side === 0 ? [0.45, 0.61, 0.77] : [0.08, 0.3, 0.58]; break;
  }
  // Silhouettes must distinguish these fights even between muzzle flashes.
  const kneels = b.choreography === "assault" ? side === 1
    : b.choreography === "crossfire" ? i % 2 === 0 : kit.kneels;
  return { ...kit, fireAt, kneels };
};

export interface ChoreographyAxes {
  entryLocalX: number; entryLocalZ: number;
  perpX: number; perpZ: number;
  fwdX: number; fwdZ: number;
}
export interface ExchangeTiming { startAt: number; endAt?: number; deathAt?: number }

// Every formation makes one straight approach. No oscillation or reshuffling.
export const choreographyApproachMs = (b: Pick<ChoreographyFrame, "choreography">): number => b.choreography ? 1500 : APPROACH_MS;

export const choreographExchange = (
  pose: MarinePose, b: ChoreographyFrame, side: 0 | 1, i: number, nowMs: number,
  axes: ChoreographyAxes, timing: ExchangeTiming
): MarinePose => {
  if (!b.choreography || pose.scale <= 0) return pose;
  const motionAt = pose.fallT > 0 && timing.deathAt !== undefined ? timing.deathAt : nowMs;
  // A single slow backward step while keeping the rifle pointed at the enemy.
  // Once planted, the soldier fires from that exact position until the rout.
  const stepT = clamp01((motionAt - timing.startAt - 500) / 1000);
  const settle = timing.endAt === undefined ? 1 : clamp01((timing.endAt - motionAt) / 600);
  const backward = b.choreography === "counterpush" && side === 0 ? 0.045 * stepT * settle : 0;
  const backstepping = backward > 0 && stepT < 1 && pose.fallT === 0 && pose.stance !== "run";
  const stance = pose.stance === "run" || pose.fallT > 0 ? pose.stance : backstepping ? "walkBack"
    : b.choreography === "holdout" && side === 0 ? i === 3 ? "stand" : "kneel" : pose.stance;
  return { ...pose, localX: pose.localX - axes.fwdX * backward, localZ: pose.localZ - axes.fwdZ * backward, stance };
};
