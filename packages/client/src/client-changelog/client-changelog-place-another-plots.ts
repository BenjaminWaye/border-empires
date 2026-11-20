import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const PLACE_ANOTHER_PLOTS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.20",
  title: "Town plot builds confirm, then offer Place another",
  why: "After building a Farm Plot, Manufactory or other plot building from the town screen, Place still read Place, so it looked like nothing had happened.",
  changes: [
    "Building on a town plot now flashes ✓ Queued on the town screen's button, then it reads Place another"
  ]
};
