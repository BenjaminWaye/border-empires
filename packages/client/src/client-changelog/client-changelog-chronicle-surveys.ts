import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CHRONICLE_SURVEYS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Survey clues in the Chronicle",
  why: "Survey clues found while you were away had nowhere to be read once login stopped popping them.",
  changes: [
    "Chronicle → Yours lists your open resource survey clues under Resource surveys.",
    "View moves the map to the clue's area.",
    "A clue stays until you research that resource's Manifest."
  ]
};
