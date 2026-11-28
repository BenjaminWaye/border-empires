import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const POPUPS_WAIT_THEIR_TURN_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.28",
  title: "Pop-ups wait their turn",
  why: "Town Captured and the House Charges note popped up over open panels, confirm sheets and the Tracker, and took taps meant for something else. A tip pin also covered a waystation's Activate button.",
  changes: [
    "Town Captured and other full-screen cards wait until open panels, screens and confirm sheets close, and never appear mid-tap",
    "A tap in the first moment a card appears is ignored, so it can't press a button you didn't see",
    "The House Charges cards step aside while the Tracker list, a confirm sheet or a full-screen card is open",
    "A tip pin no longer sits on a waystation's Activate button"
  ]
};
