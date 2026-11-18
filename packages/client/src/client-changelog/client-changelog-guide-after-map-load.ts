import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const GUIDE_AFTER_MAP_LOAD_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Guide waits for your map",
  why: "The guide card could pop up over the \"Drawing your map...\" loading screen.",
  changes: [
    "The guide, tips and the AFC landing now wait until your map has finished drawing."
  ]
};
