// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_14: ClientChangelogEntry[] = [
  {
    createdAt: 1788509411185, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.3",
    title: "Daily activity digest: better headlines, and combat losses now credit the right player",
    why: "The digest ranked its headlines by each event's raw number, so a routine manpower-cap tick (naturally in the hundreds-to-thousands) always beat a genuinely bigger tile swing (naturally in the tens-to-low-hundreds) regardless of which actually mattered more that day. It also narrated the same border conflict up to four separate times (once per event type) with no memory of what it had already said. Manpower spent on attacks is now credited to whoever's actually paying for it -- barbarian-origin attacks are excluded from the new headlines below since barbarians never spend manpower on their own attacks.",
    changes: [
      "Every headline type is now scored on a comparable scale, so a big tile swing or war can outrank a routine growth tick instead of always losing to it on raw magnitude",
      "Once a player or pair anchors the day's top headline, a lower-ranked headline that would only re-tell the same story about the same players is now skipped instead of padding the digest",
      "Added \"Fiercest Attacker\": the player who spent the most manpower attacking today",
      "Added \"Toughest Target\": the player attackers spent the most manpower trying to dislodge today, including when they held their ground and lost nothing"
    ]
  }
];
