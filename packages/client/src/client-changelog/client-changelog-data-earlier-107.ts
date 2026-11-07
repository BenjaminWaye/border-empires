import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_107: ClientChangelogEntry[] = [
  {
    createdAt: 1792442407428, // Date.now() captured for this entry.
    introducedIn: "2026.10.19.4",
    title: "Free AFC upgrades appear correctly after login",
    why: "New-campaign players could see the old paid catalogue before choosing their first upgrade.",
    changes: [
      "Login and reconnect show free AFC choices unlocked by your Manifest tiers",
      "All 30 upgrade cards use short effect lines with percentages; expanded details explain conditions"
    ]
  },
  {
    createdAt: 1792528401682, // Date.now() captured for this entry.
    introducedIn: "2026.10.21.2",
    title: "Muster flag bases no longer look black",
    why: "On the 3D map, the base under a muster flag was dark iron that showed as a black band wherever the ground sloped away from it.",
    changes: [
      "In the 3D map, muster flags stand on a stone foundation that widens towards the ground and catches the light",
      "Town bases widen towards the ground the same way, so their stone walls catch more light on sloping tiles"
    ]
  }
];
