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
    createdAt: 1787724118006, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.1",
    title: "Rally-linked players now spawn near a real foothold, not just the nearest empty tile",
    why: "Joining via a friend's rally link placed you on whichever open tile happened to be closest to their anchor, even a barren one with no town or food nearby -- while a normal spawn always looked for a town and food within reach.",
    changes: [
      "Rally spawns now search outward from the anchor for a spot with both a town and food nearby before falling back to a town-only, then food-only, then any-open-tile spot, all still within the rally radius"
    ]
  },
  {
    createdAt: 1787692481411, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.8",
    title: "Gave the \"join now\" season prompt a real intro instead of a bare confirmation dialog",
    why: "The plain join-season overlay (season already live, player just hasn't clicked join yet) read as a placeholder-y \"Join Season season-23?\" dialog with a static \"Ready\" dial that did nothing -- no sense of occasion for what's actually your empire's founding moment.",
    changes: [
      "Replaced the title/summary with narrative flavor text introducing the season",
      "Removed the static \"Ready\" dial and turned the confirm button itself into the focal call-to-action, relabeled \"Let's go!\""
    ]
  },
  {
    createdAt: 1787688556298, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.5",
    title: "Hid the redundant \"0 gold\" in the Build Relay Beacon action cost",
    why: "The Build Relay Beacon action's cost string always prepended the gold cost, even when expand + settle + build all cost 0 gold, so the Actions tab showed a confusing \"0 gold, N m.p. ...\" line.",
    changes: [
      "The Build Relay Beacon action's cost text now omits the gold segment entirely when the gold cost is 0."
    ]
  },
  {
    createdAt: 1787688715010, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.6",
    title: "Fixed the water skirt wall leaving a gap at wave crests",
    why: "The water skirt wall added moments earlier (2026.08.25.5) closed the black gap under coastal sea tiles, but its top edge was drawn once and never touched again, while the water surface itself bobs up and down every frame with the wave animation. Whenever the wave lifted the surface above the skirt's static top, the same black gap reappeared.",
    changes: [
      "The water skirt's top edge now rides the same wave animation as the surface, so it stays flush with the water at every frame instead of only when the sea happens to be at rest."
    ]
  },
  {
    createdAt: 1787689171531, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.6",
    title: "Fixed auto-settle trying to build on resource tiles outside your reach",
    why: "The auto-settle queue included every owned frontier tile with a resource, town, or dock without checking reach, so a plain resource tile (which generates no reach of its own) claimed outside your reach border kept getting re-queued and rejected with an OUT_OF_REACH error.",
    changes: ["Auto-settle no longer queues frontier tiles that are currently outside your reach border."]
  },
  {
    createdAt: 1787691972634, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.6",
    title: "Town population bar now shows progress toward the next tier",
    why: "The town overview's population bar showed current population against the town's absolute population cap, which barely moved even as a town grew and gave no sense of how close it was to upgrading tiers.",
    changes: [
      "The population bar and its number now track progress toward the next population tier (e.g. Town → City) instead of the absolute population cap, and turns green once that tier's threshold is reached."
    ]
  },
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
    createdAt: 1787687420759, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.4",
    title: "Reverted the crisp border-ribbon prototype on the 3D ownership overlay",
    why: "The prototype border ribbon along exposed territory edges (#1474) didn't read well in practice -- pulled back out to the flat fill-tint look while a better edge treatment is worked out.",
    changes: [
      "3D territory tiles no longer draw a bright border ribbon along exposed edges; back to the fill-only look."
    ]
  },
  {
    createdAt: 1787682600000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.4",
    title: "Fixed the out-of-reach decay pulse jumping every time you panned the camera",
    why: "The amber/white frontier-decay countdown pulse was baked into the ownership overlay's mesh colors inside the same rebuild that also fires on every camera pan or zoom (not just on actual game-state changes), sampling the wall clock fresh each time -- so panning the map made the pulse visibly jump or restart instead of animating smoothly.",
    changes: [
      "The decay pulse now animates from a per-frame update independent of camera movement, the same pattern already used for the reach-border pylon animation -- it only reacts to the tile's actual decay state, never to panning or zooming."
    ]
  },
  {
    createdAt: 1787766405640, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.2",
    title: "Settle now works on a captured town or dock outside your reach",
    why: "A captured town or dock frontier tile (e.g. taken by Attack, which isn't reach-gated) could sit outside your reach border and keep getting rejected with \"tile is outside your reach\" every time Settle was attempted, even though settling it is exactly what would give it its own reach in the first place -- a Catch-22 that made some captured towns/docks permanently unsettleable.",
    changes: [
      "Settle no longer requires a captured town or dock tile to already be inside your reach -- only plain resource/support frontier tiles still need that."
    ]
  },
  {
    createdAt: 1787678904061, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.4",
    title: "Fixed \"Expand To\" being blocked on tiles outside your reach again",
    why: "Expand was opened up to out-of-reach frontier tiles (claimed land there just decays after 2 minutes unless your reach catches up), but a later change restored an OUT_OF_REACH server rejection for EXPAND without updating the client, so \"Expand To\" silently failed or wasn't offered on tiles adjacent to your border but outside your town/outpost's fixed reach radius.",
    changes: [
      "EXPAND is no longer reach-gated server-side. Claiming land outside your reach is allowed again, at the risk of it decaying back to neutral if your reach doesn't catch up to it in time."
    ]
  },
  {
    createdAt: 1787749806338, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.2",
    title: "AI empires can now unblock growth when out of FOOD slots",
    why: "When an AI ran completely out of FOOD slots with no Farmstead/Waterworks/Granary build available to grow more, it had no way out -- every FOOD-costing build (including a new Relay Beacon, which is the AI's only path to claim more farmland) stayed permanently illegal, so a starved AI empire would just get stuck forever instead of expanding its way out of the shortage.",
    changes: [
      "An AI empire that's fully out of FOOD slots, with no direct way to grow more, will now disable one of its own Relay Beacons that isn't covering any resources to free up the slot for further growth.",
      "This is always a reversible disable, never a demolition -- the building stays intact and can be re-enabled once FOOD has headroom again."
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
    createdAt: 1787689447704, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.7",
    title: "Fixed flickering at the coastline where the water and land skirts overlapped",
    why: "The water skirt wall added in 2026.08.25.5/.6 drew a wall on all 4 sides of every exposed water tile, including north/east/west edges that sat right where the land's own coastal skirt wall already runs. Two near-coplanar unlit walls animating independently z-fought against each other every frame, flickering.",
    changes: [
      "The water skirt now only draws its south-facing edge (the side that actually faces the camera at the default view angle), leaving the land skirt to cover the other three sides instead of overlapping it."
    ]
  },
];
