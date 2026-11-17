import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const DESKTOP_FREE_SLOTS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.17",
  title: "Free slots on the desktop resource bar",
  why: "See at a glance how many slots you can still use.",
  changes: ["Resource chips show free slots on every screen, with a minus when you're short. Hover for used / total; click for the breakdown."]
};
