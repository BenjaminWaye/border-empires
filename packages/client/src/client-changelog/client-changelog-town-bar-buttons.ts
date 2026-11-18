import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_BAR_BUTTONS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Town buttons no longer cut off on phones",
  why: "With a garrison you couldn't afford, the town screen's Garrison, Raise flag and Map buttons slid off the bottom of the screen.",
  changes: ["The town bar grows to fit its buttons and links, and the build list above it ends where the bar starts."]
};
