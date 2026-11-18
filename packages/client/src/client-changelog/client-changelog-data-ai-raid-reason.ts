import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { AI_RAID_REASON_ENTRY } from "./client-changelog-ai-raid-reason.js";

// Split out of client-changelog-data.ts to keep it under the line cap.
export const CLIENT_CHANGELOG_ENTRIES_AI_RAID_REASON: ClientChangelogEntry[] = [
  {
    createdAt: 1793544875839, // Date.now() captured once for this entry.
    introducedIn: "2026.11.01",
    title: "Towns panel",
    why: "There was no way to compare towns without opening each one.",
    changes: [
      "A new Towns button lists your towns with gold per day, population and growth",
      "Sort by any column, highest or lowest first",
      "Press a town to jump to it on the map",
      "The All view's Food slot list no longer comes out empty"
    ]
  },
  { ...AI_RAID_REASON_ENTRY, createdAt: 1794695841647, },
];
