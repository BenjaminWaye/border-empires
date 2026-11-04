import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AI_BEACON_SPACING_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793225832045, // Date.now() captured once for this entry.
    introducedIn: "2026.10.28.3",
    title: "AI relay beacons spread out",
    why: "AI empires packed relay beacons a couple of tiles apart, ringing a small island with dozens where two or three would do.",
    changes: ["AI empires now keep their relay beacons at least a reach radius apart."]
  },
  {
    createdAt: 1793742715475, // Date.now() captured once for this entry.
    introducedIn: "2026.11.03.1",
    title: "AI relay beacons reach for nearby resources",
    why: "The beacon spacing rule also stopped AI empires from placing a relay close to another one just to bring a few resource tiles, like a strip of fish along the beach, into reach.",
    changes: [
      "AI relays that bring new resources, towns or docks into reach no longer have to keep a reach radius from the AI's other active relays; relays built only to explore still do.",
      "Relays being demolished, or switched off where the AI can't turn them back on, no longer block a replacement nearby."
    ]
  }
];
