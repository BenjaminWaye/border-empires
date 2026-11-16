import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const STRUCTURE_INFO_SCROLL_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Structure details stay scrolled",
  why: "On phones, scrolling down a structure's details popup kept jumping back to the top whenever the game updated.",
  changes: [
    "Structure and crystal ability detail popups now keep your scroll position while the game updates, so you can read the effects, cost and placement below the fold."
  ]
};
