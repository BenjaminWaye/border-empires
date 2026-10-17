import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_WAYSTATION_AUTO_CLAIM_ACTIVATION: ClientChangelogEntry[] = [
  {
    createdAt: 1791802853341, // frozen Date.now() value for this release
    introducedIn: "2026.10.12.1",
    title: "Waystations next to your towns now activate",
    why: "A waystation that was free-claimed beside one of your towns stayed \"Dormant\" under your ownership and never gave its bonus.",
    changes: [
      "Waystations and watchtowers claimed automatically next to your towns now activate and grant their bonus, like ones you capture yourself"
    ]
  }
];
