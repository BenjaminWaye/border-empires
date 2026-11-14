import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { DIPLOMACY_SCREEN_PACTS_ENTRY } from "./client-changelog-diplomacy-screen-pacts.js";

// Split out of client-changelog-data.ts to keep it under the line cap.
export const CLIENT_CHANGELOG_ENTRIES_DIPLOMACY_SCREEN: ClientChangelogEntry[] = [
  {
    createdAt: 1793219423974, // Date.now() captured once for this entry.
    introducedIn: "2026.10.28.3",
    title: "AI empires push reach across their own borderlands",
    why: "AI empires holding a wide band of unsettled land outside their reach stopped growing, and they never built beacons toward plain unclaimed land.",
    changes: ["AI empires now build relay beacons that carry reach across their own unsettled borderlands, and toward wide stretches of plain unclaimed land."]
  },
  { ...DIPLOMACY_SCREEN_PACTS_ENTRY, createdAt: 1794695490425, },
];
