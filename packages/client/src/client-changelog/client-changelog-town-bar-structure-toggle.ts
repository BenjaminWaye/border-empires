import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_BAR_STRUCTURE_TOGGLE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.17",
  title: "Disable buildings from the town screen",
  why: "Selecting a building on the town screen didn't offer Disable, so there was no way there to switch off a building whose FOOD you couldn't supply.",
  changes: [
    "With a building's tile selected, the bar on the town screen now shows its Disable or Enable switch, a converter's Refine/Sell Off switch, and an Aether Tower's Cancel siphon."
  ]
};
