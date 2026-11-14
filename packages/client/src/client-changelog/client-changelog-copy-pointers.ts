import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const COPY_POINTERS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.14",
  title: "Hints point to the right place",
  why: "The town survey popup sent you to Activity, a tab now called Chronicle, and the deal screen said the treaties were on the left when phones show them above.",
  changes: [
    "The town survey popup now says its clue is saved in Chronicle → Yours.",
    "The deal screen's hint no longer says where on screen the treaties are."
  ]
};
