import type { ClientChangelogEntry } from "./client-changelog-data.js";

/** Keep the six-day release-note window relative to the newest entry. */
export const recentClientChangelogEntries = (entries: ClientChangelogEntry[]): ClientChangelogEntry[] => {
  const latestCreatedAt = Math.max(...entries.map((entry) => entry.createdAt));
  const oldestAllowedAt = latestCreatedAt - 6 * 24 * 60 * 60 * 1000;
  return entries.filter((entry) => entry.createdAt >= oldestAllowedAt);
};
