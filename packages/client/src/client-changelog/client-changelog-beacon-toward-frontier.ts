import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const BEACON_TOWARD_FRONTIER_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.25",
  title: "Relay Beacon toward here uses your frontier",
  why: "It only started on garrisoned land, so a new empire with only frontier saw it greyed.",
  changes: [
    "Relay Beacon toward here now starts on frontier or open land inside your reach"
  ]
};
