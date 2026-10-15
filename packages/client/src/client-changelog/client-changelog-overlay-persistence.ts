import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const OVERLAY_PERSISTENCE_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792074842670, // Date.now() frozen for the changelog gate.
    introducedIn: "2026.10.15.2",
    title: "Muster flags survive server updates",
    why: "Restarting the server (every update) quietly dropped active muster flags, and the end-of-season map left out watchtowers and waystations.",
    changes: [
      "Active muster flags (Hold, Advance, March) are kept when the server restarts instead of disappearing",
      "Watchtowers and waystations now show on the full map after a season ends and in spectator view"
    ]
  }
];
