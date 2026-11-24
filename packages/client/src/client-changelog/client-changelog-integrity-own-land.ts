import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const INTEGRITY_OWN_LAND_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.24",
  title: "Garrisoning no longer lowers Integrity",
  why: "Sides facing your own ungarrisoned land counted as open, so garrisoning a tile inside your empire could drop your score.",
  changes: [
    "A side is open only when it faces land that isn't yours",
    "Weak tile highlights and the Integrity panel count it the same way"
  ]
};
