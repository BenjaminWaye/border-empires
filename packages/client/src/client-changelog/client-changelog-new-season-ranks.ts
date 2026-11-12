import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const NEW_SEASON_RANKS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.11",
  title: "Ranks start fresh each season",
  why: "Right after a new season began, Ranks could keep showing last season's standings and victory holders until the next server restart.",
  changes: [
    "Standings and victory races show the new season as soon as it starts"
  ]
};
