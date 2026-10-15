import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_HOSTILE_MUSTER_ALERTS: ClientChangelogEntry[] = [
  {
    createdAt: 1792044007050, // frozen Date.now() value for this release
    introducedIn: "2026.10.15.1",
    title: "Warnings for enemy muster flags near your border",
    why: "An enemy could stage troops on a muster flag right next to your land, and you only found out once the attack landed.",
    changes: [
      "A warning pops up when an enemy muster flag appears within 4 tiles of your territory, or an existing one switches to Advance or March, with a button to center on it",
      "Enemy flags near your border get a red off-screen pointer in both map renderers, ahead of your own alerts while still leaving room for them",
      "Flags of allies and truce partners don't trigger warnings"
    ]
  }
];
