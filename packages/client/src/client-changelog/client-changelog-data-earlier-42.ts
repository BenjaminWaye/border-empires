// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_42: ClientChangelogEntry[] = [
  {
    createdAt: 1788802600000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.03",
    title: "Space View: every territory is now a full solar system, not a lone sphere",
    why: "Each Planet/Outpost in Space View rendered as one bare sphere floating in the void -- reasonable as a placeholder, but a thin stand-in for a galaxy of star systems. This gives every territory a proper system: a sun, and the real, interactive territory in orbit around it alongside a few purely decorative bodies, all slowly spinning.",
    changes: [
      "Every territory in Space View now renders as a small solar system: a sun at its center, with the real, clickable territory (colored by its owned/contested/other/frontier state, same as before) orbiting it",
      "2-4 additional decorative bodies (no gameplay data attached yet) orbit further out at their own speed and distance, so every system reads as a system rather than a single sphere",
      "A system you haven't charted (an \"Unknown\" fog-of-war marker) deliberately skips the sun and decorative bodies and stays a single dim point -- showing what orbits it before you've even surveyed it would leak information charting is supposed to earn"
    ]
  },
  {
    createdAt: 1788797564605, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.05",
    title: "Removed: attack cooldown on your own origin tile",
    why: "Players reported it as feeling like a bug: attacking from a tile, then immediately trying to attack again from that same tile, was rejected with \"origin tile is still on attack cooldown\" for a few seconds even though nothing else was happening there. Removed for now; may come back later in a clearer form.",
    changes: [
      "You can launch another attack from an origin tile you just attacked from without waiting out a cooldown",
      "Attacking the same target tile again while your previous attack on it is still resolving is unaffected -- that still shows \"tile locked in combat\"",
      "An origin tile still on lock because another player is fighting over it is also unaffected -- that still blocks with the same \"tile locked in combat\" message"
    ]
  },
  {
    createdAt: 1788800800000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.02",
    title: "The galaxy now has fog of war -- Scout missions reveal what's out there",
    why: "The whole public galaxy listing was fully visible to everyone from day one, which undercut Space View's own return hook (zooming out was re-reading a board you'd already read) and left the Scout hull's only job (peeking at a raid target's Garrison) too thin to justify a hull class. This ships the design doc's exploration system: a Scout mission now permanently Surveys its target, and until you've surveyed a system yourself, Space View shows it only as an unlabeled, unclaimed-looking marker.",
    changes: [
      "Sending a Scout-only fleet at a target now records a timestamped Surveyed snapshot (its Garrison and Stability) for you, in addition to the recon reveal you already got back from that one order",
      "Space View now shows any non-owned, non-contested system you haven't surveyed as an unlabeled \"Unknown\" marker instead of its real owner and name",
      "This is the Scout-mission half of exploration only -- passive vision from your own holdings' surrounding space, and the Deep Sensor Array Wonder, are deferred until the systems they depend on (a real spatial model, and Wonders) exist"
    ]
  },
  {
    createdAt: 1788798200000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.01",
    title: "Fleets are now reachable from Space View",
    why: "Galactic Fleets shipped as a backend-only slice with no way for a real player to use it -- building a fleet, sending it at a target, and reading the battle log only existed as raw HTTP endpoints. This adds the missing client surface: a Fleets panel inside Space View, next to Senate, Manage Planet, and Settings.",
    changes: [
      "New Fleets button in Space View opens a panel to compose a fleet from the five hull classes, pick a target from any publicly held territory other than your own, and send it",
      "The same panel lets you save and load reusable fleet compositions as named blueprints",
      "Your own fleets show their travel status and, once resolved, the raid's outcome (damage dealt and the target's resulting Stability, or a recon reveal for a Scout-only fleet)",
      "A public battle log shows every raid resolution galaxy-wide, regardless of who's watching",
      "Clear inline messages for the common failure cases: not enough Production, or an invalid target"
    ]
  }
];
