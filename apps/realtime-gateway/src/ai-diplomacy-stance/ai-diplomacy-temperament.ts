// A seasonal AI's fixed diplomatic personality (the role Civ VI's agendas and
// favoured diplomatic actions play): the same empire haggles the same way every
// season, so players can learn who to deal with. Diplomacy only -- military
// behaviour stays with the simulation's planner. All values are first guesses.
import { isSeasonalAiPlayerId } from "@border-empires/shared";

import type { AiDiplomacyStanceKind } from "./ai-diplomacy-stance.js";

export type AiTemperamentKind = "MEASURED" | "MERCHANT" | "WARLIKE" | "PEACEABLE" | "VENGEFUL";

export type AiTemperament = {
  kind: AiTemperamentKind;
  label: string;
  /** Shown beside the label on the trade screen. */
  traits: string;
  /** Multiplier on a truce's base hours (reparations are separate). */
  trucePrice: number;
  /** Multiplier on what taken tiles cost: their opinion penalty and reparations. */
  tileGrudge: number;
  /** Multiplier on the goodwill a coin buys. */
  giftValue: number;
  /** Flat attitude points, shown as a modifier when non-zero. */
  opinionBaseline: number;
  /** Multiplier on what the AI pays to end a war it is losing. */
  peacePayment: number;
  /** Whether merely being outmatched sends it asking for peace; desperate AIs always ask. */
  asksPeaceWhenOutmatched: boolean;
};

const neutral = { trucePrice: 1, tileGrudge: 1, giftValue: 1, opinionBaseline: 0, peacePayment: 1, asksPeaceWhenOutmatched: true };

export const AI_TEMPERAMENTS: Record<AiTemperamentKind, AiTemperament> = {
  MEASURED: { ...neutral, kind: "MEASURED", label: "Measured", traits: "No strong leanings" },
  MERCHANT: { ...neutral, kind: "MERCHANT", label: "Merchant", traits: "Cheaper truces, gifts go further", trucePrice: 0.75, giftValue: 1.5 },
  WARLIKE: { ...neutral, kind: "WARLIKE", label: "Warlike", traits: "Dearer truces, slow to seek peace", trucePrice: 1.25, opinionBaseline: -5, peacePayment: 0.5, asksPeaceWhenOutmatched: false },
  PEACEABLE: { ...neutral, kind: "PEACEABLE", label: "Peaceable", traits: "Warmer start, forgives lost land", tileGrudge: 0.75, opinionBaseline: 5 },
  VENGEFUL: { ...neutral, kind: "VENGEFUL", label: "Vengeful", traits: "Resents lost land, gifts count less", tileGrudge: 1.5, giftValue: 0.75 }
};

const ROTATION: readonly AiTemperamentKind[] = ["MEASURED", "MERCHANT", "WARLIKE", "PEACEABLE", "VENGEFUL"];

/** By "ai-<n>" id, so any five consecutive AIs hold one of each. Other ids are Measured. */
export const aiTemperamentForId = (playerId: string): AiTemperament => {
  if (!isSeasonalAiPlayerId(playerId)) return AI_TEMPERAMENTS.MEASURED;
  const kind = ROTATION[(Number(playerId.slice("ai-".length)) - 1) % ROTATION.length];
  return AI_TEMPERAMENTS[kind ?? "MEASURED"];
};

/** Whether this AI goes asking for peace unprompted, given how it reads its own strength. */
export const aiAsksForPeace = (stanceKind: AiDiplomacyStanceKind, temperament: AiTemperament): boolean =>
  stanceKind === "SEEKING_PEACE" || (stanceKind === "OUTMATCHED" && temperament.asksPeaceWhenOutmatched);
