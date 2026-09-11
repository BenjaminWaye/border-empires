// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_41: ClientChangelogEntry[] = [
  {
    createdAt: 1788643300000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.05.03",
    title: "Galactic Fleets and raids (backend only -- not reachable from the UI yet)",
    why: "The galactic meta-layer's Senate could already force a territory's Stability to 0 and even spin up a Defense Campaign for it, but there was still no actual military option in the galaxy -- Fleets were the one core system from the design doc that didn't exist at all. This ships a first backend slice: build a fleet from the doc's hull classes (Scout/Raider/Battleline/Dreadnought/Tanker), send it at a held territory, and once its travel time elapses it automatically resolves as a raid against that territory's Stability, net of any Garrison Production invested there. There is no client UI for any of this yet -- it's reachable only via new HTTP endpoints -- so no real player can trigger it today; this entry exists only because the changelog gate covers server behavior changes too.",
    changes: [
      "New endpoints: POST /hq/galaxy/fleets/blueprints (save a reusable composition), GET /hq/galaxy/fleets/blueprints, DELETE /hq/galaxy/fleets/blueprints/:id, POST /hq/galaxy/fleets/send (launch a fleet at a held territory, costing Production), GET /hq/galaxy/fleets (your own fleet orders), GET /hq/galaxy/fleets/log (the public battle log), POST /hq/galaxy/garrison/invest (spend Production on a territory's standing defense)",
      "A fleet's travel time is set by its slowest hull -- a Scout arrives fast, a Dreadnought is slow enough to give the defender a real window to react, matching the design doc's intent",
      "A raid deals damage equal to its committed Production 1:1, absorbed first by the target's Garrison up to its own value, with the remainder forced onto the target's Stability -- hitting 0 enqueues a Defense Campaign for it, same as a passed Senate CONTEST",
      "A fleet made up only of Scouts (or Scouts plus Tankers) is a pure recon mission -- it reveals the target's current Garrison instead of dealing damage",
      "Every raid resolution posts to a new public battle log (attacker, defender, outcome), regardless of who's watching",
      "Exploration/fog-of-war (the design doc's other half of this build phase) is deliberately not included in this pass -- a raid targets a territory the sender already knows about from the public galaxy listing"
    ]
  },
  {
    createdAt: 1788641189774, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.05.03",
    title: "Setting a waypoint on a dock across the water now sails there instead of marching overland",
    why: "Clicking a dock linked to one of your own docks planted the flag but planned an overland expand chain from whichever tile of yours happened to sit closest to it, pushing the whole chain through undiscovered ground rather than taking the free sea crossing you already own. The route planner scored candidate routes by straight-line distance to the target, which knows nothing about dock links, so it locked in the first land route it stumbled onto before the much cheaper dock crossing was ever considered.",
    changes: [
      "A waypoint on a dock connected to a dock you own now plans the sea crossing as its first step, so the expansion starts on that dock and settles outward from there instead of walking a long chain of claims through unexplored terrain"
    ]
  },
  {
    createdAt: 1788640977095, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.05.03",
    title: "Aether Wall gets real 3D pylons, strung with pulsing electricity, on the true-3D map",
    why: "Aether Wall's glowing barrier segments only ever rendered as flat 2D pylon icons, painted over the 3D scene the same way they'd be painted over the old 2D map -- everyone else's abilities (like Aether Bridge) got physical 3D anchors, but Aether Wall's endpoints still looked like sprites floating over the terrain when the true-3D renderer was active, with nothing visibly linking them.",
    changes: [
      "On the true-3D map, each Aether Wall segment's endpoints are now real frosted-crystal pylons standing on the terrain instead of flat 2D icons",
      "Each pair of pylons along the wall is now joined by a jittering, pulsing electric arc, so the barrier reads as a live current instead of two disconnected props",
      "The wall's glowing beam itself is unchanged in both renderers; the 2D map's flat pylon icons are unchanged too"
    ]
  },
  {
    createdAt: 1788639424368, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.05.02",
    title: "Aether Bridge, Siphon, Worldbreaker Shot, Sky Dock Bombard and Aether Wall are usable again",
    why: "Those five crystal actions still checked your CRYSTAL stockpile before arming. But crystal (like food, titanium and umbrite) stopped being stockpiled when resource slots came in -- your balance is now always zero, and the server charges resource slots instead. So every click was refused with \"needs 30 CRYSTAL\" (or 15, 500, 1 and 25), which also spammed the feed every time you tried.",
    changes: [
      "Arming Aether Bridge, Siphon, Worldbreaker Shot, Sky Dock Bombard or Aether Wall no longer fails on a crystal balance you can never accumulate",
      "The repeated \"needs N CRYSTAL\" feed warnings are gone",
      "Real costs are unchanged: tech unlocks, resource slots, cooldowns, and Worldbreaker Shot's 1,000 gold all still apply"
    ]
  }
];
