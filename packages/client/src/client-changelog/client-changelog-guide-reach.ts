import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const GUIDE_REACH_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "The guide now teaches reach",
  why: "The guide never said that your reach is how you grow, that land beyond it can't be garrisoned, or why border land needs a garrison.",
  changes: [
    "The Relay Beacon step says what reach does: a beacon claims the free land inside it, that land has no defence until garrisoned, and land beyond your reach can't be garrisoned.",
    "Expand To is described as what it is for: crossing to a prize outside your reach, not claiming plain ground.",
    "Fixed: the guide said a Relay Beacon uses a food slot. Your first five don't.",
    "Fixed: the food step called an unclaimed food tile \"outside your reach\" when it was inside it."
  ]
};
