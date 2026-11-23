import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const LOADING_QUOTES_NEW_VOICES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "New voices in the loading quotes",
  why: "Some loading quotes described a threat that no longer exists on Sector worlds, and nearly all of them came from one narrator.",
  changes: [
    "Duke Alvra Sable's memoir now tells of Planetary Defense holdouts, Warden raids and Writs of Advancement, and its quotes follow",
    "Added lines from a Planetary Defense camp, a Court herald and the Senate",
    "Removed the quotes about the Bleed hunting what you build"
  ]
};
