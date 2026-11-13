import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CANCEL_WAYPOINT_PRIMARY_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.13",
  title: "Cancel Waypoint is easy to find",
  why: "After setting a waypoint, its Cancel button was a small link under the action bar.",
  changes: ["On the tile your empire is currently expanding toward, Cancel Waypoint is now the main gold button in the action bar (attack and march actions still come first)."]
};
