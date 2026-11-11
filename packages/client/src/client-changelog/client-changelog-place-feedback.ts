import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const PLACE_FEEDBACK_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.11",
  title: "Place confirms your building",
  why: "Pressing Place gave no sign the building went through, and cancelling a garrison left the build queued behind it.",
  changes: [
    "Pressing Place now shows a confirmation: the building has started, or joined the queue until a development slot frees up.",
    "Cancelling a garrison also cancels any build queued on that tile, so it no longer goes up the next time you garrison there."
  ]
};
