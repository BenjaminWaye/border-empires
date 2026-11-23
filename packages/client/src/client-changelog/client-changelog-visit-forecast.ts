import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const VISIT_FORECAST_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "The Chronicle shows what happens while you are away",
  why: "Before you put the game down, you should be able to see what is still running and when it is worth coming back.",
  changes: [
    "A new Ahead tab in the Chronicle lists what is still to come: builds and garrisons finishing, queued work and expansions, the next manpower batch and when manpower is full, towns nearing their next tier, victory holds running, and truces ending.",
    "It opens with a suggested moment to come back, taken from the earliest of those worth returning for.",
    "Rows link to the tile, to Ranks or to Diplomacy."
  ]
};
