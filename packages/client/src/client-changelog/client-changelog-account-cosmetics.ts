import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const ACCOUNT_COSMETICS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "Groundwork for cosmetics",
  why: "Houses will be able to show their own muster flag design and soldier livery. Cosmetics change looks only, never how the game plays.",
  changes: [
    "An account that owns a cosmetic can choose it under Settings, Account",
    "Other Houses see the chosen flag design and soldier livery on the map",
    "Nothing is on sale yet, and nothing changes for an account that owns none"
  ]
};
