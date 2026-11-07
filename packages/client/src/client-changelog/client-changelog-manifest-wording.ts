import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MANIFEST_WORDING_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794050842882, // Date.now() captured once for this entry.
    introducedIn: "2026.11.07",
    title: "Manifests named consistently",
    why: "Profiles, leaderboards and several hints still said tech instead of Manifests.",
    changes: [
      "Player profiles, the season-end screen and leaderboards count Manifests",
      "Hints, tooltips, the attack win-chance breakdown and error messages now refer to Manifests instead of tech",
      "The locked Aether Bridge warning names the Manifest that actually unlocks it"
    ]
  }
];
