import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const RECONNECT_RAZED_STRUCTURES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Razed structures disappear after a reconnect",
  why: "A playtester captured Relay Beacons while the game was in a background window; after reconnecting the beacons were still drawn, though they had been razed and gave no reach.",
  changes: [
    "After a reconnect, structures and towns that were razed, captured away or removed while you were disconnected no longer stay drawn on the map."
  ]
};
