// Deterministic choreography shared by 3D infantry and 2D squad markers.
// The category is supplied by the server AFTER resolution, never a new roll.
import { battleClashMs } from "@border-empires/shared";
import { deathKitFor, MARINES_PER_SIDE, WINNER_DEATHS, LOSER_DEATHS } from "./popup-marine-timeline.js";
import type { BattleOverlayRenderEntry } from "../client-dock-landing/client-battle-render-types.js";

type DramaBattle = Pick<BattleOverlayRenderEntry, "hashSeed" | "presentation" | "attackerWon" | "fromSkirmish" | "clashAt" | "defenderGarrison" | "skirmishCasualties" | "fallenBeforeResolution">;
export const rankedMarines = (seed: number, side: 0 | 1): number[] =>
  Array.from({ length: MARINES_PER_SIDE }, (_, i) => i).sort((a, b) => deathKitFor(seed, side, a).roll - deathKitFor(seed, side, b).roll);

export const dramaHero = (b: DramaBattle, side: 0 | 1): number => {
  if (side === 1 && b.defenderGarrison?.survivorIndex !== undefined) return b.defenderGarrison.survivorIndex;
  const absent = side === 1 && b.defenderGarrison ? rankedMarines(b.hashSeed, 0)[0] : undefined;
  const candidates = rankedMarines(b.hashSeed, side).filter((i) => i !== absent);
  return candidates[candidates.length - 1]!;
};

/** Death time relative to clashAt; Infinity means this soldier survives. */
export const dramaDeathMs = (b: DramaBattle, side: 0 | 1, i: number): number => {
  const winning = (side === 0) === b.attackerWon;
  if (side === 1 && winning && b.defenderGarrison?.survivorIndex === i) return Infinity;
  const ranked = rankedMarines(b.hashSeed, side);
  const rank = ranked.indexOf(i);
  const duration = battleClashMs(b.presentation);
  if (b.presentation === "comeback") {
    if (winning && i === dramaHero(b, side)) return Infinity;
    return duration * (winning ? 0.04 + rank * 0.045 : 0.4 + rank * 0.065);
  }
  if (b.presentation === "last-stand" && side === 0) {
    return duration * (i === dramaHero(b, side) ? 0.8 : 0.04 + rank * 0.055);
  }
  if (rank >= (winning ? WINNER_DEATHS : LOSER_DEATHS)) return Infinity;
  const at = deathKitFor(b.hashSeed, side, i).at;
  // Decisive: losing soldiers break early; contested: hold until a late break.
  return duration * (b.presentation === "decisive" ? at * 0.35 : b.presentation === "contested" ? 0.55 + at * 0.25 : at);
};

export type DramaShot = { atMs: number; targetIndex: number };
export const DRAMA_BOLT_MS = 120;
export const DRAMA_SPARK_MS = 100;
/** The comeback survivor visibly fires each round that drops an opponent. */
export const comebackShots = (b: DramaBattle, side: 0 | 1, i: number): DramaShot[] | undefined => {
  if (b.presentation !== "comeback" || (side === 0) !== b.attackerWon || i !== dramaHero(b, side)) return undefined;
  const targetSide = side === 0 ? 1 : 0;
  const survivor = targetSide === 1 ? b.defenderGarrison?.survivorIndex : undefined;
  if (survivor !== undefined) return [{ atMs: dramaDeathMs(b, targetSide, survivor) - DRAMA_BOLT_MS, targetIndex: survivor }];
  const absent = targetSide === 1 && b.defenderGarrison ? rankedMarines(b.hashSeed, 0)[0] : undefined;
  const fallen = b.fallenBeforeResolution?.[targetSide === 0 ? "attacker" : "defender"];
  const targets = rankedMarines(b.hashSeed, targetSide).filter((i, rank) => i !== absent && (fallen !== undefined ? (fallen & (1 << i)) === 0 : !(b.skirmishCasualties ?? b.fromSkirmish) || rank >= WINNER_DEATHS))
    .map((targetIndex) => ({ atMs: dramaDeathMs(b, targetSide, targetIndex) - DRAMA_BOLT_MS, targetIndex }));
  if (fallen !== undefined && targets.length === 1) {
    const targetIndex = targets[0]!.targetIndex;
    return [0.12, 0.36, 0.6].map((t) => ({ atMs: battleClashMs(b.presentation) * t, targetIndex })).concat(targets);
  }
  return targets;
};

export const dramaFlash = (b: DramaBattle, side: 0 | 1, i: number, elapsed: number): number | undefined => {
  const shots = comebackShots(b, side, i);
  return shots?.reduce((best, shot) => Math.max(best, Math.max(0, 1 - Math.abs(elapsed - shot.atMs) / 35)), 0);
};
