import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_RELAY_BEACON_INSTANT: ClientChangelogEntry[] = [
  {
    createdAt: 1790958307328,
    introducedIn: "2026.10.02.3",
    title: "Your first 5 Relay Beacons are built instantly again",
    why: "They came down with the landing party, so they only need putting in place -- making you wait 30 minutes for each one just slowed down your opening without adding a real decision. They still cost manpower, so a starter beacon is still something you spend on.",
    changes: [
      "The first 5 Relay Beacons you own are now built instantly (they were taking 30 minutes) and still cost 50 manpower each",
      "From the 6th, a Relay Beacon is unchanged: 100 manpower and about an hour to build"
    ]
  }
];
