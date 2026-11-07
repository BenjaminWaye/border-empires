import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FLAG_STALL_LABEL_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794086687107, // Date.now() captured once for this entry.
    introducedIn: "2026.11.07.1",
    title: "Filling flags no longer called stalled",
    why: "An Advance flag saving up for its next attack showed as stalled under Needs you, even while it was filling and fighting.",
    changes: [
      "Needs you lists a flag short of manpower only when your manpower pool is empty",
      "Flags with no target in range, or a target too costly to hold, still show under Needs you"
    ]
  }
];
