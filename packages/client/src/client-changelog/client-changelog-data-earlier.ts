// Older client-changelog entries, split out of client-changelog-data.ts to keep
// that file under the repo's 500-line cap (see the comment at its top). Same
// shape and rules apply here: unordered, append-only, frozen createdAt literals.
// client-changelog-data.ts merges this array into CLIENT_CHANGELOG_ENTRIES.
//
// Entries here are still bound by the "latest week only" rule enforced in
// client-changelog.test.ts — this file exists purely to keep
// client-changelog-data.ts under its line cap when the current week has a lot
// of entries, not as a permanent archive. Prune entries here once they fall
// outside the trailing week, same as in client-changelog-data.ts.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER: ClientChangelogEntry[] = [
  {
    createdAt: 1787817717886, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.27",
    title: "Fixed frontier tiles falsely glowing amber after panning the map",
    why: "The decay-countdown pulse writes its amber tint straight into the ownership overlay's GPU color buffer every frame, separately from the buffer's own rebuild-on-pan color update. Both writers shared one pending-upload list, and the pulse's per-frame bookkeeping was clearing that list before the rebuild's own full-buffer update reached the GPU whenever a pan/zoom rebuild and a pulse tick landed in the same frame. Any frontier tile that a rebuild reassigned to a vertex slot the pulse didn't touch that frame kept whatever color the GPU already had there from a previous tile -- including, e.g., another empire's amber decay pulse -- until the next rebuild happened to also touch that exact slot.",
    changes: [
      "Panning or zooming the map over frontier tiles no longer occasionally leaves random, non-decaying tiles stuck glowing amber like the frontier-decay pulse."
    ]
  },
  {
    createdAt: 1787904636695, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.2",
    title: "Fixed waypoints and build/settle queue entries still vanishing on some reconnects",
    why: "The previous two fixes for this pushed a live update whenever a waypoint or build/settle queue entry changed, but the server's own fast-reconnect snapshot cache -- a separate copy of the merge logic used to serve a quick reconnect without rebuilding your whole world state -- had never been taught about these two fields at all, so it silently dropped them regardless of the live update. This mattered most exactly when the earlier fixes couldn't help: while you were offline (no live connection to push an update to), your waypoint or queue kept working correctly on the server, but a reconnect could still be served a snapshot from before it existed.",
    changes: [
      "The server's fast-reconnect snapshot now correctly includes your current waypoint and build/settle queues in every case, including right after a period offline."
    ]
  },
  {
    createdAt: 1788161879677, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29",
    title: "Your event log and logistics throughput now reliably stay current after a reconnect",
    why: "The server keeps a fast-reconnect cache of your empire's state so logging back in doesn't always require a full rebuild. That cache was patched from two separate, hand-maintained copies of the same merge logic (one on the game server, one on the connection gateway), and they'd already drifted more than once -- most recently, your recent-events log and logistics throughput number were both being sent live but silently dropped by the cache merge, so a reconnect served from that cache could show a stale or missing recent-events feed and logistics number even though the server's real state was correct.",
    changes: [
      "Unified the two copies of this merge logic into one, and fixed the event log and logistics throughput gaps found in the process -- both now reliably carry through a reconnect."
    ]
  },
  {
    createdAt: 1788029295167, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.3",
    title: "Attacking a fort now costs a random amount tied to its size, not to whether you won",
    why: "Manpower lost attacking always cost a small flat fraction on a win and a much larger fraction on a loss -- the same direction the power gap already pushes win chance, so a strong empire attacking a weaker one paid less per win on top of already winning more often, while a weaker empire that dared to fight back paid more on top of already being unlikely to win. That compounded the rich-get-richer effect instead of counterbalancing it.",
    changes: [
      "Manpower lost attacking a SETTLED tile is now a random amount within a range set by the target's fortification, regardless of whether the attack wins or loses: no fort 40-60, Palisade 100-150, Fort 200-300, Titanium Bastion 350-480, Thunder Bastion 800-960",
      "The manpower you must have mustered to launch the attack now matches that range's top end, and is set purely by the target's fort tier -- no longer scaled by how full the fort's garrison happens to be (garrison fill still affects the fort's defense strength itself, just not the muster gate)"
    ]
  },
  {
    createdAt: 1788029286599, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.3",
    title: "\"Cancel Waypoint\" now cancels only the selected waypoint, not the whole queue",
    why: "The Cancel Waypoint button in a tile's action menu always wiped the player's entire waypoint queue, even though it was opened on one specific waypoint's target tile -- so cancelling a single leg of a multi-waypoint route silently dropped every other queued waypoint too.",
    changes: [
      "Cancel Waypoint now cancels only the waypoint targeting the tile you opened the menu on, leaving the rest of your queued waypoints intact"
    ]
  },
  {
    createdAt: 1788015703861, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.2",
    title: "Mercantile Charter's bonus now shows up on your first three towns",
    why: "Mercantile Charter's +50% gold / +25% population growth was already being applied to your first three towns' production and growth, but the bonus was never put on the tile overview's modifier list -- so it worked invisibly, with nothing on screen telling you it was there.",
    changes: [
      "The tile overview now shows a \"First 3 towns\" line for gold production and population growth on any of your first three towns while you hold Mercantile Charter"
    ]
  },
  {
    createdAt: 1787999267694, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.1",
    title: "Fort and Relay Beacon can now share a tile, and Relay Beacon no longer boosts attacks",
    why: "Fort and Relay Beacon used to fight over the same tile slot, forcing a choice between defense and the beacon's vision/offense utility, while also linking Relay Beacon to the Siege Outpost through an in-place upgrade. Splitting them apart lets defensive and vision play develop independently.",
    changes: [
      "A Fort and a Relay Beacon can now both be built on the same tile, in either order",
      "Relay Beacon no longer grants an attack multiplier (it keeps its local vision bonus)",
      "Building a Siege Outpost on a tile with a Relay Beacon is no longer an in-place upgrade of the beacon -- the two are now unrelated"
    ]
  }
];
