import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const RECONNECT_RAZED_STRUCTURES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Razed structures disappear after a reconnect",
  why: "A playtester captured Relay Beacons while the game was in a background window; after reconnecting the beacons were still drawn, though they had been razed and gave no reach.",
  changes: [
    "After a reconnect, every tile the server sends back now shows exactly what stands on it, so structures razed or removed while you were disconnected are no longer left on the map."
  ]
};
