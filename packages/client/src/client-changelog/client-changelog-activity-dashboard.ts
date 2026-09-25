import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_ACTIVITY_DASHBOARD: ClientChangelogEntry[] = [
  {
    // Frozen immediately after the newest bundled entry so the six-day
    // client-window retains the still-relevant entries in its historical files.
    createdAt: 1789933799384,
    introducedIn: "2026.09.25.2",
    title: "Activity now remembers the milestones your empire reached while you were away",
    why: "The Activity dashboard could already show territory, battles, manpower, and raided gold, but a completed building, captured town, or waystation reward could disappear from the story unless you happened to be watching live.",
    changes: [
      "Activity now retains waystation rewards for 24 hours, including their exact resource-slot, population, vision, or technology effect",
      "Town captures and losses show the town's aftermath, and completed buildings show their one-off gold or population reward when one applies",
      "Every new milestone card has a Center action so you can jump straight to where it happened"
    ]
  },
  { createdAt: 1789766351673, introducedIn: "2026.09.18.7", title: "Waystation captures now keep their reward", why: "Expanding onto a Waystation briefly activated it on the server, but the capture-complete tile update could then resend the older inactive tile shape, hiding the reward popup and making the site look like it did nothing.", changes: ["Frontier expansion over a Waystation now sends the activated Waystation result in the final capture update, so the reward and popup persist correctly"] }
];
