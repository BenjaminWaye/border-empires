import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const ACCOUNT_COSMETICS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "Groundwork for the High-noble standard",
  why: "A House will be able to fly a gilded muster flag that every rival sees. It changes looks only, never how the game plays.",
  changes: [
    "An account that owns the High-noble standard can choose it under Settings, Account",
    "Other Houses see it on that House's muster flags",
    "It is not on sale yet, and nothing changes for an account that does not own it"
  ]
};
