import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const GUIDE_AFTER_MAP_LOAD_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Guide waits for your map",
  why: "The guide card could pop up over the \"Drawing your map...\" loading screen.",
  changes: [
    "The guide, discovery tips, the new empire checklist, the AFC landing and map popups now wait until the \"Drawing your map...\" screen has finished."
  ]
};
