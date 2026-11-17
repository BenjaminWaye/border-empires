import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const HYDROWORKS_PLACEMENT_TEXT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.17",
  title: "Hydroworks description fixed",
  why: "The Build menu said Hydroworks had to go on a town's support tile, but it can go on any empty land tile you hold.",
  changes: ["The Hydroworks description now leads with its effect and says it needs no town, support or resource tile."]
};
