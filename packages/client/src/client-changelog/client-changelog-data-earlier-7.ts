// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
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
  },
  {
    createdAt: 1788068704420,
    introducedIn: "2026.08.29.3",
    title: "Fixed Mercantile Charter's \"First 3 towns\" line still not showing up for existing towns",
    why: "The previous fix only stamped the \"First 3 towns\" bonus onto a town the first time it was fully rebuilt. The much more common per-tick refresh path that keeps gold/fed status current between those rebuilds recomputed your gold total correctly but never re-stamped the bonus line itself, so a town that already existed before you picked up Mercantile Charter kept showing no bonus indefinitely.",
    changes: [
      "The tile overview's \"First 3 towns\" line now stays in sync on every economy refresh, not just the rare full town rebuild"
    ]
  },
  {
    createdAt: 1788071064537,
    introducedIn: "2026.08.30.1",
    title: "An Aether Condenser (or Titanium/Umbrite Works) in Sell Off mode now boosts its own town's gold, like Mintworks",
    why: "Sell Off mode gold used to always pay out as separate empire-wide income with no connection to any town, so building one in a town's support ring -- the same ring Mintworks, Garrison Hall, and Clearing House already boost that town from -- had no visible effect on that town's own gold production or its overview modifier list, which read as the building's income going nowhere.",
    changes: [
      "An active Sell Off (EXCHANGE mode) Aether Condenser, Titanium Works, or Umbrite Works (including Advanced tiers) built in a town's support ring now adds its gold straight into that town's own gold production instead of paying out as separate empire income",
      "The town's overview now shows a \"Sell Off gold\" modifier under a \"<count> <Building>\" heading for these buildings, matching how Mintworks and other support-ring buildings already show their contribution",
      "A converter built outside any town's support ring is unaffected -- its gold still pays out as separate empire income exactly as before"
    ]
  },
  {
    createdAt: 1788088003101,
    introducedIn: "2026.08.30.1",
    title: "Selecting a town, dock, or outpost-family structure now highlights its reach in green",
    why: "The aggregate border overlay shows your empire's whole reach, but not what any single building actually contributes to it -- with several towns, docks, and beacons dotted around, it was hard to tell at a glance how far one specific structure's reach disk extends.",
    changes: [
      "Selecting a town, dock, or an outpost-family structure (Relay Beacon, Siege Outpost, Siege Tower, Dread Tower) now green-tints every tile within that structure's own reach disk on the 2D map"
    ]
  },
  {
    createdAt: 1788088515738,
    introducedIn: "2026.08.30.1",
    title: "Settle Land now queues on a tile you're already expanding into",
    why: "Pressing Settle Land on a neutral tile that was already mid-expansion (an active claim, or one still waiting its turn in the frontier queue) used to be rejected as a duplicate/locked target -- there was no way to line up the settle ahead of time, so you had to watch for the expansion to land and click again.",
    changes: [
      "Settle Land on a tile you're already expanding into now queues the settlement and fires it automatically once that tile becomes your frontier -- instead of being rejected",
      "The tile's progress tab shows queued settle (and settle + build) actions lined up behind the active expansion, with a cancel button for each"
    ]
  },
  {
    createdAt: 1788091013204,
    introducedIn: "2026.08.30.2",
    title: "Mercantile Charter's \"first three towns\" no longer counts a bare starting settlement",
    why: "Every settled tile carries basic town data, not just a player's actual named/grown cities -- so an early, unnamed starting settlement silently occupied one of Mercantile Charter's three bonus slots ahead of the player's real towns, exactly matching the domain's own description (\"your first three cities\") but not what it actually checked. An established player with more than a couple of settled tiles could end up with none of their real towns receiving the bonus at all.",
    changes: [
      "Mercantile Charter's first-three-towns bonus now only considers TOWN tier and above -- a bare settlement can no longer take one of the three slots"
    ]
  },
  {
    createdAt: 1788091180198,
    introducedIn: "2026.08.30.3",
    title: "Fixed the Gold Production stat not matching its own \"Sell Off gold\" modifier line",
    why: "The tile popup's gold-production number and its \"MODIFIERS\" list are computed on two separate code paths in the gateway's tile-detail lookup. The modifiers list was already fixed to detect a support-ring converter correctly, but the gold-production number's own formula was never updated to include it, so the two figures on the same screen disagreed -- and a Refine-mode converter (which earns no gold) could incorrectly show a \"Sell Off gold\" line at all.",
    changes: [
      "A settled town tile's Gold Production number now includes a support-ring Sell Off converter's contribution, matching the modifier line below it",
      "A converter in Refine mode no longer shows a \"Sell Off gold\" modifier it doesn't actually earn"
    ]
  },
  {
    createdAt: 1788107851889,
    introducedIn: "2026.08.30.1",
    title: "Fixed waypoints stalling behind a large queue of manually-claimed tiles",
    why: "A waypoint's next leg refused to enqueue at all while the frontier action queue held anything, so queuing up several individual tiles (adjacency/frontier-expansion clicks) alongside an active waypoint could stall it indefinitely -- the waypoint never got a turn as long as the player kept adding to the manual queue.",
    changes: [
      "An active waypoint now keeps advancing alongside manually-queued frontier tiles instead of waiting for that queue to fully drain"
    ]
  }
];
