import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SETUP_SCREEN_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.14",
  title: "Cleaner nation setup screen",
  why: "Choosing your name and colour also showed the sign-in heading and a technical connection line, and on small phones Enter the map ended up below the fold.",
  changes: [
    "The nation setup screen shows only the setup form, so Enter the map sits higher on small phones."
  ]
};
