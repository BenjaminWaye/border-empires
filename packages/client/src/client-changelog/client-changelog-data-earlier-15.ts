import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_15: ClientChangelogEntry[] = [
  // Pruned: five entries here (3D sea-animation restart fix, 3D border line
  // render-pool fix -- both 2026.09.02.3 -- the login-hang fix, 2026.09.02.4,
  // the offline-opponent weapons-factory fix, 2026.09.02.5, and the frontier
  // tint/fog-of-war transparency fix, 2026.09.02.6) aged out of the "keeps
  // only the latest week of entries" window (client-changelog.test.ts) as
  // real time advanced.
];
