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
    createdAt: 1788033792915,
    introducedIn: "2026.08.29.3",
    title: "Reduced camera pan stutter in the 3D map",
    why: "Every pan drag used to force a full terrain rebuild on every single tile crossed, because the terrain and every overlay were re-baked to sit exactly on the live camera position. Rebuilding is expensive (re-uploading a padded window of tiles to the GPU), so a brisk drag could ask for far more rebuilds per second than the render loop could actually keep up with, showing up as stutter/frame drops layered on top of the pan itself.",
    changes: [
      "Panning the 3D map now rebuilds terrain only when the camera actually needs tiles outside its already-built window, instead of on every tile crossed -- cutting rebuild frequency roughly 4-5x during a typical drag at the default zoom level"
    ]
  },
  {
    createdAt: 1788028966835,
    introducedIn: "2026.08.29.3",
    title: "Phones that couldn't run the 3D map now get a lighter 3D map instead of being dropped to 2D",
    why: "When the 3D map crashed a phone's browser, every retry used the exact same settings as the attempt that just died -- the only thing that ever got made cheaper was for one narrow kind of crash. So a device would fail twice identically and then be parked on the 2D map permanently, having never been offered a 3D map small enough to actually run. A session that played fine for a while and was then killed by the OS taught it nothing at all.",
    changes: [
      "After a 3D crash the map now retries at reduced quality (no antialiasing, lower resolution), then at minimum quality, before falling back to 2D",
      "At minimum quality the map only allocates as many tiles as your screen can actually show, instead of a fixed floor well above it",
      "A session that ran fine and was then killed by the OS mid-play now also steps the map down a level on the next load"
    ]
  },
  {
    createdAt: 1788036933966,
    introducedIn: "2026.08.29.4",
    title: "Panning the 3D map now glides instead of snapping tile by tile",
    why: "The 3D camera used to jump a whole tile at a time on every pan, since the camera position itself was never tracked between tiles -- only the world's position relative to a fixed camera. Between that and the terrain-rebuild stutter fixed just before this, panning read as choppy even on a good connection.",
    changes: [
      "Dragging the 3D map now moves the camera continuously instead of snapping a full tile at a time"
    ]
  },
  {
    createdAt: 1788037445121,
    introducedIn: "2026.08.29.4",
    title: "Fixed a gap in the reach-border overlay around freshly-explored ground",
    why: "The border overlay only drew its dashed line and boundary pylons around reach tiles the client had already visually revealed through fog of war -- a Relay Beacon (or any outpost/dock/town) whose granted reach extended past your current vision left a gap in the drawn border exactly where you hadn't looked yet, even though the server already recognized that ground as yours.",
    changes: [
      "The reach-border trace and its land/water filtering now use the server's authoritative reach set directly instead of only the tiles your client has already seen, so the border line and pylons draw correctly right up to the edge of newly-explored territory"
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
    createdAt: 1788034981589,
    introducedIn: "2026.08.29.4",
    title: "iPhones now start the 3D map at slightly lower quality to avoid a first-visit crash",
    why: "iOS Safari is reported to enforce a much tighter memory ceiling on WebGL content than desktop or Android, and every previous fix only kicked in after a phone had already crashed once and reloaded -- meaning every iPhone player's very first visit ran at the configuration most likely to crash it, before the app had any evidence to react to.",
    changes: [
      "The 3D map on iPhone (and other iOS browsers) now starts without extra edge-smoothing on its very first attempt, instead of only backing off after a crash",
      "A phone that proves it can run the full-quality 3D map is unaffected -- this only changes the untested first attempt"
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
    createdAt: 1788531647746,
    introducedIn: "2026.09.04.1",
    title: "3D map: a selected town's support tiles are now recessed glowing hatches instead of floating coins",
    why: "The floating gold/grey coin markers over a town's eight support tiles were a placeholder readout of whether each tile currently contributes gold. They've been replaced with the intended visualization: a recessed hatch with an ionic battery seated inside, matching the town's own art style. The battery and hatch rim now stay dark and powered-down on a tile you haven't settled yet, and light up once you settle it and it starts contributing -- the same information the coins carried, read at a glance from the tile itself instead of a coin hovering above it.",
    changes: [
      "3D map: support tiles around a selected town now show as a hatch with a battery cell that lights up once the tile is settled, replacing the old floating gold/grey coin markers"
    ]
  },
  {
    createdAt: 1788531700000,
    introducedIn: "2026.09.04.2",
    title: "2D map: a selected town's support tiles are now marked to match the 3D hatch overlay",
    why: "The 3D map's support-tile hatches had no 2D equivalent, so players on the 2D fallback renderer (older or lower-end devices) couldn't see which of a town's 8 support tiles were contributing gold at all.",
    changes: [
      "2D map: support tiles around a selected town now show a small brass-framed panel with a battery dot -- dark while unsettled, glowing amber once settled and contributing -- matching the 3D hatch overlay"
    ]
  }
];
