import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const GUIDE_MANIFEST_PRICE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.13",
  title: "The guide waits while you save up for a Manifest",
  why: "After a Waystation's free Manifest, the next one costs 40 coin, but the guide asked new players to commission it with about 10 coin.",
  changes: ["If you can't afford your next Manifest yet, the guide shows its price and moves on, then comes back once you have the coin."]
};
