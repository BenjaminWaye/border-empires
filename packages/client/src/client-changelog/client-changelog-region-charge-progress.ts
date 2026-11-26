import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const REGION_CHARGE_PROGRESS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.26",
  title: "Clearer desert and tundra charge progress",
  why: "\"62 of 81 tiles garrisoned\" looked like 76% of the region, but 81 was the 75% target, so \"Not held\" seemed wrong.",
  changes: [
    "Progress now shows the region's size and the tiles needed, e.g. \"62 of 108 tiles garrisoned · 81 needed\""
  ]
};
