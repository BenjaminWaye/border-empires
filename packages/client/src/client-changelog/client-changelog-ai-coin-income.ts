import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AI_COIN_INCOME_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "AI deals no longer offer Coin per hour",
  why: "Offering an AI House Coin per hour for a truce said to add a resource slot, but an AI refuses Coin income even with a slot, so following the hint led nowhere.",
  changes: [
    "The Coin per hour rows are hidden when you negotiate with an AI House; offer Coin upfront instead.",
    "A deal that already holds Coin per hour for an AI now says AI Houses only take Coin upfront, rather than asking for a resource slot."
  ]
};
