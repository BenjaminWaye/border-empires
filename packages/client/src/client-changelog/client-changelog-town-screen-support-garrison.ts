import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_SCREEN_SUPPORT_GARRISON_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793564369997, // Date.now() captured once for this entry.
    introducedIn: "2026.11.01",
    title: "Garrison support tiles from the town screen",
    why: "Selecting a support tile opens its town's screen, which only offered Garrison for the town itself.",
    changes: ["A selected ungarrisoned support tile now shows a gold Garrison button on the town screen"]
  }
];
