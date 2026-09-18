import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_84: ClientChangelogEntry[] = [
  {
    createdAt: 1789766853902, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.18.7",
    title: "Relay Beacons now auto-settle newly claimed fish tiles immediately",
    why: "When a Relay Beacon finished building, its new reach border could instantly claim nearby neutral fish tiles as frontier, but auto-settle checked eligibility before the server had installed the beacon's new reach border. The fish tiles became yours but did not start settling until a later fallback pass, if at all.",
    changes: [
      "Neutral fish tiles newly claimed by a completed Relay Beacon now start auto-settling immediately when a development slot is free"
    ]
  }
];
