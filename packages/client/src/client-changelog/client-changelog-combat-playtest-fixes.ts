import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const HUNT_REMOVED_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Hunt Planetary Defense removed",
  why: "Since the Planetary Defense camps, a Hunt order ran as a plain Advance: a flag set to hunt attacked a rival House in range and withdrew a truce offer to them.",
  changes: [
    "Flags no longer offer Hunt Planetary Defense; use Advance or March To",
    "Attacking Planetary Defense no longer changes a flag's order"
  ]
};

export const EFFORT_ODDS_REFRESH_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Attack odds follow your effort",
  why: "On the attack sheet, Normal, Extra and Double could all show the same win chance, and the region sheet's win chance vanished after picking Double.",
  changes: [
    "The win chance stays current while the attack sheet is open and changes with Normal, Extra and Double"
  ]
};
