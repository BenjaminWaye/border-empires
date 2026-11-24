import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const INTEGRITY_OWN_LAND_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.24",
  title: "Integrity: the shape of all your land",
  why: "Only garrisoned land counted, so garrisoning, even along your border, could lower your score.",
  changes: [
    "Integrity is the shape of all your land, garrisoned or not: sides facing land that isn't yours are open",
    "With under 10% of your land garrisoned you lose up to 30%",
    "No more new-empire minimum",
    "Weak tile highlights now include ungarrisoned land"
  ]
};
