import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CHRONICLE_HEADLINE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.17",
  title: "Chronicle sums up your time away; one card at a time",
  why: "Coming back to heavy losses meant adding up a dozen Chronicle rows, and one capture could stack several full-screen cards on top of each other.",
  changes: [
    "Chronicle → Yours opens with a short \"Since you left\" headline: tiles lost and gained, towns lost, a lost AFC, a wipe-out and new start, truces that ended and coin raided.",
    "Town Captured, Waystation Activated and survey cards now show one at a time; the next appears after you close the first.",
    "Survey clues already listed on the Town Captured card no longer pop up again on their own."
  ]
};
