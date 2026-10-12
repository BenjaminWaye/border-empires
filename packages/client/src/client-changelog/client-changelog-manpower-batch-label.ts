import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MANPOWER_BATCH_LABEL_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1791749603910, // frozen Date.now() value for this release
    introducedIn: "2026.10.11.2",
    title: "Manpower now counts down to your next batch",
    why: "The manpower chip said \"Refill in 1h 20m\", but manpower isn't a tank topping up, it arrives as a batch of locals converted into ancillaries all at once.",
    changes: [
      "The manpower chip and panel now read \"Next batch in ...\" and \"+N per batch\" instead of \"Refill in ...\" and \"per refill\""
    ]
  }
];
