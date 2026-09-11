// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_33: ClientChangelogEntry[] = [
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
];
