import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const HETZNER_CLIENT_HOSTING_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792510291974, // Date.now() captured for this entry.
    introducedIn: "2026.10.20.1",
    title: "Play independently of Vercel",
    why: "A shared hosting limit could prevent players from opening the game even while the game servers were healthy.",
    changes: ["Production and staging can serve the game directly from their existing game servers"]
  }
];
