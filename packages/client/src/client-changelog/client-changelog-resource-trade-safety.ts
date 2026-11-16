import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const RESOURCE_TRADE_SAFETY_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Accepting a resource trade can't end it by accident",
  why: "Double-tapping Accept on a resource offer hit the End supply button that appeared in its place, so the Coin was paid and the supply ended at once. Upfront Coin in a supply deal could also be read as Coin per hour.",
  changes: [
    "End supply now needs a second, separate tap to confirm.",
    "Upfront Coin in a deal with resource supply or hourly Coin now reads as a lump sum, for example \"you pay 4 coin lump sum\"."
  ]
};
