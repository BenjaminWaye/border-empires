import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const UNGARRISONED_TOWN_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.19",
  title: "Towns that aren't garrisoned now say so",
  why: "A playtester's only town was never garrisoned, so it made no coin and didn't grow for a whole day, and nothing in the game pointed it out.",
  changes: [
    "A town you hold but haven't garrisoned shows a struck-through coin on its nameplate, on both the 3D and 2D maps",
    "When that town is off screen, a ! marker at the edge of the map points to it. Tap it to jump there",
    "The Towns list marks the town \"Not garrisoned\"",
    "None of these show once the town's garrison is queued, planned by auto-settle or under way"
  ]
};
