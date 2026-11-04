import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_GROWTH_PERSIST_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793742602699, // Date.now() captured once for this entry.
    introducedIn: "2026.11.03",
    title: "Town growth is kept through server updates",
    why: "Towns grew every minute, but each server update put them back to the population they had when the server last started, so towns barely grew over a season.",
    changes: ["Town population growth is now saved and survives server updates and restarts"]
  }
];
