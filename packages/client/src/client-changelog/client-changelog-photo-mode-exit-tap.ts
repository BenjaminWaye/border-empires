import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const PHOTO_MODE_EXIT_TAP_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Photo mode can be left with a tap again",
  why: "On phones, once the Exit Photo Mode button faded out, tapping it hit the map underneath instead of leaving photo mode.",
  changes: [
    "Tapping the Exit Photo Mode button leaves photo mode even after it has faded out"
  ]
};
