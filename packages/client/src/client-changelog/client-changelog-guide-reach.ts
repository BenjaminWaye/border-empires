import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const GUIDE_REACH_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "The guide now teaches reach",
  why: "The guide never said that your reach is how you grow, that land beyond it can't be garrisoned, or why border land needs a garrison.",
  changes: [
    "The Relay Beacon step says what reach does: it is where you can garrison and build, it claims the free land inside it, and land beyond it can't be garrisoned.",
    "A new step in \"Your reach\" asks you to garrison one marked border tile. Land your reach claims has no defence until it is garrisoned.",
    "Expand To is described as what it is for: crossing to a town or dock outside your reach.",
    "Fixed: the guide said a Relay Beacon uses a food slot. Your first five don't.",
    "The older New empire checklist now says \"Garrison\" for its town and food goals, which is what completes them."
  ]
};
