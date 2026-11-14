import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const COPY_POINTERS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.14",
  title: "Hints point to the right place",
  why: "The town survey popup sent you to Activity, a screen that no longer exists, and the deal screen said the treaties were on the left when phones show them above.",
  changes: [
    "The town survey popup now says the clue stays on that resource's Manifest card.",
    "The deal screen's hint no longer says where on screen the treaties are."
  ]
};
