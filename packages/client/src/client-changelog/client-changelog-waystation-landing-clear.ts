import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const WAYSTATION_LANDING_CLEAR_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.11",
  title: "Clean landings",
  why: "A waystation next to your landing site paid out instantly and its popup covered the landing.",
  changes: [
    "Waystations inside your starting territory are removed when your AFC lands.",
    "Reward popups wait until your AFC has landed."
  ]
};
