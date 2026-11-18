import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const PHOTO_MODE_FINDABLE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.15",
  title: "Photo mode is easier to find and takes cleaner shots",
  why: "Photo mode was three taps deep in Settings > Gameplay, and its shots still had town plates, the selection square, alert pins and the Exit button in them.",
  changes: [
    "Photo mode is now on the Settings page and in the map lens menu (on phones, in the map view's header)",
    "Town name plates, ready badges, map toasts, alert pins and the selection square are hidden while it is on; your selection comes back when you leave",
    "The Exit Photo Mode button fades out after a moment; touch the screen or move the mouse to bring it back"
  ]
};
