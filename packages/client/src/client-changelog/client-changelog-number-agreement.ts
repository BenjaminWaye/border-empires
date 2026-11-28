import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const NUMBER_AGREEMENT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.28",
  title: "Food, coin and manpower screens agree",
  why: "A town short of FOOD could still read Fed on its own screen, and manpower timings looked like three schedules.",
  changes: [
    "A town left short of FOOD now shows Unfed everywhere within a minute, even when it is your only town",
    "Economy's FOOD list marks the towns a shortage leaves unfed",
    "Manpower panel gives the next batch time when you are full or over the cap",
    "New capacity from a town you take lands at once, even over the cap; the panel now says so",
    "Expand To shows the price per tile, charged as each claim goes out"
  ]
};
