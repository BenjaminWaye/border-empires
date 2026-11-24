import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const INTEGRITY_OWN_LAND_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.24",
  title: "Integrity: shape of all your land, plus how much is garrisoned",
  why: "Only garrisoned land counted, so garrisoning, even along your border, could lower your score, while never garrisoning kept it high.",
  changes: [
    "70% is the shape of all your land, garrisoned or not: sides facing land that isn't yours are open",
    "30% is the share of your land that is garrisoned, so garrisoning always raises it",
    "New empires keep at least 90% until they hold 50 tiles of land",
    "Weak tile highlights now include ungarrisoned land"
  ]
};
