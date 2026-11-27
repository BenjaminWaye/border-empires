import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const INSURGENTS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Planetary Defense is now the Insurgents",
  why: "Their frontier looked like empty land, and the old name didn't say who they are: defense forces that survived the Court's purge of the planet.",
  changes: [
    "Planetary Defense is renamed Insurgents everywhere in the game",
    "Every Insurgent frontier tile carries their faint raised-fist mark on both maps; camps still show patrolling soldiers"
  ]
};
