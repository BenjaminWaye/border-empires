// How an AI at war reads the next couple of hours, not just the tile tally.
//
// Manpower is paid out in one chunk per 4h window, at a different moment for
// every player (shared manpower-refill.ts), so "losing" means different things
// depending on the clock. An AI that has just spent its army but reloads in 20
// minutes, stronger than its rival will be by then, should sit tight and take
// its land back; paying for peace would waste the reload. An AI that is losing
// tiles fast, can't match the rival now, and won't be able to by the time it
// reloads should buy peace early, before the losses pile up.
//
// Both refill schedules are pure functions of the player id, so the AI knows
// when its rival reloads too. The war's pace comes from the hour-scale fading
// tile counts in ai-diplomacy-memory.ts.
import { WAR_PACE_HALF_LIFE_MS } from "../ai-diplomacy-memory/ai-diplomacy-memory.js";
import { RETALIATION_READY_RATIO } from "./ai-retaliation-readiness.js";
import { fightingStrengthOf, type RivalStrength, type WarExhaustionInput } from "./ai-war-exhaustion.js";

/** How far ahead the AI plans: a reload further off than this can't save land being taken now. */
export const WAR_OUTLOOK_HORIZON_MS = 2 * 60 * 60_000;
/** Net tiles lost over the last hour and a half or so (WAR_PACE_HALF_LIFE_MS) that read as losing ground fast. */
export const RAPID_LOSS_TILES = 3;
/**
 * An AI that paid this player for peace doesn't sue them again for this long:
 * otherwise "truce ends, take 3 tiles, get paid" repeats every 12h and drains
 * it. Inside the window the usual losing-war rules apply (no payment to a fresh attacker).
 */
export const SUING_REPEAT_COOLDOWN_MS = 24 * 60 * 60_000;
/** After its reload the AI must be at least this strong relative to the rival to expect to retake its land. */
export const COUNTER_ATTACK_STRENGTH_RATIO = 1;

export type AiWarOutlook =
  /** No reason to change course: not at war, not losing ground lately, or holding its own. */
  | { kind: "STEADY" }
  /** Losing ground and spent for now, but its reload lands soon and out-muscles the rival: it fights on rather than pay. */
  | { kind: "HOLD_FOR_REFILL"; refillInMs: number }
  /** Losing ground fast with no way to stop it before the horizon: it pays for peace now. */
  | { kind: "SUE_FOR_PEACE"; projectedLoss: number };

const STEADY: AiWarOutlook = { kind: "STEADY" };

/** Fighting strength once a payout landing within `byMs` is added, capped at the cap when known. */
const strengthBy = (strength: number, refill: { nextRefillInMs?: number; nextRefillManpower?: number }, byMs: number, cap: number | undefined): number => {
  const lands = refill.nextRefillInMs !== undefined && refill.nextRefillInMs <= byMs;
  const total = strength + (lands ? refill.nextRefillManpower ?? 0 : 0);
  return cap !== undefined && cap > 0 ? Math.min(Math.max(cap, strength), total) : total;
};

export const aiWarOutlook = (input: {
  atWar: boolean;
  ai: WarExhaustionInput;
  rival: RivalStrength;
  /** Hour-scale fading tile counts (DiplomacyMemoryView.recentTilesTaken*). */
  recentTilesLost: number;
  recentTilesTaken: number;
  /** When this AI last paid this rival for peace, if ever. */
  paidForPeaceAt?: number;
  now?: number;
}): AiWarOutlook => {
  const { ai, rival } = input;
  if (!input.atWar || ai.manpowerCap <= 0) return STEADY;
  const netLoss = input.recentTilesLost - input.recentTilesTaken;
  // Fading counts never quite reach zero: under a tile of net loss is no recent loss at all.
  if (netLoss < 1) return STEADY;

  // An AI that can stop the bleeding with what it has now isn't waiting on anything:
  // the tally decides whether it is losing, as before.
  const strength = fightingStrengthOf(ai);
  const holdsNow = rival.fightingStrength !== undefined ? strength >= rival.fightingStrength : strength / ai.manpowerCap >= RETALIATION_READY_RATIO;
  if (holdsNow) return STEADY;

  // Spent for now: a reload that lands soon and out-muscles the rival is worth waiting for.
  const reloadsSoon = ai.nextRefillInMs !== undefined && ai.nextRefillInMs <= WAR_OUTLOOK_HORIZON_MS;
  if (reloadsSoon) {
    const reloadAt = ai.nextRefillInMs!;
    const aiThen = strengthBy(strength, ai, reloadAt, ai.manpowerCap);
    // The rival's own reload counts if it lands first.
    const rivalThen = rival.fightingStrength === undefined ? undefined : strengthBy(rival.fightingStrength, rival, reloadAt, rival.manpowerCap);
    const ready = aiThen / ai.manpowerCap >= RETALIATION_READY_RATIO;
    if (ready && (rivalThen === undefined || aiThen >= rivalThen * COUNTER_ATTACK_STRENGTH_RATIO)) {
      return { kind: "HOLD_FOR_REFILL", refillInMs: reloadAt };
    }
  }

  if (netLoss < RAPID_LOSS_TILES) return STEADY;
  const paidRecently = input.paidForPeaceAt !== undefined && input.now !== undefined && input.now - input.paidForPeaceAt < SUING_REPEAT_COOLDOWN_MS;
  if (paidRecently) return STEADY;
  // A fading count holds about (half-life / ln 2) of fighting, so this is its rate.
  const tilesPerHour = (netLoss * Math.LN2) / (WAR_PACE_HALF_LIFE_MS / 3_600_000);
  return { kind: "SUE_FOR_PEACE", projectedLoss: Math.round(tilesPerHour * (WAR_OUTLOOK_HORIZON_MS / 3_600_000)) };
};
