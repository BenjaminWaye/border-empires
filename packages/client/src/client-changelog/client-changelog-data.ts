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
    createdAt: 1786616905363, // 2026.08.13.2
    introducedIn: "2026.08.13.2",
    title: "Manual attacks now show a \"Mustering...\" overlay while manpower stages",
    why: "Launching a manual attack against a target whose adjacent muster flag wasn't fully staged used to give almost no feedback — the big capture overlay only appeared once the attack actually fired, so the wait beforehand looked like nothing was happening. Fixing this also surfaced (and fixed) a related bug: the flag was judged \"ready\" using a flat 60-manpower threshold instead of the target's real requirement, so an attack on a garrisoned fort could fire early and get rejected by the server even with manpower still visibly staged.",
    changes: [
      "Launching a manual attack now immediately shows the capture overlay in a \"Mustering...\" state, with a bar that fills toward the actual manpower this target requires (higher for a garrisoned enemy fort) and hands off to \"Capturing Territory...\" the moment it fires — no more silent wait in between.",
      "Cancel during mustering now just drops that queued target, leaving the flag and its staged manpower in place for another attack.",
      "Dismiss is also available during mustering, hiding the overlay while the flag keeps filling in the background — same as it already worked for the Capturing phase.",
      "Fixed: a muster flag could be judged ready off a flat 60-manpower threshold and fire early against a garrisoned fort, getting rejected by the server instead of waiting for the fort's real requirement."
    ]
  },
  {
    createdAt: 1786582800000, // 2026.08.13.2
    introducedIn: "2026.08.13.2",
    title: "Fixed: a town's Modifier totals never actually reached the tile popup",
    why: "The unified modifier catalog computed a town's combined stat totals (e.g. 3 Garrison Halls -> \"Manpower cap: +450\") correctly on the server, but the tile popup (REQUEST_TILE_DETAIL) is served by a separate gateway code path that reconstructs the town object from a persisted, redacted copy stripped down to 8 basic fields — townModifierTotals was never one of them, and this path never recomputed it the way it already does for support/gold/population numbers. The totals silently never reached any player's tile popup, including a town's own owner. Also found while fixing this: a stray non-numeric \"higher production raises gold cap\" line sitting inside the Modifiers list, and an old hand-written paragraph under Upkeep that restated the same Mintworks/Granary/Clearing House numbers the new Modifiers section already shows.",
    changes: [
      "A town's Modifier totals (manpower cap, gold, empire attack/defense, etc. from its support-ring buildings) now actually show on the tile popup.",
      "The aggregation math itself moved into the shared catalog so the simulation and the tile-popup path can't compute it two different (and driftable) ways again.",
      "Removed a non-numeric line that was sitting inside Mintworks's Modifiers list instead of being a real stat.",
      "Removed a duplicate paragraph under Upkeep that restated numbers the Modifiers section already shows for Mintworks, Granary, and Clearing House."
    ]
  },
  {
    createdAt: 1786579200000, // 2026.08.13.1
    introducedIn: "2026.08.13.1",
    title: "Fixed: most buildings still showed no Modifier section on their own tile",
    why: "The unified modifier catalog (2026.08.12.14) was reachable from the tech-tree/build-menu info panel for every building, but the tile-overview popup you get from clicking a built tile in-game still gated behind a small hardcoded allowlist of 8 building types left over from before the catalog existed — so most buildings (Garrison Hall, Census Hall, Foundry, Governor's Office, the Weapons Workshop family, synthesizers, Airport, Ambaric Tower, Resonance Grid, and more) showed an empty Modifier section when checked the normal way, in-game.",
    changes: [
      "Clicking any built structure's own tile now shows its full Modifier section, not just the small set of buildings that happened to be allowlisted before.",
      "Observatory tiles were never checked at all by the tile popup — its vision and crystal-range modifiers now show correctly.",
      "Relay Beacon was missing its vision bonus from the catalog (only offense showed) — both now show."
    ]
  },
  {
    createdAt: 1786575600000, // 2026.08.12.14
    introducedIn: "2026.08.12.14",
    title: "Unified building modifier display across tile popup and tech tree",
    why: "Building effect numbers (\"Manpower +150\", \"+50% farm food\", etc.) were hand-written in up to three separate places with no shared source of truth, so the tile-detail popup, the tech-tree structure panel, and the town summary could each show slightly different or missing numbers for the same building.",
    changes: [
      "Every building's tile-overview popup now shows a Modifiers section with the same white-label/green-value styling for every structure, not just the ~15 that used to be covered.",
      "The structure-info panel (opened from the build menu or tech tree) now shows the exact same modifier numbers in the same style, instead of separately hand-written prose.",
      "A town's support-ring buildings that stack across the whole town (e.g. multiple Garrison Halls) now show their combined total next to the town's Support/Population/Growth summary — widened to cover every stat a support building contributes, including Mintworks gold production and the Weapons Workshop family's empire attack/defense, combined across every building that feeds the same stat.",
      "Fort and Siege Outpost defense/offense lines now use the same \"stat: value\" format as every other modifier (e.g. \"Defense: 2.5x\") instead of folding the stat name into the colored value text."
    ]
  },
  {
    createdAt: 1786572000000, // 2026.08.12.13
    introducedIn: "2026.08.12.13",
    title: "Fixed: manual attack could stay queued forever behind a non-adjacent muster flag",
    why: "The NOT_ADJACENT fix (2026.08.12.12) made processActionQueue require a ready flag to actually be adjacent before firing, but the queue-promotion step that runs beforehand didn't check adjacency at all. Whenever the only fully-mustered flag near a target wasn't adjacent to it, the attack got promoted, rejected, and re-parked in an endless loop — the exact \"stuck forever\" symptom the original fix was meant to resolve.",
    changes: [
      "A pending muster attack now only promotes to fire once its funded flag is actually adjacent to the target (or a valid dock crossing), matching the check that decides whether it's allowed to fire.",
      "A funded-but-not-adjacent flag keeps the attack parked instead of bouncing it between the queues."
    ]
  },
  {
    createdAt: 1786568215911, // 2026.08.12.12
    introducedIn: "2026.08.12.12",
    title: "Fixed: manually targeted attacks rejected as NOT_ADJACENT from a ready flag",
    why: "The previous fix for stuck manual attacks (2026.08.12.11) made a fully mustered flag fire immediately whenever it was merely \"in range\" of the target (up to 20 tiles), not actually next to it. The server correctly rejects a non-adjacent attack, so those attacks failed outright instead of firing.",
    changes: [
      "A ready flag now only fires an attack directly when it's actually adjacent to the target (or a valid dock crossing).",
      "A ready flag that's in range but not adjacent stages/parks as before, so it can march into position instead of being rejected."
    ]
  },
  {
    createdAt: 1786550100000, // 2026.08.12.11
    introducedIn: "2026.08.12.11",
    title: "Fixed: manually targeted attacks from a ready muster flag never fired",
    why: "Steering an attack onto a specific enemy tile — rather than letting a flag's ADVANCE mode auto-pick a target — silently re-queued the attack forever instead of sending it, even once the flag held well over the required manpower. The flag would just sit there fully mustered and nothing would happen.",
    changes: [
      "Manually targeting an attack now fires immediately once a muster flag in range already has enough manpower staged, instead of endlessly re-parking the attack.",
      "Applies to both close-range flags and flags reached via a dock sea crossing."
    ]
  },
  {
    createdAt: 1786546500000, // 2026.08.12.10
    introducedIn: "2026.08.12.10",
    title: "Market renamed to Mintworks, with a new 3D overlay and icon",
    why: "\"Market\" read as a trading post, which isn't what the building does — it's the empire's gold-minting workshop, easy to confuse with the unrelated Market town archetype. Renamed the structure to Mintworks (town archetype naming is unaffected) and gave it a dedicated look worthy of the name: a giant mechanical coin press instead of the old fruit-stall-with-an-awning placeholder.",
    changes: [
      "The Market structure is now called Mintworks everywhere — build menu, tile info, tooltips, and the Development queue.",
      "Added a dedicated 3D overlay for Mintworks: a dark-iron industrial hall with a giant brass coin press, flywheel, gear train, rear furnace, ingot stocks, coin trays, and coin crates.",
      "Added a matching 2D flat-color Mintworks icon for the overlay gallery.",
      "Existing Market structures on the map keep working under the new name — no rebuild needed."
    ]
  },
  {
    createdAt: 1786545979000, // 2026.08.12.9
    introducedIn: "2026.08.12.9",
    title: "Fixed: Titanium/Umbrite Weapons Factory bonus was silently scoped to a single town network instead of empire-wide",
    why: "Titanium/Umbrite Weapons Factories were combat-relevant only if they happened to sit in the connected-town network nearest whichever tile was attacking or defending — build one at a second, disconnected town and it contributed nothing to a fight fought elsewhere. Nothing in the game ever told players this; the build tooltip and structure-info text actually claimed the opposite ('scoped to this town's connected network' read as intentional, not as a gotcha), and the just-added combat breakdown panel would have shown a number that quietly changed depending on which tile you attacked from. Weapons Workshop, the structure these replaced, was always empire-wide — this brings Weapons Factories in line with it.",
    changes: [
      "Titanium/Umbrite Weapons Factory attack/defense bonuses are now empire-wide: every active copy you own counts toward every fight, regardless of which town network it's connected to or how far it is from the battle.",
      "Build tooltips and structure-info text for both factories updated to say 'empire-wide' instead of the old (now incorrect) 'scoped to this town's connected network' claim.",
      "The live Launch Attack preview now actually includes Weapons Workshop/Weapons Factory bonuses and the 'no war industry' vulnerability penalty in its win-chance number — previously the preview omitted all three and only the resolved combat applied them, so the number shown before committing to an attack could be meaningfully wrong."
    ]
  },
  {
    createdAt: 1786543467000, // 2026.08.12.8
    introducedIn: "2026.08.12.8",
    title: "Added: a full \"show your work\" breakdown for combat power and win chance",
    why: "Win chance showed up as a single percentage with no way to see what produced it, and the Attack/Defense stats in the tech tab were shown as vague % deltas that didn't even correspond to the numbers combat actually used — worse, a couple of domains (Titanium Dominion, War Foundries) promised a flat attack/defense bonus in their description that silently never applied to any fight. Both are now the same real numbers: BASE_COMBAT_POWER x persistent infrastructure x this-battle modifiers.",
    changes: [
      "Tech tab's Attack/Defense stats now show the actual effective combat-power number (e.g. \"11.8\") instead of a % delta — press either stat to inspect every contributing multiplier.",
      "The Launch Attack button now shows a breakdown panel: each side's calculated base power (the same number the tech tab shows), the modifiers specific to this fight as a signed %, the resulting effective attack/defense, and the win-chance formula itself.",
      "Fixed: tech/domain flat attack/defense bonuses (e.g. Titanium Dominion's +18%/+18%, War Foundries' +8% attack) now actually apply to combat instead of only being displayed."
    ]
  },
  {
    createdAt: 1786536900000, // 2026.08.12.7
    introducedIn: "2026.08.12.7",
    title: "Fixed: Aether Purge (and other Observatory abilities) still asking for gold/crystal",
    why: "An earlier release dropped the stale price tags from the ability info panel, but the tile-targeting menu — the button you actually click to cast — had its own separate gold/crystal checks that were never touched, so Aether Purge still refused to fire below 3,000 gold. Aether EMP, Retort Recast, Create/Remove Mountain, and Launch Satellite had the same leftover checks.",
    changes: [
      "Removed the stale client-side gold/crystal gates on Aether Purge, Aether EMP, Retort Recast, Create Mountain, Remove Mountain, and Launch Satellite — casting them no longer requires resources they don't actually cost."
    ]
  },
  {
    createdAt: 1786533000000, // 2026.08.12.6
    introducedIn: "2026.08.12.6",
    title: "Fixed: zoom/pan stutter from the ownership tint overlay",
    why: "A CPU profile taken mid-zoom showed bufferSubData eating 65% of main-thread time. The ownership overlay's commit() set needsUpdate on its position/color/index buffers without scoping the upload range, so every terrain rebuild reuploaded the full worst-case buffer (sized for the whole tile budget across 4 mesh targets) instead of just the tiles actually written that frame — the same bug class as the heightfield skirt-buffer fix, in a different overlay.",
    changes: [
      "Ownership overlay buffer uploads are now scoped to the written tile range instead of reuploading the whole allocation on every rebuild, cutting zoom/pan jank."
    ]
  },
  {
    createdAt: 1786530294000, // 2026.08.12.5
    introducedIn: "2026.08.12.5",
    title: "Fixed: Activity Feed timestamps stuck showing raw minutes forever",
    why: "Feed entries persist for a session, so their age can run from seconds to months, but the timestamp label only ever scaled up to whole minutes — an entry from 14 hours ago read as '833m ago' instead of converting to hours, days, weeks, or months.",
    changes: [
      "Activity Feed timestamps now scale through s/m/h/d/w/mo depending on age, instead of showing raw minutes no matter how old the entry is."
    ]
  },
  {
    createdAt: 1786528967000, // 2026.08.12.4
    introducedIn: "2026.08.12.4",
    title: "Fixed: attack outcomes (manpower spent, gold/resources plundered) never actually reached the Activity Feed",
    why: "The simulation computed a full combat outcome for every resolved attack — manpower spent, gold and resources plundered — but the gateway never forwarded that event to the attacker. combatResolutionAlert() and the client's COMBAT_RESULT listener had been dead code on the wire since the rewrite-stack gateway shipped; the only feedback an attacker ever got was the tile silently changing hands.",
    changes: [
      "Attack results now post a real Activity Feed entry naming manpower lost and, on a win, gold/resources plundered — not just a tile flip.",
      "The player being raided now also gets their own Activity Feed entry (with a Go to tile button) naming the attacker and what was pillaged from them — previously they got nothing beyond the pre-resolution 'under attack' alert."
    ]
  },
  {
    createdAt: 1786526599000, // 2026.08.12.3
    introducedIn: "2026.08.12.3",
    title: "Development queue now fills silently once it hits its total cap",
    why: "The total dev-queue cap exists as a defensive backstop, not something players are meant to actually hit in normal play — but the 'Development queue is full' Activity Feed warning fired as if it were a real, expected rejection, which read as broken rather than as the edge case it is.",
    changes: [
      "Queuing an action once the development queue is at its total cap no longer posts an Activity Feed warning — the action is silently dropped, matching how an already-queued action is already handled."
    ]
  },
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
    why: "A Mintworks, Ancillary Factory, or Weapons Factory clicked on a town tile used to build right there — now only a Fort belongs directly on a town, and those auto-place onto an open support tile instead. Each additional Observatory now costs progressively more CRYSTAL upkeep. The Development panel sidebar didn't have any way to jump the camera to a queued or in-progress item's tile.",
    changes: [
      "Mintworks, Ancillary Factory, and both Weapons Factories now redirect to an open support tile when targeted at the town tile itself — a Fort is the only structure that belongs directly on a town.",
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
    why: "Several domains gave a bonus that wasn't actually wired into gameplay (Stone Curtain's fort-area defense, Merchant Houses' mintworks/granary bonuses, Hidden Hand's ability cooldown) while others duplicated an earlier tier's identity almost exactly. Every domain from tier 2 up now grants a real, distinct effect.",
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
    title: "Removed Bank and Exchange House; Clearing House now boosts Mintworks",
    why: "Bank and Mintworks did nearly the same thing, and Exchange House's bonus was never actually implemented — both were confusing dead weight in the tech tree and build menu.",
    changes: [
      "Removed the Bank and Exchange House structures.",
      "The Minting Works tech now unlocks Clearing House (instead of Bank).",
      "Clearing House now boosts Mintworks gold production (+25%) for its town and directly connected towns, instead of boosting Bank.",
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
