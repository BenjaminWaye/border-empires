// Full-battle staging is independent of the still-unknown result. The last
// opponent is reserved for resolution, so no winner is revealed early.
import { COMBAT_LOCK_MS } from "@border-empires/shared";
import { choreographyApproachMs } from "./popup-marine-choreography.js";
import { dramaHero, rankedMarines, DRAMA_BOLT_MS } from "./popup-marine-drama.js";
import { CLASH_MS, DEATH_FALL_MS, deathKitFor, type BattleOverlaySkirmishEntry } from "./popup-marine-timeline.js";
import type { MarineCasualtyMasks } from "../client-dock-landing/client-battle-render-types.js";

export type SkirmishCasualtyFrame = Pick<BattleOverlaySkirmishEntry, "hashSeed" | "startAt" | "choreography" | "holdApproachUntilElapsed" | "defenderGarrison" | "unopposed">;

const isAbsent = (b: SkirmishCasualtyFrame, side: 0 | 1, i: number): boolean => {
  if (side !== 1 || !b.defenderGarrison) return false;
  const survivor = b.defenderGarrison.survivorIndex;
  return survivor !== undefined ? survivor !== i : rankedMarines(b.hashSeed, 0)[0] === i;
};
export const skirmishClashAt = (b: SkirmishCasualtyFrame): number =>
  b.startAt + Math.max(choreographyApproachMs(b), b.holdApproachUntilElapsed ?? 0);
export const skirmishMidpoint = (b: SkirmishCasualtyFrame): number =>
  skirmishClashAt(b) + COMBAT_LOCK_MS / 2 - choreographyApproachMs(b);

export const skirmishDeathAt = (b: SkirmishCasualtyFrame, side: 0 | 1, i: number, siegeVictimIndex?: number): number => {
  if (isAbsent(b, side, i) || b.unopposed || (side === 1 && b.defenderGarrison?.survivorIndex !== undefined)) return Infinity;
  if (!b.choreography) return i === rankedMarines(b.hashSeed, side)[0]
    ? skirmishClashAt(b) + (side === 1 && i === siegeVictimIndex ? 0 : deathKitFor(b.hashSeed, side, i).at * CLASH_MS) : Infinity;
  const ranked = rankedMarines(b.hashSeed, side).filter((j) => !isAbsent(b, side, j));
  const rank = ranked.indexOf(i);
  const clashAt = skirmishClashAt(b);
  if (side === 1 && i === siegeVictimIndex) return clashAt;
  // An assault suppresses the defending line early. A contested exchange
  // trades losses over the countdown. Both keep opponents for the real result.
  if (b.choreography === "assault") {
    if (side === 0) return rank === 0 ? clashAt + 2500 : Infinity;
    return rank < 4 ? clashAt + 600 + rank * 1100 : Infinity;
  }
  if (b.choreography === "crossfire") {
    const exchanges = [2100, 4800, 9600] as const;
    return rank < exchanges.length ? clashAt + exchanges[rank]! + side * 350 : Infinity;
  }
  if ((b.choreography === "holdout" || b.choreography === "counterpush") && side === 0) {
    if (rank === ranked.length - 1) return Infinity;
    const first = clashAt + 300;
    const last = skirmishMidpoint(b) - DEATH_FALL_MS;
    return first + rank * (last - first) / Math.max(1, ranked.length - 2);
  }
  if (b.choreography === "counterpush" && side === 1 && rank > 0 && rank < ranked.length - 1) {
    const first = skirmishMidpoint(b) + 600;
    const last = clashAt + COMBAT_LOCK_MS - choreographyApproachMs(b) - DEATH_FALL_MS - 300;
    return first + (rank - 1) * (last - first) / Math.max(1, ranked.length - 3);
  }
  return rank === 0 ? clashAt + deathKitFor(b.hashSeed, side, i).at * CLASH_MS : Infinity;
};

export const skirmishCasualtyMasksAt = (b: SkirmishCasualtyFrame, nowMs: number): MarineCasualtyMasks => {
  const maskFor = (side: 0 | 1): number => rankedMarines(b.hashSeed, side).reduce((mask, i) =>
    isAbsent(b, side, i) || nowMs >= skirmishDeathAt(b, side, i) ? mask | (1 << i) : mask, 0);
  return { attacker: maskFor(0), defender: maskFor(1) };
};
export const singleSurvivorFromMask = (mask: number): number | undefined => {
  for (let i = 0; i < 7; i++) if (mask === (127 ^ (1 << i))) return i;
  return undefined;
};

export type ScheduledSkirmishShot = { at: number; targetIndex: number };
export const scriptedSkirmishShots = (b: SkirmishCasualtyFrame, side: 0 | 1, i: number, nowMs: number): ScheduledSkirmishShot[] | undefined => {
  if (b.choreography !== "counterpush" || side !== 0 || nowMs < skirmishMidpoint(b)) return undefined;
  const hero = dramaHero({ ...b, attackerWon: true, clashAt: skirmishClashAt(b), fromSkirmish: true }, 0);
  if (i !== hero) return undefined;
  const shots = rankedMarines(b.hashSeed, 1).filter((j) => !isAbsent(b, 1, j)).slice(1, -1)
    .map((targetIndex) => ({ at: skirmishDeathAt(b, 1, targetIndex) - DRAMA_BOLT_MS, targetIndex }));
  if (!shots.length || nowMs > shots[shots.length - 1]!.at + DRAMA_BOLT_MS + 100) return undefined;
  return shots;
};
export const scriptedSkirmishFlash = (b: SkirmishCasualtyFrame, side: 0 | 1, i: number, nowMs: number): number | undefined =>
  scriptedSkirmishShots(b, side, i, nowMs)?.reduce((best, shot) => Math.max(best, Math.max(0, 1 - Math.abs(nowMs - shot.at) / 35)), 0);
export const soleSkirmishTarget = (b: SkirmishCasualtyFrame, side: 0 | 1, nowMs: number): number | undefined => {
  const targetSide = side === 0 ? 1 : 0;
  const alive = rankedMarines(b.hashSeed, targetSide).filter((j) => !isAbsent(b, targetSide, j) && nowMs < skirmishDeathAt(b, targetSide, j));
  return alive.length === 1 ? alive[0] : undefined;
};
