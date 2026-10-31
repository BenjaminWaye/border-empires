import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AI_DOCK_CROSSING_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793181875871, // Date.now() captured once for this entry.
    introducedIn: "2026.10.28.2",
    title: "AI empires sail from full islands",
    why: "AI empires that had claimed their whole island stopped expanding, even with free land across the water.",
    changes: ["AI empires now cross by dock to claim unclaimed land on other islands once their own island is full."]
  }
];
