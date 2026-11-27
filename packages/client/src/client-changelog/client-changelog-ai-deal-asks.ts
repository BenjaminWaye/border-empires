import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AI_DEAL_ASKS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Ask AI Houses for more than Coin",
  why: "The deal screen made it look like Coin was all an AI House could give.",
  changes: [
    "In a truce, ask an AI House for Coin per day, up to its spare income",
    "In a truce, ask for a town back that a House took from you in the last day",
    "Resources a House has none spare of show greyed out instead of disappearing"
  ]
};
