import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const LOW_RESOURCE_NEXT_STEPS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Tracker shows where to get more manpower and coin",
  why: "With manpower low, the tracker only said \"Saving MP\", even when salvage, a waystation or a neutral town could help.",
  changes: [
    "When manpower is low, Next step lists a Reclamation Works ready to ship salvage, a waystation to activate or claim, and the nearest neutral town. Tap a row to go to it.",
    "When coin is short of the next Manifest, Next step suggests a Manufactory on one of your towns once you have the Manifest for it.",
    "These rows also show while your Dev slots are busy."
  ]
};
