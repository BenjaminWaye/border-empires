import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWNS_LIST_COIN_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.14",
  title: "Towns list shows each town's real coin per day",
  why: "The Towns list could show 0.0 coin/day for every town while each town's own screen showed what it earns.",
  changes: [
    "The Towns list's Coin/day now matches the town screen."
  ]
};
