import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const VISIT_REPORT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "The Chronicle opens with what your orders achieved",
  why: "Coming back to the game should start with your plan paying off, before the damage report.",
  changes: [
    "The Chronicle lists your own results since you last looked first: structures finished, waystations activated, ground and towns taken. What you lost comes right after.",
    "The \"Since you last looked\" headline follows the same order and now counts finished structures and activated waystations.",
    "A new block shows how far each of your victory paths moved since your last visit, for example \"Maritime Supremacy 31% → 36%\". Tap it to open Ranks. It appears from your second visit on a device."
  ]
};
