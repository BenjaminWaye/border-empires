// Changelog entry data only, split out from client-changelog.ts (rendering/
// visibility) to keep that file under the 500-line cap. Entries are unordered —
// client-changelog.ts sorts by createdAt. Move old entries to
// client-changelog-data-earlier.ts when this file approaches the cap.
import { CLIENT_CHANGELOG_ENTRIES_EARLIER } from "./client-changelog-data-earlier.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_2 } from "./client-changelog-data-earlier-2.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_3 } from "./client-changelog-data-earlier-3.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_4 } from "./client-changelog-data-earlier-4.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_5 } from "./client-changelog-data-earlier-5.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_7 } from "./client-changelog-data-earlier-7.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_8 } from "./client-changelog-data-earlier-8.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_9 } from "./client-changelog-data-earlier-9.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_10 } from "./client-changelog-data-earlier-10.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_11 } from "./client-changelog-data-earlier-11.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_12 } from "./client-changelog-data-earlier-12.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_14 } from "./client-changelog-data-earlier-14.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_15 } from "./client-changelog-data-earlier-15.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_16 } from "./client-changelog-data-earlier-16.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_17 } from "./client-changelog-data-earlier-17.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_18 } from "./client-changelog-data-earlier-18.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_19 } from "./client-changelog-data-earlier-19.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_20 } from "./client-changelog-data-earlier-20.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_21 } from "./client-changelog-data-earlier-21.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_22 } from "./client-changelog-data-earlier-22.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_23 } from "./client-changelog-data-earlier-23.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_24 } from "./client-changelog-data-earlier-24.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_25 } from "./client-changelog-data-earlier-25.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_26 } from "./client-changelog-data-earlier-26.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_27 } from "./client-changelog-data-earlier-27.js";
export type ClientChangelogEntry = {
  createdAt: number; // Unix ms. Use a frozen literal (check:client-changelog rejects Date.now()).
  introducedIn: string;
  title: string;
  why: string;
  changes: string[];
};
// Add a new entry for every user-facing client release; client-changelog.ts sorts by createdAt.
const RECENT_CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
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
  },
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
    createdAt: 1788534052315, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.4",
    title: "Aether Purge alerts now show the attacker's real display name",
    why: "The simulation never learns a player's real display name -- ATTACK_ALERT already got its attackerName patched up to the attacker's live profile name at the gateway, but AETHER_PURGE_ALERT was left out of that same hydration path, so a purge from a player with a set display name still showed the anonymized \"Empire XXXXXX\" fallback in both the in-app alert and the email.",
    changes: [
      "Aether Purge in-app alerts and emails now show the attacker's real display name when they have one set, instead of always falling back to an anonymized Empire ID"
    ]
  },
  {
    createdAt: 1788511900000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.11",
    title: "The Galactic Senate is now reachable from Space View",
    why: "The Senate backend (Galactic Senate v1) shipped with no way for a real player to use it -- proposing and voting only existed as raw HTTP endpoints. This adds the missing client surface: a Senate panel inside Space View, next to Manage Planet and Settings.",
    changes: [
      "New Senate button in Space View opens a panel listing recent proposals and lets you cast a Dominion-weighted vote on any still-pending one",
      "The same panel lets you raise a new Embargo or Contest proposal against any publicly held territory other than your own",
      "Clear inline messages for the common failure cases: not enough Influence, not a Planet-holder, target on cooldown, or already voted"
    ]
  },
  {
    createdAt: 1788511800000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.10",
    title: "Defense Campaign seasons now actually spin up and transfer ownership",
    why: "A passed Senate CONTEST vote already forced a territory's Stability to 0, but nothing turned that into a real consequence -- no season ever opened to fight over it, so a Contest was a permanent, un-actionable stability hit rather than the reopened-territory mechanic the design intends. This wires up the missing half: contested territories now automatically queue for and spin up as real seasons, and winning one transfers ownership going forward.",
    changes: [
      "A passed CONTEST now also queues its target territory for a Defense Campaign season, in addition to zeroing its Stability",
      "The natural end-of-season rollover now automatically opens a Defense Campaign season for the oldest queued target roughly two out of every three times a new season starts, reserving the remaining slot for a fresh Frontier campaign",
      "Winning a Defense Campaign season transfers ownership of the original contested territory to you going forward -- it shows up under your held Planets, and its Stability resets to full under your ownership",
      "Planet naming rights are not affected by a Defense Campaign transfer -- they permanently stay with whoever first won and named that territory"
    ]
  },
  {
    createdAt: 1788504160127, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.3",
    title: "Fixed enemies keeping settled tiles inside your own borders after a server restart",
    why: "Your reach border isn't saved -- it's rebuilt from your towns/outposts/docks every time the server restarts. That rebuild was skipping the contest that normally decides who keeps contested ground, so if your reach covered a tile a rival held settled, the border quietly became yours while the tile itself stayed theirs. Nothing ever reconciled the two, and because the rebuild ran the same way on every restart, it re-created the same split every time -- leaving rivals parked on settled tiles (resource deposits included) deep inside your border indefinitely.",
    changes: [
      "The border rebuild on server start now runs the same contest a live border push does: a rival settled tile your reach covers is either left alone because they still cover it themselves, or taken and reverted to frontier -- no more permanent split between who owns a tile and who owns the border under it",
      "Existing tiles stuck in that state are reconciled automatically on the next server start"
    ]
  },
  {
    createdAt: 1788503276365, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.2",
    title: "MARCH mustering flags now show the marching-company visualization too",
    why: "MARCH-mode auto-fire attacks already got the mechanical travel-time delay, but the client only ever recognized ADVANCE's own command prefix as a server-dispatched muster attack -- so a MARCH flag's attack never got a skirmish overlay or a marching company on the map, even though the same march was genuinely happening.",
    changes: [
      "MARCH auto-fire attacks now show the same marching-company overlay and pre-resolution skirmish ADVANCE auto-fire attacks already show"
    ]
  },
  {
    createdAt: 1788469315776, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.6",
    title: "Manage Planet no longer gets buried behind the Space View screen",
    why: "The Space View launcher and full-screen map were mounted as siblings of the HUD element instead of inside it, so their z-index always painted above the HUD's entire stacking context -- including the Manage Planet overlay, which lives inside the HUD so it can layer correctly against other HUD overlays. Opening Manage Planet from within Space View rendered it underneath the Space View screen, invisible until Space View was closed.",
    changes: [
      "Manage Planet now opens on top of the Space View screen as intended, instead of being hidden behind it until you leave Space View"
    ]
  },
  {
    createdAt: 1788499023922, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.1",
    title: "ADVANCE and MARCH mustering flags now have real travel time too",
    why: "Manually-clicked attacks got real travel time and a marching-company visualization, but a flag's own ADVANCE/MARCH auto-fire attacks still resolved the instant the server dispatched them -- geography had no bearing on when an auto-fired attack landed, and there was nothing to see beforehand. Auto-fire is dispatched by the server with no client-side send delay to wait on, so this had to be a genuine mechanical delay in the server's own combat timing, not just a client-side wait.",
    changes: [
      "An ADVANCE/MARCH flag's auto-fired attack now waits for its funding flag's company to reach the front before combat resolves, at the same per-tile rate manual attacks already use",
      "The true-3D map now shows that march too: the same marching-company overlay manual attacks get, now also playing for ADVANCE auto-fire",
      "MARCH-mode auto-fire gets the same mechanical delay, but not yet the marching visualization -- MARCH attacks have no skirmish overlay at all client-side yet, a separate pre-existing gap"
    ]
  },
  {
    createdAt: 1788470470712, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.6",
    title: "Mustering flags now have real travel time -- and you can watch the company march there",
    why: "A muster-funded attack used to fire the instant you clicked it, no matter how far the funding flag actually was from the fight -- geography had no bearing on when an attack landed, and there was nothing to see between clicking and the 30-second siege starting. Manual attacks now genuinely wait for the flag's company to reach the front before the attack is even sent, and the true-3D map shows that march happening -- a company of dots walking the real tile-by-tile route from the flag to the target tile, dashing across any dock crossing along the way.",
    changes: [
      "A muster-funded manual attack now marches for real: the ATTACK isn't sent to the server (and its 30s combat lock doesn't start) until the funding flag's company actually reaches the front, instead of firing the instant you click",
      "The true-3D map now shows that march: a company of dots walks the real tile-by-tile route from your flag to the target, bending around corners and dashing across dock crossings, instead of no visualization at all",
      "ADVANCE/MARCH auto-fire attacks are unaffected -- this only changes manually-clicked attacks funded by a ready muster flag",
      "3D-renderer only for now -- the 2D canvas map fallback has no muster visualization of any kind yet, matching its existing gap for muster flags in general"
    ]
  },
  {
    createdAt: 1788469608148, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.6",
    title: "Fixed two hovering map badges that stopped appearing: town upgrade-ready and Aether Tower cooldown",
    why: "The town's upgrade-ready badge was computed correctly by the simulation but stripped out before reaching any client by a snapshot field allowlist, so it never showed for anyone, including the town's own owner. Separately, the Aether Tower's crystal-cooldown badge was still being added to the scene every frame, but the badge's float height was never raised when the Aether Tower got its full 3D model, so the badge ended up floating inside the tower's own solid geometry and was invisible even though the paused countdown in the tile overview was correct the whole time.",
    changes: [
      "The town upgrade-ready badge now correctly appears over any of your towns eligible to upgrade to the next population tier.",
      "The Aether Tower's recharging badge now floats above the tower instead of inside it, so it's visible again while the tower is on cooldown."
    ]
  },
  {
    createdAt: 1788468575080, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.5",
    title: "Fort no longer blocks building an Aether Tower on the same tile",
    why: "A Fort was rejecting every other structure build on its tile except a Relay Beacon, including the Aether Tower (Observatory) -- but a Fort and a Siege Outpost are the only structures that genuinely can't share a tile field. Aether Tower belongs on its own tile field and has no real conflict with a Fort.",
    changes: [
      "You can now build an Aether Tower on a tile that already has a Fort. A Siege Outpost still can't be built on a Fort tile."
    ]
  },
  {
    createdAt: 1788458684672, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.4",
    title: "ADVANCE mustering flags now strike the nearest enemy tile, not just whichever one the search reaches first",
    why: "ADVANCE auto-fire used to stop its search the instant it found any attackable enemy tile, so once nearby fronts were locked by other combat (including your own sibling flags) it could keep walking through your territory and end up firing on a tile far across your empire, simply because that was the first unlocked tile it happened to reach -- even when a genuinely closer target existed nearby.",
    changes: [
      "ADVANCE auto-fire now compares every reachable attackable enemy tile and strikes the one nearest the flag instead of the first one its search encounters",
      "Added a hard range cap: if the nearest reachable target is too far away (every closer front locked or contested), the flag idles instead of launching a moon-shot attack on the far side of the map",
      "The range cap is measured in hops through owned territory, not raw map distance, so a flag on a dock is still not penalized for a legitimate cross-water strike"
    ]
  },
  {
    createdAt: 1788462934856, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.4",
    title: "Fixed being able to build more than one of the same monument component",
    why: "Each monument component (e.g. Imperial Exchange's Golden Ledger) is meant to be a unique one-of -- a player assembles exactly one of each of a monument's 3 parts before the monument itself can go up. Nothing stopped building the same part type on multiple tiles instead of building the other two, so a player could stockpile duplicates of one part and never actually assemble the monument. The build menu also didn't warn about this until the server rejected the command.",
    changes: [
      "Building a monument component you already own (anywhere, active or still under construction) is now rejected server-side",
      "The build menu button for a component you already own is now disabled up front and shows \"Part already built in nearby town\" instead of only failing after you submit"
    ]
  },
  {
    createdAt: 1788434136633, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.3",
    title: "Fixed muster flags surviving on tiles you just captured deep in enemy territory",
    why: "ATTACK only requires your origin tile to be owned, not the target to be inside your own live vision -- so a raid chained through your own previously-claimed (possibly out-of-reach) frontier ground could capture a tile you have no coverage of at all. The server always destroyed the defender's muster flag on capture, but the corrected tile update was only ever force-delivered to the defender who lost it, not to you as the attacker. If the newly-captured tile sat outside your own vision, your own game's normal visibility check silently dropped that update, leaving your client showing the enemy's stale muster flag on ground that was already yours.",
    changes: [
      "A captured tile's resolved state (ownership, and any muster flag being cleared) is now always force-delivered to the attacker as well as the previous owner, regardless of whether the tile is inside the attacker's own current vision"
    ]
  },
  {
    createdAt: 1788515318987, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.1",
    title: "Fixed a repeating \"tile already has structure\" error while queued buildings drain",
    why: "The server-side dev-queue auto-drain (which exists so queued builds/settles keep progressing while a player is offline) fired on every freed development slot regardless of whether the player's own client was connected and already draining the same queue -- so an online player's client and the server could both dispatch the same queued build. The loser hit a real BUILD_INVALID \"tile already has structure\" rejection once the winner's structure landed. The waypoint/expand queue already stands down while its owning client is online; the build/settle queue never got the equivalent guard.",
    changes: [
      "The server no longer auto-drains a player's build/settle queue while that player is online -- their own client now owns dispatch exclusively, the same as it already did for the waypoint/expand queue",
      "Queued builds no longer occasionally throw a spurious \"tile already has structure\" error toast"
    ]
  },
  {
    createdAt: 1788465026903, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.01",
    title: "Aether Towers can now be switched off and back on, like any other structure",
    why: "Every Aether Tower you own occupies CRYSTAL slots, and progressively more of them per tower -- the 1st costs 1 slot, the 2nd costs 2, and so on. Economic structures have always had an Enable/Disable switch for exactly this situation, but the tower had none: the only way to stop paying its CRYSTAL bill was to demolish it and lose the build cost. The tile menu's Disable button simply wasn't there for towers.",
    changes: [
      "An owned, finished Aether Tower now has Disable / Enable actions in its tile menu",
      "A disabled tower stops occupying CRYSTAL slots, stops giving its vision bonus, and stops powering crystal abilities and Sky Docks -- the tower itself stays built and can be switched back on at any time",
      "Disabling a tower also frees the progressive CRYSTAL rank behind it, so your remaining towers get cheaper, not just fewer"
    ]
  },
  {
    createdAt: 1788674152352, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.06.03",
    title: "Click a player's name to open their profile",
    why: "There was no way to see another player's standing at a glance -- their rank, tiles, income, and diplomatic status with you were scattered across the leaderboard and alliance panels with no single place to check before allying or attacking.",
    changes: [
      "Any player's name (leaderboard, alliances) is now clickable and opens a profile card with their rank/tiles/income/techs, alliance/truce status with you, and an oathbreaker badge if they've broken a truce this season",
      "The oathbreaker badge and broken-truce list only show on your own profile for now -- other players' truce-break history isn't broadcast yet"
    ]
  },
  {
    createdAt: 1788726355653, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.06.08",
    title: "Fixed: clicking a tile next to your connected dock no longer opens a menu instead of expanding",
    why: "Once you settle a dock, land next to its paired dock elsewhere on the map is supposed to instant-expand with one click, just like any tile bordering your territory -- but the click handler had dock-adjacency explicitly disabled, so those clicks always fell through to the tile menu instead.",
    changes: [
      "Clicking a neutral tile adjacent to your connected dock now claims it immediately, matching the one-click expand behavior of an ordinary bordering tile"
    ]
  },
  {
    createdAt: 1788765046899, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.03",
    title: "Aether Bridge now instantly claims its landing tile, if it's unowned",
    why: "Casting an Aether Bridge onto neutral land only opened a crossing lane onto the exact landing tile -- you still had to separately click and claim it, and the reach bonus it granted covered a wide area around the landing spot that you couldn't actually use without first securing that one tile anyway. That reach area was also permanent even after the bridge itself expired, unlike every other reach source in the game.",
    changes: [
      "Casting Aether Bridge onto genuinely unowned land now instantly claims the landing tile as your territory, the same free beachhead a captured dock gives -- landing on another player's territory is unaffected and still just opens an attack lane",
      "The bridge's reach bonus now covers only the landing tile itself, not a wider area, and withdraws once the bridge expires instead of staying granted forever -- an unclaimed landing tile past that point decays normally, like any other out-of-reach frontier claim"
    ]
  },
  {
    createdAt: 1788783720884, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.04",
    title: "Fixed: Aether Bridge landing on empty land near another player silently did nothing",
    why: "The instant-claim fix shipped earlier today skipped claiming the landing tile whenever another player's reach happened to cover that spot -- even when the ground itself was genuinely unowned by anyone. Reported live: a bridge cast onto empty land near a rival's town resolved successfully but never claimed anything, with no error shown.",
    changes: [
      "Aether Bridge now claims a genuinely unowned landing tile regardless of whose reach covers it -- it only ever declines to claim a tile another player actually owns"
    ]
  },
  {
    createdAt: 1788792846751, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.05",
    title: "Fixed: dock income display and Fort placement on Harbor Exchange docks",
    why: "Two Harbor Exchange (Customs House) bugs. First, a dock's tile-menu \"Dock income\" line always showed a flat per-dock constant -- it never reflected the connected-dock bonus or the Harbor Exchange bonus that the simulation actually pays out, so owners had no way to see the real payoff of connecting docks or building a Harbor Exchange. Second, Fort (and Palisade) could not be built on a dock tile that already had an active Harbor Exchange -- it was rejected as \"tile already has structure\", even though a Fort is explicitly allowed to share a tile with a Relay Beacon and there's no design reason Harbor Exchange should be treated differently.",
    changes: [
      "The tile menu's Dock income line now reflects the connected-dock bonus and the Harbor Exchange bonus, instead of a flat constant that ignored both",
      "Fort and Palisade can now be built on a dock tile that already has an active Harbor Exchange (Customs House) -- they share the tile, same as Fort already does with a Relay Beacon"
    ]
  },
  {
    createdAt: 1788792989599, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.06",
    title: "Fixed: muster flag ADVANCE/MARCH ignored active Aether Bridges, and battle result popped up before the fight animation finished",
    why: "Reported live: three muster flags next to a connected Aether Bridge fired ADVANCE at enemy tiles 50 tiles away instead of the ones just across the bridge, and a MARCH target on the far side made the flags try to expand around the bridge looking for a land route instead of crossing it. Separately, the battle-result popup could appear -- sometimes declaring a loss to counter-attack -- while the walking-arrow/skirmish animation hadn't finished (or hadn't even started) playing.",
    changes: [
      "ADVANCE and MARCH auto-fire now route through your active Aether Bridges the same way manual attacks and dock crossings already do, instead of only ever searching plain adjacency through owned territory",
      "A MARCH flag's own neutral-tile EXPAND (claiming empty ground on the way to its target) no longer plays the skirmish/clash animation -- claiming empty land isn't a fight, so the marching arrow now just comes to rest on the tile",
      "The battle result banner now waits for the local walking-arrow/skirmish animation to actually finish before revealing a winner, instead of firing as soon as the server's combat timer elapsed"
    ]
  }
];
export const CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  ...RECENT_CLIENT_CHANGELOG_ENTRIES,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_2,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_3,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_4,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_5,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_7,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_8,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_9,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_10,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_11,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_12,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_14,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_15,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_16,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_17,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_18,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_19,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_20,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_21,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_22,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_23,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_24,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_25,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_26,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_27
];
