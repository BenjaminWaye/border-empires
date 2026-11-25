import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const LORE_CATALOGUE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.25",
  title: "A Lore tab in the Chronicle",
  why: "Names like Concordance relic, the Court and the Wardens appeared in the game with nowhere to read what they are.",
  changes: [
    "The Chronicle has a Lore tab: short entries on the old world, the Imperium, your House and this world.",
    "Tap an entry to read it."
  ]
};
