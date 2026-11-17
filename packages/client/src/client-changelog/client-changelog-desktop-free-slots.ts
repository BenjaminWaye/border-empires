import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const DESKTOP_FREE_SLOTS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.17",
  title: "Free slots on the desktop resource bar",
  why: "Desktop showed used / total while phones showed what you can still use.",
  changes: ["Resource chips now show free slots on every screen, with a minus when you're short. Tap one for the full breakdown."]
};
