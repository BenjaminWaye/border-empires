import type { ClientChangelogEntry } from "./client-changelog-data.js";

// createdAt is set where these are listed in client-changelog-data.ts, which is
// the only file the changelog gate (scripts/check-client-changelog-update.mjs) reads.
export const CAMERA_PER_ACCOUNT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.11",
  title: "The map opens on your own empire after switching accounts",
  why: "Logging out and into another account on the same browser opened the map where the previous account was last looking, often in unexplored darkness.",
  changes: [
    "Each account on a browser remembers its own last map position",
    "An account with no saved position opens on its home territory"
  ]
};
