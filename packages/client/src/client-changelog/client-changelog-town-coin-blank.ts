import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_COIN_BLANK_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Town coin stays visible",
  why: "A fed town's Coin card could go blank after the town grew.",
  changes: [
    "The town screen keeps showing a town's coin per day as its population grows",
    "While coin figures are refreshing, the Coin card shows … instead of a dash"
  ]
};
