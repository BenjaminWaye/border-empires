// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_37: ClientChangelogEntry[] = [
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
  }
];
