import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SIEGE_BATTERY_NO_REACH_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793858823371, // Date.now() captured once for this entry.
    introducedIn: "2026.11.05",
    title: "Siege batteries no longer hold reach",
    why: "A siege battery kept an enemy's reach in place after you destroyed every Relay Beacon around it.",
    changes: [
      "Siege Batteries, Siege Towers and Dread Towers no longer extend reach. Only towns, AFCs, Relay Beacons and docks do",
      "Reach that only a siege battery held is released"
    ]
  }
];
