import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const LOW_RESOURCE_NEXT_STEPS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Tracker shows where to get more manpower and coin",
  why: "With manpower low, the tracker only said \"Saving MP\", even when salvage, a waystation or a neutral town could help.",
  changes: [
    "When manpower is low, Next step lists a Reclamation Works ready to ship salvage, a waystation to activate or claim, and the nearest neutral town. Tap a row to go to it.",
    "When the next Manifest is more than 12 hours away, or your coin income has stopped, Next step suggests building a Manufactory on one of your towns (once you have its Manifest and an open plot next to the town).",
    "These rows also show while your Dev slots are busy."
  ]
};
