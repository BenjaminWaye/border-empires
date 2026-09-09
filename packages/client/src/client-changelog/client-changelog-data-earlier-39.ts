// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_39: ClientChangelogEntry[] = [
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
  },
  {
    createdAt: 1788565039861, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.14",
    title: "March flags now show real troop movement while fighting through neutral ground toward their target",
    why: "A MARCH-mode muster flag with no attackable enemy tile in range falls back to expanding onto the nearest neutral tile blocking the route to its target, making real progress toward it every tick. But that fallback's ACTION_ACCEPTED broadcast was silently dropped client-side -- this client never submitted the auto-fired command, so it had no matching in-flight action for the normal gate to bind it to -- unlike the equivalent ATTACK-mode fallback, which already gets a second chance via COMBAT_START. The result: a March flag chewing through neutral land toward its target looked completely stationary, indistinguishable from one that was actually stuck.",
    changes: [
      "A March flag's neutral-tile expansion toward its target now draws the same marching/travel visual an Advance or March attack already gets, in both the 3D and 2D map renderers",
      "The 2D map's supply-line overlay now also covers Advance/March auto-fire moves directly (previously it only found them via an Advance-only fallback lookup, missing March mode and any neutral-tile expansion leg entirely)"
    ]
  },
  {
    createdAt: 1788558265905, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.14",
    title: "Building a structure on a forest tile now clears its trees in the true-3D renderer too",
    why: "The true-3D renderer added a forest instance to every forest tile unconditionally, with no regard for whether an economic structure had since been built there -- so trees kept showing through/around a built structure in 3D even though the 2D canvas renderer already correctly clears them (its structure sprite paints over the tile). The two renderers disagreed on what a built forest tile should look like.",
    changes: [
      "The true-3D renderer no longer places a forest tree instance on a tile once an economic structure is built there, matching the 2D renderer's existing behavior"
    ]
  },
  {
    createdAt: 1788555326849, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.13",
    title: "Attacks that couldn't stage a new muster flag, or whose staged flag wasn't right on the border, now still launch",
    why: "Attacking an enemy-owned tile with no adjacent or remotely-funded ready flag nearby makes the client auto-create a fresh muster flag on your origin tile to stage the attack. If you were already at your muster-flag cap, that auto-create was silently rejected with MUSTER_LIMIT and the attack just sat parked until a 5-second timeout cancelled it outright. Separately, a staged attack only ever launched once its funding flag literally bordered the enemy tile, even though the server funds an ATTACK from any owned flag within 10 tiles of wherever you're actually attacking from -- the same remote-funding range ADVANCE auto-fire already relies on -- so a flag a few tiles back that had already filled up never got used.",
    changes: [
      "When staging a new muster flag for an attack hits the muster-flag cap, the attack now reroutes onto your closest usable existing flag and waits for it to fill/march instead of being cancelled",
      "A staged attack now also launches once any owned flag within remote-funding range of your attacking tile is ready, not only one standing directly on the enemy's border",
      "A feed message now explains when a reroute happens, naming which existing flag the attack will use"
    ]
  },
  {
    createdAt: 1788554890356, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.13",
    title: "Aether Purge is now actually blocked by a defending Aether Tower",
    why: "The only real check AETHER_LANCE (\"Aether Purge\") ran server-side was for an enemy Aegis Dome -- an enemy Aether Tower's protection was purely a client-side courtesy that only decided what a well-behaved client greyed out as untargetable, so it never stopped the ability from actually landing. A target within a defending, active, off-cooldown Aether Tower's protection radius could still be purged.",
    changes: [
      "AETHER_LANCE (Aether Purge) now rejects server-side when the target is within an enemy's active, off-cooldown, non-dormant Aether Tower's protection radius, matching what the client already implied was true"
    ]
  },
  {
    createdAt: 1788522282038, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.2",
    title: "Researching Grand Bazaars, Grand Levy Doctrine, and other Aether Tower-powered techs also unlocks the Ambaric Transformer Station",
    why: "Imperial Exchange, Titanium Levy, World Engine, Aegis Dome, Astral Dock, Airport, and Radar System all need a nearby active Ambaric Transformer Station (Aether Tower) to power their abilities -- but the tower's own tech (Ambaric Engineering) lived in a completely separate branch (plastics/industrial-extraction) from any of theirs. A player could research and build one of those seven, then find its ability permanently unusable unless they also detoured through an entire unrelated tech branch just to be able to build the tower it needs power from, with no warning anywhere in the tech tree that the two were linked.",
    changes: [
      "Researching any of Grand Bazaars, Grand Levy Doctrine, Worldbreaker Doctrine, Aegis Doctrine, Astral Doctrine, Sky Vessel Engineering, or Resonance Detection now also unlocks the Ambaric Transformer Station for free, immediately",
      "Ambaric Engineering is no longer a separate, standalone tech to research on its own -- it's only ever granted as part of researching one of the 7 techs above",
      "Each of those 7 techs now shows an \"Aether Tower\" tag on its tech-tree card, so it's visible up front that researching it also unlocks the Ambaric Transformer Station"
    ]
  },
  {
    createdAt: 1788552677550, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.5",
    title: "MARCH mustering flags now claim neutral ground blocking their route, instead of idling",
    why: "MARCH auto-fire only ever attacked enemy tiles reachable through territory you already owned -- if the route to your march target ran through unclaimed land instead of an enemy border, the flag just idled, even though claiming that ground was exactly what a player would do by hand to keep advancing.",
    changes: [
      "A MARCH flag now expands onto a neutral tile blocking its route to the target when no enemy tile is reachable at all, instead of idling -- an attackable enemy tile still always wins over expanding when both are reachable",
      "Every command a MARCH (or ADVANCE) flag issues -- attacks and, now, expands alike -- is attributed to the flag's own tile for mechanical travel-time purposes, so an expand claimed by a MARCH flag takes real time to complete just like an attack does, rather than resolving instantly regardless of distance"
    ]
  },
  {
    createdAt: 1788553008691, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.12",
    title: "Aether Tower descriptions now show the protection radius and cooldown caveat",
    why: "The Aether Tower's build tooltip and tile-menu status line both claimed it \"blocks hostile crystal actions nearby\" without ever stating the radius, and without saying that the block only applies while the tower is off cooldown -- pickReadyOwnedObservatoryForTarget/hostileObservatoryProtectingTileAt already skip a tower on cooldown when computing protection, so an owner reading the old copy could reasonably assume a nearby tower always shields them, even mid-cooldown, and be surprised when an Aether Purge went through.",
    changes: [
      "Aether Tower's build tooltip now states its exact protection radius",
      "The tile-menu status line for an active Aether Tower now says explicitly when it is on cooldown and therefore not currently blocking hostile crystal actions"
    ]
  },
  {
    createdAt: 1788552669215, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.12",
    title: "Captured forts and economic structures now auto-settle",
    why: "A captured tile always landed as Frontier, and a Frontier tile's fort or economic structure produces no income and is barely defensible -- so a captured building sat idle until you remembered to manually Settle it. Towns and docks already had this problem solved for the out-of-reach case; this extends the same auto-settle behavior to any captured building, on any capture.",
    changes: [
      "A captured fort, observatory, or economic structure now tries to auto-settle immediately, at the same manpower/points cost and development-slot requirement as a manual Settle",
      "If you can't afford it or have no free development slot, the tile falls back to landing Frontier as before, so you can settle it manually once you're able to"
    ]
  },
  {
    createdAt: 1788954892105, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.09.07",
    title: "Great Cities gain a second build ring; every population-tier upgrade's income/manpower bonus is halved; upgrade buttons now show their bonus",
    why: "Great City-tier towns had the same 8-tile build ring as every other tier despite their much larger population, and every population-tier upgrade's income and manpower jump was large enough to make lower tiers feel unrewarding by comparison. The upgrade button also never told you what you'd actually get for your gold.",
    changes: [
      "Reaching Great City (or Metropolis) now doubles a town's build ring outward to a second ring of tiles (24 build tiles total instead of 8), letting more support structures feed it",
      "Every population-tier upgrade's gold income and manpower cap/regen bonus is halved relative to the previous tier -- Town +0%/+75 manpower (unchanged income), City +25% income/+150 manpower, Great City +75% income/+300 manpower, Metropolis +110% income/+600 manpower, each stacking on the previous tier's already-halved value",
      "The \"Upgrade Town\" tile action now spells out the income %, manpower cap, and manpower regen you'll get, plus a note when the upgrade adds a second build ring"
    ]
  },
];
