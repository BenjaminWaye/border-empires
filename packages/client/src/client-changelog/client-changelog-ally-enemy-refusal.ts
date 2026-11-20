import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const ALLY_ENEMY_REFUSAL_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.20",
  title: "No alliances with both sides of a war",
  why: "Two AI empires at war with each other would both ally with the same player for a few coin, giving them safety and vision on both sides of the war.",
  changes: [
    "An AI won't ally with you while it is at war with one of your allies, whatever it thinks of you. The deal screen says which ally is the problem",
    "Once their war goes quiet, the AI will deal again. Truce prices are unchanged"
  ]
};
