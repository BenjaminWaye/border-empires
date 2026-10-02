import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_SECTOR_NUMBERING: ClientChangelogEntry[] = [
  {
    createdAt: 1790757301382, // frozen, 1ms after the newest existing entry -- keeps the "latest week" window from shifting
    introducedIn: "2026.09.30.3",
    title: "Your claimed territory in the galactic layer is now called a Sector",
    why: "Galactic Holdings and Space View labeled every held territory by its raw season number, which skipped around once Defense Campaigns started running (Sector 1, then Sector 7, never Sector 2) and gave no sense of a territory's own history of being contested.",
    changes: [
      "Planets, Outposts, and Stipends in Galactic Holdings and Space View now show a gapless Sector number (Sector 001, 002, ...) instead of the raw season count",
      "The Imperial Court's first-victory letter now names your real Sector instead of a placeholder"
    ]
  }
];
