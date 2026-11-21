import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CAPTURE_GARRISON_PROMPT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.21",
  title: "Captured towns ask you to garrison them",
  why: "A captured town gives no coin or manpower until it's garrisoned, and players weren't noticing.",
  changes: [
    "The Town Captured card warns the town isn't garrisoned and has a Garrison now button (unless auto-garrison is on)",
    "An ungarrisoned town's nameplate reads \"Not garrisoned\" next to its struck-through coin, on both maps",
    "The town screen shows \"Not garrisoned\" for coin and manpower instead of a dash, or \"Garrisoning…\" while troops are on their way"
  ]
};
