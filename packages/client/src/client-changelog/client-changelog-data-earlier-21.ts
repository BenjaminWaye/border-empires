// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_21: ClientChangelogEntry[] = [
  {
    createdAt: 1788563281345,
    introducedIn: "2026.09.04.13",
    title: "Fixed Aether Bridge still rejecting real coastal tiles after the last fix",
    why: "The previous Aether Bridge coastal-land fix widened the check to all 8 neighbors, but the client's version of that check read terrain from terrainAt(), a purely procedural function that recomputes terrain from the world seed alone -- it has no idea about server-side overrides like carved dock channels, player-made or removed mountains, or connectivity fixes, which cluster exactly where coastlines are. So a tile that was only coastal because of one of those overrides still greyed out with \"Target must be coastal land\", even though the server's own (already-fixed) validation would have accepted it.",
    changes: [
      "Aether Bridge's tile-menu availability check and target highlighting now read a neighboring tile's real synced terrain first, falling back to the procedural guess only for tiles with no synced data, instead of trusting the procedural guess everywhere"
    ]
  },
  {
    createdAt: 1788555541310, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.13",
    title: "Fixed the daily activity digest reading much shorter than the day actually was",
    why: "Every headline was scored on a 0-100 scale, hard-clamped at 100 -- so on a genuinely big day, several unrelated metrics (a 226-tile defeat, a 301-tile war, 4,424 manpower spent attacking) all simultaneously blew past their calibration and tied at the ceiling, with only the first few in build order surviving. Worse, a specific-tile headline (Bloodiest Battle, Fiercest Fighting) was dropped whenever it named the same two players a higher-ranked headline already had, even though naming the actual location is new information, not a repeat.",
    changes: [
      "Headline scores are no longer clamped at 100, so a real outlier day ranks its headlines by how big each one actually was instead of several tying at the ceiling",
      "A headline naming a specific tile (Bloodiest Battle, Fiercest Fighting) is no longer dropped just because it shares its two players with an already-told headline -- the location itself is new information"
    ]
  }
];
