import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_LIST_BUILD_SLOTS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.11",
  title: "Build slots in the town list",
  why: "Finding a town with room for another building meant opening each town in turn.",
  changes: [
    "The town list shows how many support tiles each town has open for a new building",
    "Sort by build slots to find the towns with the most room; Settlements show a dash until they grow a support ring"
  ]
};
