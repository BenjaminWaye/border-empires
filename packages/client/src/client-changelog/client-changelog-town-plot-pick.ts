import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_PLOT_PICK_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Choose where town buildings go, on the map, on phones",
  why: "On a phone the town screen's build list showed barely one row, Place could name a building you'd scrolled past, and the plot was picked for you out of sight.",
  changes: [
    "On a phone, tapping a building that goes on a town plot (or its Place) now hides the town screen and shows the map: the town's open plots glow and the best one is picked",
    "Tap another glowing plot to move it, then Build here, or Cancel to go back to the town screen",
    "Desktop keeps the build list and Place"
  ]
};
