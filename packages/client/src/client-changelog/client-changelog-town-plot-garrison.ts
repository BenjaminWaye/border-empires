import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_PLOT_GARRISON_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.25",
  title: "Garrison a town's leftover plots in one tap",
  why: "Once a town was garrisoned, plots around it you held but hadn't garrisoned had no button and no badge, so they sat idle.",
  changes: [
    "A garrisoned town's screen leads with a gold Garrison plots button while any of its plots can be garrisoned",
    "Its nameplate shows the garrison badge until they are",
    "Plots on rival or neutral land, outside your reach, or already garrisoning don't count"
  ]
};
