import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_ACTIVITY_DASHBOARD: ClientChangelogEntry[] = [
  {
    createdAt: 1789933799384,
    introducedIn: "2026.09.25.2",
    title: "Activity now remembers the milestones your empire reached while you were away",
    why: "The Activity dashboard could already show territory, battles, manpower, and raided gold, but a completed building, captured town, or waystation reward could disappear from the story unless you happened to be watching live.",
    changes: [
      "Activity now retains waystation rewards for 24 hours, including their exact resource-slot, population, vision, or technology effect",
      "Town captures and losses show the town's aftermath, and completed buildings show their one-off gold or population reward when one applies",
      "Every new milestone card has a Center action so you can jump straight to where it happened"
    ]
  }
];
