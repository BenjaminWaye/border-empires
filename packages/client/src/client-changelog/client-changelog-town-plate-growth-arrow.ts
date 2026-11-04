import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_PLATE_GROWTH_ARROW_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793741809612, // Date.now() captured once for this entry.
    introducedIn: "2026.11.03.1",
    title: "Town growth on nameplates",
    why: "A struck-through growth line was hard to read as paused growth.",
    changes: [
      "Your towns' population shows a green arrow while growing and amber pause bars while growth is paused.",
      "A nearby war shows a fire icon, and a recently captured town shows a planted flag."
    ]
  }
];
