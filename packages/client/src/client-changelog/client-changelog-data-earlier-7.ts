// Overflow from client-changelog-data.ts (kept under the 500-line cap) --
// moved here verbatim when a new entry pushed that file over the cap.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_7: ClientChangelogEntry[] = [
  {
    createdAt: 1788207240439, // frozen: one ms after this file's prior newest entry
    introducedIn: "2026.08.31.5",
    title: "Dock sea-route line now follows the terrain in the 3D map too",
    why: "The dashed dock-to-dock sea-route line was drawn on the 2D overlay canvas using the flat-grid worldToScreen projection with no check for which renderer was active, so it also rendered unguarded on top of the true-3D map -- where it doesn't line up with the isometric/heightfield projection and visibly crossed islands instead of tracing the sea. The true-3D map also had no route-line overlay of its own (only the dock endpoint markers), so the correct fix wasn't just to stop drawing the misaligned line there.",
    changes: [
      "The dock sea-route line for a selected dock now renders directly on the true-3D map's terrain (following the same server-computed sea path as the 2D map), instead of the mismatched flat-grid line that used to bleed through onto it"
    ]
  },
  {
    createdAt: 1788202192814, // frozen: one ms after this file's prior newest entry
    introducedIn: "2026.08.31.4",
    title: "\"Build Relay Beacon\" now shows on a tile that already has a Fort",
    why: "A Fort and a Relay Beacon are allowed to share a tile -- the sim and the shared placement rules both explicitly permit it, and the \"Build Fort\" button already stayed available on a tile with an existing Relay Beacon -- but the reverse direction never got the same fix: the \"Build Relay Beacon\" action still had a leftover check hiding it whenever the tile already had a Fort, most noticeably on docks (which often get a Fort early for defense).",
    changes: [
      "\"Build Relay Beacon\" now shows up on any owned, settled land tile that already has a Fort, matching the coexistence the sim has allowed since Fort+Relay Beacon sharing shipped"
    ]
  }
];
