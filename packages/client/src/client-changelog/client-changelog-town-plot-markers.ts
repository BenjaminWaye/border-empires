import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_PLOT_MARKERS_ENTRY: ClientChangelogEntry = {
  createdAt: 1794998310613,
  introducedIn: "2026.11.18",
  title: "Clearer town building plots",
  why: "Dark hatches around towns looked like objects rather than open building space.",
  changes: [
    "Select your town to see open plots marked by ivory corners and a small brass diamond.",
    "Hover or select a plot to highlight it in amber; markers keep the ground visible in both map renderers.",
    "Occupied plots and enemy land no longer appear as empty building space."
  ]
};
