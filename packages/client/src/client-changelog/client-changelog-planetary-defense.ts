import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_PLANETARY_DEFENSE: ClientChangelogEntry[] = [
  {
    createdAt: 1790961825638,
    introducedIn: "2026.10.02.4",
    title: "Barbarians are now the Planetary Defense",
    why: "The barbarians are what is left of this planet's own defense force after it was prepared for the planetary games, and they should look like soldiers, not monsters.",
    changes: [
      "Barbarians (\"The Bleed\") are renamed to Planetary Defense everywhere in the game",
      "The crystal monster on their tiles is replaced by soldiers in dark grey armor that patrol around their tiles",
      "When Planetary Defense fights, its side of the battle is those same dark grey soldiers"
    ]
  }
];
