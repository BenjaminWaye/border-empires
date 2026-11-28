import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const STRIPED_FRONTIER_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Striped frontier, steady AI colours",
  why: "Frontier faded into the ground, and an AI empire could change colour mid-game.",
  changes: [
    "Frontier land shows diagonal stripes in its empire's colour",
    "AI empires keep their colour for the whole game"
  ]
};
