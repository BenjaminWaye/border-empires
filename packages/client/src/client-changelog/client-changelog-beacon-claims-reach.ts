import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const BEACON_CLAIMS_REACH_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Relay Beacons claim all the neutral land they reach",
  why: "A new Relay Beacon only turned land that was newly in your reach into frontier. Neutral land that was already in your reach stayed neutral, and you had to expand onto it one tile at a time.",
  changes: [
    "Each new Relay Beacon now turns every neutral land tile in its reach into your frontier, including land that was already in your reach.",
    "Tiles another player owns, and land that a rival's reach still holds, are not taken."
  ]
};
