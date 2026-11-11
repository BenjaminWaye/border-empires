import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const PLACE_FEEDBACK_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.11",
  title: "Place confirms your building, and towns show their build plots",
  why: "Pressing Place gave no sign the building went through, the town's Support 8/8 count didn't say where there was room to build, and cancelling a garrison left the build queued behind it.",
  changes: [
    "Pressing Place now shows a confirmation: the building has started, or joined the queue until a development slot frees up.",
    "The town screen's Support ring count is now Build plots: a square per plot shows what's built, in progress, open or still needs a garrison, and the plot you just built on lights up.",
    "Cancelling a garrison also cancels any build queued on that tile, so it no longer goes up the next time you garrison there."
  ]
};
