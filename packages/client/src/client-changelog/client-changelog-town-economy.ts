import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_ECONOMY_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793140390237, // Date.now() captured once for this entry.
    introducedIn: "2026.10.27.6",
    title: "Town manpower contributions",
    why: "The town screen showed a dash for manpower capacity and omitted regeneration.",
    changes: ["Towns now show their base manpower cap and regeneration per batch, including terrain and coastal modifiers. Building bonuses remain listed under In this town."]
  },
  {
    createdAt: 1793140577558, // Date.now() captured once for this entry.
    introducedIn: "2026.10.27.6",
    title: "Browse town economies",
    why: "Switching towns with the arrows could leave economy numbers missing until you clicked the town tile.",
    changes: ["The previous and next town arrows now refresh the selected town's details so its economy loads without a map click."]
  }
];
