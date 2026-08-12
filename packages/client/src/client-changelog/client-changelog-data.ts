// Changelog entry data only, split out from client-changelog.ts to keep that
// file (rendering/visibility logic) under the repo's 500-line file cap. This
// file grows by ~1 entry per user-visible change; the oldest entries live in
// client-changelog-data-earlier.ts (same split, same rules) once this file
// approaches the cap — extract more of the tail there before adding new
// entries rather than letting this file keep growing.
//
// Entries are unordered here — append new ones anywhere (the end is
// easiest) instead of inserting at the top. client-changelog.ts sorts by
// createdAt before rendering, so there is no shared "top of list" or
// version field for parallel branches to collide on.
import { CLIENT_CHANGELOG_ENTRIES_EARLIER } from "./client-changelog-data-earlier.js";

export type ClientChangelogEntry = {
  createdAt: number; // Unix ms. Use Date.now() when authoring a new entry.
  introducedIn: string;
  title: string;
  why: string;
  changes: string[];
};

// Add a new entry for every user-facing client release. Order doesn't
// matter; client-changelog.ts sorts by createdAt.
const RECENT_CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  {
    createdAt: 1786519200000, // 2026.08.12.2
    introducedIn: "2026.08.12.2",
    title: "Titanium/Umbrite Weapons Factory attack/defense bonuses are now visible",
    why: "The Weapons Factories were already granting real attack/defense multipliers server-side, but nothing in the client ever displayed that — a built factory looked like it did nothing, and the Tech tab's Attack/Defense chips never mentioned it either.",
    changes: [
      "A built, active Weapons Factory now shows its own per-copy attack/defense contribution in its tile overview.",
      "A town's overview now shows the connected network's total Titanium and Umbrite Weapons Factory count and combined attack/defense bonus.",
      "The Tech tab's Attack/Defense chips now list your empire's Weapons Factory count as an inspectable bonus source (labeled as the network-connected maximum, since the real bonus is scoped per attack to the connected town network involved)."
    ]
  },
  {
    createdAt: 1786510994546, // 2026.08.12.1
    introducedIn: "2026.08.12.1",
    title: "Merged the Shard tab's Recent Events into the Activity Feed, and dropped noisy self-action entries",
    why: "The Shard tab had its own 'Recent Events' panel (town captures, levy hits, monument/wonder claims) that duplicated the Activity Feed instead of feeding it, so players had two places to check. Separately, several self-initiated, non-war actions — choosing a domain, a redundant 'already sending' guard, and every development-queue enqueue — were pushing feed entries that told the player nothing they didn't already see happen on their own screen.",
    changes: [
      "The Shard tab no longer has its own 'Recent Events' card; all server-pushed events (town losses, Imperial Exchange Levy hits/casts, monument and natural wonder claims) now appear in the Activity Feed instead.",
      "Removed the 'Domain chosen: ...', 'Already sending a domain choice...', '... is already queued.', and '... queued. It will start when a development slot frees up.' Activity Feed entries — they fired on your own clicks and added no information beyond what was already visible.",
      "Tile-scoped events echoed into the Activity Feed (town losses, monument/wonder claims, levy hits) now carry a 'Go to tile' button when the server supplies coordinates, matching combat alerts."
    ]
  },
  {
    createdAt: 1786528000000, // 2026.08.12.1
    introducedIn: "2026.08.12.1",
    title: "Aether abilities are now free of gold and crystal cost",
    why: "Most Observatory aether abilities were already free server-side, but the info panel still showed stale gold/crystal price tags. A few abilities (mountain shaping, satellite launch) did charge real gold. Both are now free, and the panel no longer shows a Cost row for any ability.",
    changes: [
      "Removed the gold cost checks for Create Mountain, Remove Mountain, and Launch Satellite — they're free to cast now.",
      "The ability info panel no longer shows a Cost row for any Observatory ability."
    ]
  },
  {
    createdAt: 1786482366157, // 2026.08.11.9
    introducedIn: "2026.08.11.9",
    title: "Fixed: Build Titanium/Umbrite Weapons Factory rejected by the server with BAD_MSG",
    why: "Once the client-side dispatch bug for the two Weapons Factories was fixed (previous release), the build click actually reached the server for the first time — and the server rejected it, because the BUILD_ECONOMIC_STRUCTURE message's structureType enum was never updated to include the two Weapons Factories when they replaced Weapons Workshop. So the build still failed, just with a real BAD_MSG error instead of silence.",
    changes: [
      "Build Titanium Weapons Factory and Build Umbrite Weapons Factory no longer get rejected by the server; the build now actually queues."
    ]
  },
  {
    createdAt: 1786482157000, // 2026.08.11.7
    introducedIn: "2026.08.11.7",
    title: "Battle dots now animate for the whole siege, not just the last 2.3 seconds",
    why: "The battle-dot combat animation only ever played during the ~2.3s resolution flourish at the very end of an attack, driven by a one-time server broadcast at lock resolution. For most of a siege's countdown, only the red under-attack cross was visible with no dots, which read as the animation being broken.",
    changes: [
      "3D renderer: an indeterminate clash-loop of dots now plays at the tile midpoint for the entire attack countdown, distinct from the resolved clash/rout flourish that still plays at the very end.",
      "Red under-attack cross indicator is unchanged and still shows for the full countdown alongside the dots."
    ]
  },
  {
    createdAt: 1786473809401, // 2026.08.11.6
    introducedIn: "2026.08.11.6",
    title: "Fixed three more silently-broken build buttons; added a catch for the whole class of bug",
    why: "The same action-id-to-structure-type mapping gap that broke the two Weapons Factories (fixed last release) also silently broke Build Quartermaster's Office, Build Assembly Works, and Build Logistics Guild — clicking any of them did nothing, with no error. Added a runtime check so any future build button hitting this same gap logs an error and tells the player instead of doing nothing.",
    changes: [
      "Build Quartermaster's Office, Build Assembly Works, and Build Logistics Guild now actually queue their build.",
      "Clicking a build action that still has no structure-type mapping now shows an error message and logs to the console, instead of silently doing nothing."
    ]
  },
  {
    createdAt: 1786481000000, // 2026.08.11.7
    introducedIn: "2026.08.11.7",
    title: "Fixed severe stutter while zooming/panning the 3D map",
    why: "Zooming or panning had become nearly unplayable. The terrain's coastal-skirt geometry buffers are pre-allocated at worst-case size (~11MB per attribute) but only a small fraction is ever written on a given rebuild — every rebuild was re-uploading the entire allocation to the GPU regardless, and rebuilds fire on almost every frame during a zoom/pan gesture. A CPU profile of a live zoom showed over 60% of all main-thread time going into that single upload call.",
    changes: [
      "Terrain and coastal-skirt buffer uploads are now scoped to only the vertices/indices actually written each rebuild, instead of re-uploading the full worst-case-sized buffer every time."
    ]
  },
  {
    createdAt: 1786481071000, // 2026.08.11.8
    introducedIn: "2026.08.11.8",
    title: "Relay Beacon now has its own 3D tower and icon",
    why: "Relay Beacon (renamed from Light Outpost) was still rendering as the old generic watchtower-with-a-flag placeholder in 3D. It now gets a dedicated model — a lattice observation tower with a rotating brass mirror array — plus a matching flat-color 2D icon.",
    changes: [
      "Added a dedicated 3D overlay for Relay Beacon: a lattice tower with rotating heliograph mirrors, geared periscopes, and amber signal lamps.",
      "Added a matching 2D flat-color Relay Beacon icon for the overlay gallery.",
      "Removed the old placeholder watchtower-with-a-flag rendering that Relay Beacon shared with Siege Outpost."
    ]
  },
  {
    createdAt: 1786463807000, // 2026.08.11.5
    introducedIn: "2026.08.11.5",
    title: "Town-tile builds, Observatory upkeep, and a Jump to tile button",
    why: "A Market, Ancillary Factory, or Weapons Factory clicked on a town tile used to build right there — now only a Fort belongs directly on a town, and those auto-place onto an open support tile instead. Each additional Observatory now costs progressively more CRYSTAL upkeep. The Development panel sidebar didn't have any way to jump the camera to a queued or in-progress item's tile.",
    changes: [
      "Market, Ancillary Factory, and both Weapons Factories now redirect to an open support tile when targeted at the town tile itself — a Fort is the only structure that belongs directly on a town.",
      "Each additional Observatory costs progressively more CRYSTAL upkeep: 1st = 1 slot, 2nd = 2, 3rd = 3, and so on.",
      "Added a Jump to tile button to every active and queued item in the Development panel sidebar."
    ]
  },
  {
    createdAt: 1786445459000, // 2026.08.11.4
    introducedIn: "2026.08.11.4",
    title: "Fixed Titanium/Umbrite Weapons Factory build buttons doing nothing",
    why: "Clicking Build Titanium Weapons Factory or Build Umbrite Weapons Factory silently did nothing — no build started, no error shown. The action-id-to-structure-type mapping never got the two new Weapons Factories added when they replaced Weapons Workshop, so the click handler had nothing to act on.",
    changes: [
      "Build Titanium Weapons Factory and Build Umbrite Weapons Factory now actually queue their build."
    ]
  },
  {
    createdAt: 1786445548761, // 2026.08.11.5
    introducedIn: "2026.08.11.5",
    title: "Farmstead/Waterworks text no longer promises a nonexistent \"food cap\"",
    why: "Build-menu, tech, and tile-overview text still described Farmstead as granting \"+18 food cap\" and Waterworks as \"raising food cap\" — leftover wording from before the food-as-slots rewrite retired the food-cap mechanic entirely. The real, current effect (Farmstead +1 FOOD slot, Waterworks-boosted Farmstead +2 FOOD slots) was already correct in a couple of other spots, so the stale copies were just quietly promising a bonus that no longer exists.",
    changes: [
      "Farmstead build option, tech unlock text, and tile-overview modifier now say \"+1 FOOD slot\" instead of \"+18 food cap\".",
      "Waterworks build option, tech unlock text, and tile-overview modifier now say \"each boosted Farmstead gains +2 FOOD slots\" instead of \"raises food cap\".",
      "All of these now read the actual slot-bonus values from the shared @border-empires/shared constants instead of separately hardcoded numbers, so they can't drift out of sync with the real mechanic again."
    ]
  },
  {
    createdAt: 1786444300000, // 2026.08.11.3
    introducedIn: "2026.08.11.3",
    title: "Queue and timing fixes",
    why: "Queued settle commands were vanishing on a browser refresh, and Hills/Forest settle time didn't match the claim-time 1.5x penalty.",
    changes: [
      "Fixed queued SETTLE commands disappearing entirely after a page refresh (the restore step was wiping them before the map's first tile snapshot arrived).",
      "Settling Hills/Forest tiles now takes 1.5x as long, matching the claim-time penalty (was a flat 2x that never got updated).",
      "Frontier expand/claim no longer runs a gold-affordability check for a 0-gold action."
    ]
  },
  {
    createdAt: 1786441940000, // 2026.08.11.2
    introducedIn: "2026.08.11.2",
    title: "Tier 2-5 domain rework",
    why: "Several domains gave a bonus that wasn't actually wired into gameplay (Stone Curtain's fort-area defense, Merchant Houses' market/granary bonuses, Hidden Hand's ability cooldown) while others duplicated an earlier tier's identity almost exactly. Every domain from tier 2 up now grants a real, distinct effect.",
    changes: [
      "Frontier Doctrine now unlocks off Supply Directorate (tier-1 manpower) instead of the unrelated tier-2 Kiln Craft.",
      "Stone Curtain is now Garrison Doctrine: forts you control fight with +50% defense (was a defense bonus that never applied in combat).",
      "Titanium Vanguard is now Steam Vanguard: attacks resolve 5s faster and you can hold one more muster flag.",
      "Merchant Houses now pays more the bigger your connected dock network gets, plus a first-three-towns gold bonus, instead of two bonuses that never applied and a flat dock-cap boost.",
      "Reworked Provincial Governors, War Foundries, Supply State, and Provincial Nurseries (tier 3) to stop overlapping each other and grant bonuses that actually apply in combat/economy.",
      "Reworked Imperial Roads, Signal Bastions (formerly Fortress Realm), Siege State, Treasury State, and Hidden Hand (tier 4) — Treasury State now waives food for your first three towns, Hidden Hand halves observatory ability cooldowns.",
      "Reworked all five tier-5 capstone domains (Imperial Expansion, Titanium Dominion, Enduring Realm, Golden Hegemony, Oracle State) to be clearly stronger, distinct versions of earlier-tier identities."
    ]
  },
  {
    createdAt: 1786423606364, // 2026.08.11.1
    introducedIn: "2026.08.11.1",
    title: "Granary build/modifier text no longer promises a stale ongoing growth bonus",
    why: "A plain Granary (Incubation Engine) only grants an instant one-time population burst on completion — the old ongoing +15% growth bonus was removed server-side, but the build-menu hint and the town-tile overview modifier line still advertised it, so the client was quietly promising a bonus the town was no longer getting.",
    changes: [
      "The Granary build option now describes its real effect: an instant +10,000 population burst on completion.",
      "The town-tile overview no longer shows a \"+15% population growth\" line for a plain Granary — only an active Seed Granary (or a Granary inside its buffed radius) still shows an ongoing growth bonus."
    ]
  },
  {
    createdAt: 1786413600000, // 2026.08.10.3
    introducedIn: "2026.08.10.3",
    title: "New 3D Umbrite Extraction Rig",
    why: "The Umbrite Extraction Rig — a heavy industrial machine that drills into exposed Umbrite veins and contains their volatile stored energy — now has a full 3D model, ready to be placed on the map as part of the Umbrite gameplay.",
    changes: [
      "Added a low-poly 3D Umbrite Extraction Rig: squat iron base, reinforced drilling column with brass bands, a rotating drill descending into the ground, angled brass support struts, and anchor feet.",
      "The drill visibly penetrates an exposed violet-black Umbrite vein, with a containment collar leaking a small, restrained amount of orange containment energy.",
      "A brass-banded pressure vessel with an ember inspection window receives the extracted Umbrite through chunky industrial pipes with coupling joints and valves."
    ]
  },
  {
    createdAt: 1786417200000, // 2026.08.10.4
    introducedIn: "2026.08.10.4",
    title: "Weapons Workshop split into Titanium and Umbrite Weapons Factories",
    why: "Weapons Workshop forged both Titanium and Umbrite into the same flat empire-wide attack/defense boost, giving the two resources no distinct identity in the War branch. It's retired and replaced with two resource-specific factories that reward a real strategic choice: mass-produce anywhere, or cluster into one connected industrial network for a bigger payoff — and skipping both leaves your empire exposed.",
    changes: [
      "Titanium Weapons Factory (unlocked by Titanium-Clad Masonry): an uncapped Titanium sink granting +1.5% attack / +3% defense per copy — armor doctrine.",
      "Umbrite Weapons Factory (unlocked by Rigging Works): an uncapped Umbrite sink granting +3% attack / +1.5% defense per copy — raiding doctrine.",
      "Both buildings' bonus is scoped to the connected-town network relevant to each fight, not a flat empire-wide sum — clustering many together in one connected region pays off more than scattering them.",
      "Each additional copy of either factory costs more manpower than the last.",
      "Owning zero Titanium Weapons Factories or zero Umbrite Weapons Factories anywhere in your empire leaves you markedly easier to attack.",
      "Weapons Workshop can no longer be newly built; any copies you already own keep working as before."
    ]
  },
  {
    createdAt: 1786413600000, // 2026.08.10.3
    introducedIn: "2026.08.10.3",
    title: "Queue expansions ahead of your frontier",
    why: "You could only queue an expansion onto a tile that already touched your territory, so planning a route deep into neutral land meant clicking one tile at a time and waiting for each to finish before the next could even be queued.",
    changes: [
      "You can now queue an expansion onto a neutral tile that only borders another tile you've already queued or are currently claiming — the new claim waits for the earlier one to finish, then launches from it automatically.",
      "Chains can go several tiles deep, so a whole planned route can be queued up in one pass instead of one click at a time."
    ]
  },
  {
    createdAt: 1786410000000, // 2026.08.10.2
    introducedIn: "2026.08.10.2",
    title: "The 2D map now takes over when 3D can't run on your device",
    why: "On some phones — Safari on iPhone in particular — the 3D map could fail to start or have its graphics context taken away by the system, leaving a blank map with no explanation and no way to report what happened.",
    changes: [
      "If the 3D map can't start, or its graphics context is lost mid-session, the game now switches to the 2D map instead of showing a blank screen.",
      "A short banner explains why the 2D map is being used, with the specific reason.",
      "If loading the 3D map crashes the browser outright, the game now notices on the next visit and comes up in 2D instead of crashing again. Add ?renderer=3d to the URL to try 3D again.",
      "Downloaded diagnostics now include your device's graphics capabilities, the reason 3D was unavailable, and how far the previous 3D attempt got before the browser died — so map crashes can be diagnosed from a phone.",
      "The 3D map now sizes its memory buffers to your screen instead of always reserving for a large desktop display, which cuts its memory use substantially on phones."
    ]
  },
  {
    createdAt: 1786406400000, // 2026.08.10.1
    introducedIn: "2026.08.10.1",
    title: "Removed Bank and Exchange House; Clearing House now boosts Market",
    why: "Bank and Market did nearly the same thing, and Exchange House's bonus was never actually implemented — both were confusing dead weight in the tech tree and build menu.",
    changes: [
      "Removed the Bank and Exchange House structures.",
      "The Minting Works tech now unlocks Clearing House (instead of Bank).",
      "Clearing House now boosts Market gold production (+25%) for its town and directly connected towns, instead of boosting Bank.",
      "Removed the Provincial Concessions tech; Grand Bazaars now requires Minting Works directly.",
      "Fixed the tech tree structure card showing two separate 'Upkeep' boxes for structures with more than one resource-slot requirement (Bank, Foundry, Rail Depot, Radar System, Exchange House, Ambaric Tower, Weapons Workshop, Assembly Works, Siege Tower, Dread Tower) — now shown as one combined box.",
      "Moved Terrain Shaping into the Aether tech branch (was miscategorized under Economy); it now requires Covert Logistics and unlocks Sky Vessel Engineering alongside its other prerequisites."
    ]
  },
  {
    createdAt: 1786320000000, // 2026.08.09.2
    introducedIn: "2026.08.09.2",
    title: "Smaller soil mound on grain tiles",
    why: "The dirt bed under the barley crop was large enough to cover most of the tile, hiding the grain it was supposed to sit beneath.",
    changes: [
      "Shrunk the grain tile's soil mound and widened the crop patch so the golden barley fills the tile, with the dirt only showing as a thin rim.",
      "Increased stalk and seed-head density for a fuller-looking crop."
    ]
  },
  {
    createdAt: 1786306202000, // 2026.08.09.1
    introducedIn: "2026.08.09.1",
    title: "Muster tile cap tag on Muster Discipline/Command",
    why: "Muster Discipline, Muster Command, and War Foundries each grant +1 muster flag capacity, but the tech tree card never showed a highlight chip for it — every other tech payoff (unlocks, reveals) got a tag except this one.",
    changes: [
      "Muster Discipline, Muster Command, and War Foundries now show a \"Muster Flag +1\" chip on their tech-tree card and detail view."
    ]
  },
  {
    createdAt: 1786165552001, // 2026.08.08.2
    introducedIn: "2026.08.08.2",
    title: "Clearer Discovery tips",
    why: "The first-seen tooltips for towns, docks, barbarians, and strategic resources were vague about what each tile actually does or how to use it.",
    changes: [
      "Reworded the Town, Dock, Barbarian, Food, Iron, Crystal, and Supply discovery tips to explain what the tile produces and why capturing/settling it matters."
    ]
  },
  {
    createdAt: 1786530000000, // 2026.08.12.3
    introducedIn: "2026.08.12.3",
    title: "Muster ADVANCE flags launch one attack at a time",
    why: "A flag set to ADVANCE re-searched on every automation tick, so it could fire a second attack while its first was still resolving — and an underfunded flag kept re-sending a doomed strike every tick. A flag now waits for its in-flight attack to resolve before launching another, and only fires when it can actually afford the target.",
    changes: [
      "Muster flags in ADVANCE mode now wait for their current attack to resolve before launching another.",
      "A flag that can't afford an attack no longer sends the strike to the server at all."
    ]
  }
];

export const CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  ...RECENT_CLIENT_CHANGELOG_ENTRIES,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER
];
