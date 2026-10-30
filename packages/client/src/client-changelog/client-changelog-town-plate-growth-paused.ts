import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_PLATE_GROWTH_PAUSED_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793275918345, // Date.now() captured once for this entry.
    introducedIn: "2026.10.29.1",
    title: "Clearer paused growth on town nameplates",
    why: "Crossed swords on a town's nameplate didn't say that the town had stopped growing.",
    changes: ["A town whose growth is paused by a nearby war or a recent capture now shows a growth line struck through."]
  }
];
