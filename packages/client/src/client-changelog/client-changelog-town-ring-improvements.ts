import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_RING_IMPROVEMENTS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794075638607, // Date.now() captured once for this entry.
    introducedIn: "2026.11.07",
    title: "Resource improvements in town support rings",
    why: "Selecting a farm beside a town opened a different action bar that omitted the yellow improvement button.",
    changes: [
      "Available resource improvements now appear as the yellow primary button on the town screen too.",
      "Selecting a different town plot resets Build to its relevant category, including Resource for farms and deposits."
    ]
  }
];
