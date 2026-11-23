import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const PHOTO_MODE_EXIT_TAP_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Photo mode exit stays findable on phones",
  why: "On phones, the Exit Photo Mode button faded to nothing, so there was no sign of how to leave photo mode.",
  changes: [
    "On touch screens the Exit Photo Mode button stays faintly visible and tappable instead of disappearing"
  ]
};
