import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const RELIABLE_DIPLOMACY_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792418992256, // Date.now() captured for this entry.
    introducedIn: "2026.10.19.2",
    title: "Reliable diplomacy updates",
    why: "Repeated truce, alliance and diplomacy payment updates could collide in command storage.",
    changes: ["Internal diplomacy updates now save independently while player commands retain duplicate protection",
      "Active truces now survive a server restart alongside alliances",
      "Startup reconciles active truces and offline expirations; crash recovery replays later relationship changes"]
  }
];
