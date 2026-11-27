// "A friend of my enemy": an AI won't ally with an empire that is allied to
// someone the AI is at war with (playtest 2026-11-20: both sides of an Open War
// sold the same House an alliance for ~10 coin, minutes apart, buying it
// permanent safety and vision on both sides of the war).
//
// "At war" is the same test the AI applies to the requester itself
// (atWarFromMemory: a fight either way within AT_WAR_WINDOW_MS), read from the
// AI's diplomacy memory of that ally. The memory records every fight an AI
// takes part in, against AIs and humans alike, so AI-vs-AI wars count too.
import type { DiplomacyMemoryView } from "../ai-diplomacy-memory/ai-diplomacy-memory.js";
import type { AllyLookup } from "./ai-alliance-bloc.js";
import { atWarFromMemory } from "./ai-diplomacy-opinion.js";

/** Names of the requester's allies the AI is at war with, in alliance order. */
export const requesterAlliesAtWarWithAi = (input: {
  requesterId: string;
  aiPlayerId: string;
  alliesOf: AllyLookup;
  /** The AI's memory of another player (AiDiplomacyMemory.view). */
  warMemory: (aiPlayerId: string, otherId: string) => Pick<DiplomacyMemoryView, "lastCombatAt">;
  nameOf: (playerId: string) => string;
  now: number;
}): string[] =>
  input
    .alliesOf(input.requesterId)
    .filter((allyId) => allyId !== input.aiPlayerId && atWarFromMemory(input.warMemory(input.aiPlayerId, allyId), input.now))
    .map((allyId) => input.nameOf(allyId));

/** "Kara", "Kara and Rasmus", "Kara, Rasmus and Alden". */
export const joinNames = (names: readonly string[]): string =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
