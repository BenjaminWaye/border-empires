// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_53: ClientChangelogEntry[] = [
  // "Space View now warns you when a raid is inbound at one of your
  // territories" (createdAt 1788951636486, 2026.09.09.03) aged out of the
  // "latest week" rolling window and was removed from this array.
  {
    createdAt: 1789149360442, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.12.04",
    title: "A marching muster company now walks to the front instead of running with a raised weapon",
    why: "The muster-transit march overlay played the same running clip a soldier uses when sprinting into a firefight, so a company still well behind the lines already read as charging into combat. It now plays a real walk cycle instead, so the march itself looks like troops moving up rather than an attack already underway.",
    changes: [
      "A muster company's march to its target now plays a real walking animation instead of the combat running clip"
    ]
  }
];
