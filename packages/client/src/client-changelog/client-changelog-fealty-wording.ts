import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FEALTY_WORDING_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Unequal alliances read as fealty",
  why: "Allying an empire many times your size read like any other alliance, though the bloc's land wins Diplomatic Dominance for its largest member.",
  changes: [
    "With an empire at least twice your garrisoned tiles, the alliance button reads Swear fealty; at half your size or less, Demand fealty",
    "Offers, the Diplomacy list, the Activity feed and the Chronicle say who swore fealty to whom: Your liege, Sworn to you",
    "Near-equal empires still propose an alliance"
  ]
};
