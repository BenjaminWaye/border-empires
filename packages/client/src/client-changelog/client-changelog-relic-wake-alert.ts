import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const RELIC_WAKE_ALERT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.24",
  title: "Rival relics are named when you first see them",
  why: "A rival's working relic showed only as a column and a violet box on the minimap, often far away and pinned to the minimap's edge, with nothing saying what it was.",
  changes: [
    "The first time you see another House running a Concordance relic, an alert names the House and the site, with Show to go there.",
    "Pressing a relic's box on the minimap, even one pinned to the edge, takes you to the relic itself instead of the edge."
  ]
};
