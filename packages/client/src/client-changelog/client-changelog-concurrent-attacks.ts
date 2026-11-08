import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CONCURRENT_ATTACKS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794089657552, // Date.now() captured once for this entry.
    introducedIn: "2026.11.08",
    title: "Launch several attacks at once",
    why: "Only one attack could be under way at a time, even with several muster flags and plenty of manpower.",
    changes: [
      "Attacks no longer wait for each other: launch as many as your flags have manpower for",
      "One flag can send several companies, as long as it holds enough manpower for each",
      "The Capturing Territory banner and timer are gone; each attack shows its progress on the map"
    ]
  }
];
