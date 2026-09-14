// Changelog entry data only, split out from client-changelog.ts (rendering/
// visibility) to keep that file under the 500-line cap. Entries are unordered —
// client-changelog.ts sorts by createdAt. Move old entries to
// client-changelog-data-earlier.ts when this file approaches the cap.
// The "keeps only the latest week" test drops any entry whose createdAt is
// more than 6 days before the newest entry -- when a new entry's timestamp
// ages an earlier-N file's entries out of that window, remove that file's
// import and spread below (the .ts file itself can stay as a historical
// record, just unreferenced) rather than leaving a stale import.
import { CLIENT_CHANGELOG_ENTRIES_EARLIER } from "./client-changelog-data-earlier.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_2 } from "./client-changelog-data-earlier-2.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_3 } from "./client-changelog-data-earlier-3.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_4 } from "./client-changelog-data-earlier-4.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_5 } from "./client-changelog-data-earlier-5.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_7 } from "./client-changelog-data-earlier-7.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_10 } from "./client-changelog-data-earlier-10.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_11 } from "./client-changelog-data-earlier-11.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_14 } from "./client-changelog-data-earlier-14.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_16 } from "./client-changelog-data-earlier-16.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_17 } from "./client-changelog-data-earlier-17.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_18 } from "./client-changelog-data-earlier-18.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_20 } from "./client-changelog-data-earlier-20.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_27 } from "./client-changelog-data-earlier-27.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_29 } from "./client-changelog-data-earlier-29.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_33 } from "./client-changelog-data-earlier-33.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_34 } from "./client-changelog-data-earlier-34.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_36 } from "./client-changelog-data-earlier-36.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_37 } from "./client-changelog-data-earlier-37.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_48 } from "./client-changelog-data-earlier-48.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_49 } from "./client-changelog-data-earlier-49.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_50 } from "./client-changelog-data-earlier-50.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_52 } from "./client-changelog-data-earlier-52.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_53 } from "./client-changelog-data-earlier-53.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_55 } from "./client-changelog-data-earlier-55.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_56 } from "./client-changelog-data-earlier-56.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_57 } from "./client-changelog-data-earlier-57.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_58 } from "./client-changelog-data-earlier-58.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_59 } from "./client-changelog-data-earlier-59.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_60 } from "./client-changelog-data-earlier-60.js";
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
    createdAt: 1789417055098, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.14.06",
    title: "Toned down territory color in the 3D map",
    why: "Settled-territory tint sat at 0.85 opacity -- strong enough that a large empire's interior read as a solid color wash over the terrain, and left little visual gap between settled and frontier tint once frontier had earlier been raised to stay visible.",
    changes: [
      "Settled territory tint is now 0.6 opacity (down from 0.85) -- terrain and structures underneath stay visible through your own color",
      "Frontier tint is now 0.3 opacity (down from 0.5) -- keeps a clear, three-way gap between unowned, frontier, and settled tiles instead of frontier and settled nearly meeting in the middle",
      "3D map only -- the 2D canvas renderer's border strokes are a separate, already-more-restrained treatment and are unaffected"
    ]
  },
  {
    createdAt: 1789249191264, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.05",
    title: "Tile info panel now names the structure built on the tile, with a link to its details",
    why: "Selecting a tile with a Fort, Siege Outpost, Observatory, or any economic structure (Mintworks, Granary, etc.) on it gave no indication anywhere in the panel of what was actually built there.",
    changes: [
      "The tile info panel's overview now shows a \"Built: <structure>\" line naming whichever structure is on the tile",
      "That structure name is a clickable link that opens the same structure detail overlay already used by the Tech Tree and HUD economy panel"
    ]
  },
  {
    createdAt: 1788986490659, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.09.07",
    title: "Restored Town's manpower cap after the population-tier rebalance made Thunder Bastion forts unbuildable at Town tier",
    why: "Halving every tier's manpower-cap increase (including Town's) dropped a Town-tier town's manpower cap to 945 -- below the 960 manpower a Thunder Bastion fort costs, so no Town-tier player could ever build the top fort tier. Only City-and-above tiers were meant to have their increase halved.",
    changes: [
      "Town's manpower cap/regen is back to its original (unhalved) value: 300 cap / +0.42 per-min regen, same as before the population-tier rebalance",
      "City, Great City, and Metropolis keep their halved per-tier increase, now stacking on top of Town's restored value: City 450 cap, Great City 750 cap, Metropolis 1,350 cap"
    ]
  },
  {
    createdAt: 1789249191263, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.04",
    title: "AI empires no longer freeze up fighting barbarians",
    why: "A rejected ATTACK command put the entire ATTACK decision class on a 10-second cooldown, regardless of why it was rejected. On a barbarian border -- which can flip dozens of times a day as the barbarian faction expands and multiplies -- the AI's chosen target frequently changed hands between planning the attack and it landing, rejecting the command with \"target must be enemy-controlled land\" and cooling ATTACK down again. That produced a self-sustaining loop that kept some AI empires effectively frozen at their barbarian border, unable to attack, even while every other sign said they were ready and willing to fight.",
    changes: [
      "AI empires now only go on ATTACK cooldown when the rejection means resubmitting the same attack would fail again (e.g. the tile is still locked in combat) -- a rejection caused by the target simply changing hands no longer blocks the AI from immediately picking a new target and attacking again"
    ]
  },
  {
    createdAt: 1789249191262, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.03",
    title: "Fixed Siege Outpost, Siege Tower, and Dread Tower rejected on frontier tiles",
    why: "Siege outposts are meant to only require ownership, not settlement, so they can be built on frontier land -- but the tile-surface check that gates the build menu and the BUILD command never had a case for an owned, unsettled (FRONTIER) tile with no resource/town/dock on it, so a bare frontier tile always failed with \"siege outpost cannot be built on this tile\" even though the rest of the build path already allowed it.",
    changes: [
      "Siege Outpost, Siege Tower, and Dread Tower can now be built on any owned frontier tile, not just settled/resource/town/dock tiles"
    ]
  },
  {
    createdAt: 1789249191261, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.02",
    title: "Galaxy View launcher no longer overlaps the mobile minimap",
    why: "The minimap's label always renders as a bordered/padded toolbar box (e.g. \"Minimap (12, 34)\"), not plain text, so it's taller than a first pass assumed -- the Galaxy View launcher's clearance above it was 30px short, and the launcher visibly overlapped the minimap's top edge on real devices.",
    changes: [
      "The Galaxy View launcher on mobile now clears the minimap's actual (taller) height, verified with a headless render of the real minimap markup instead of a plain-text stand-in -- no more visible overlap"
    ]
  },
  {
    createdAt: 1789249191260, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.01",
    title: "Minimap moved down to the bottom of the screen on mobile",
    why: "On mobile the minimap sat with a large fixed gap above the bottom nav bar, leaving a lot of dead map space below it and pushing the Galaxy View launcher awkwardly high (close enough to the minimap to look like it overlapped it).",
    changes: [
      "The minimap now sits right above the bottom nav bar on mobile instead of floating with a big gap underneath it, freeing up more of the screen for the map",
      "The Galaxy View launcher sits just above the minimap's new, lower position instead of needing to clear as much space"
    ]
  },
  {
    createdAt: 1789249191259, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.13.04",
    title: "Galaxy View button moved above the minimap on mobile",
    why: "On mobile the 🌌 Galaxy View launcher was anchored just above the bottom nav bar, which put it below/behind the minimap panel instead of clear of it.",
    changes: [
      "On mobile, the Galaxy View launcher now sits above the minimap instead of tucked in behind it near the bottom nav bar"
    ]
  },
  {
    createdAt: 1789249191257, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.12.07",
    title: "Siege Battery rebuilt as an armored siege machine",
    why: "The old Siege Outpost looked like a rustic wooden watchtower with a catapult lashed to the roof — the visual language of a frontier camp rather than the heavy forward-deployed artillery it actually is. It's now a compact armored machine with a real silhouette: black-iron hull braced on stabilizer legs, a big forward siege cannon, and a spinning aether targeting head. Renamed from Siege Outpost to Siege Battery to match: it's a planted weapon, not a camp.",
    changes: [
      "The 3D map's Siege Battery is now a single armored siege machine — black-iron hull, aged-brass trim, four angled stabilizer legs, rear engine, and a large forward-facing cannon — planted on the tile like a piece of artillery instead of a wooden camp",
      "A small aether targeting head (cyan lens + violet ring) on the rear deck rotates slowly on both the 3D map and its 2D overlay art, matching the steampunk glow of the aether tech used by weapons foundries",
      "Both renderers get the new machine: the true-3D model is fully procedural and the 2D canvas overlay is a new 128px armored-machine sprite",
      "The battery now turns to aim itself at the nearest enemy tile it can see (both renderers) instead of always facing south — cosmetic only, it doesn't change range or combat odds",
      "Renamed from \"Siege Outpost\" to \"Siege Battery\" throughout the UI"
    ]
  },
  {
    createdAt: 1789198795334, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.12.03",
    title: "Fixed: a shard that no longer exists could get stuck on your tile, refusing to collect",
    why: "A shard site that expired (or was already collected) while your tile was out of view could get stuck showing on your map forever. Reselecting the tile didn't help: the tile-detail refresh that's supposed to re-sync a tile treated a shard's absence as \"unchanged\" rather than \"gone\", and re-served the same phantom shard every time you looked. Pressing Collect Shard then failed with \"no shard present\" every single time -- silently, with only a muted line in the feed, so it looked like nothing had happened at all.",
    changes: [
      "A full tile-detail refresh now explicitly reports \"no shard here\" for your own tiles, so a stale shard disappears as soon as you select the tile",
      "A rejected Collect Shard now immediately pushes fresh tile detail for that tile, so a phantom shard clears itself instead of leaving you re-pressing a button that can't succeed",
      "A failed collect (shard or tile yield) now shows a proper \"Collect failed\" alert explaining why, instead of failing silently or with only a muted feed line"
    ]
  },
  {
    createdAt: 1789149360440, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.12.02",
    title: "Fixed: an already-staged muster flag could go missing from the tile menu after reloading or reconnecting",
    why: "Logging back in or reconnecting rebuilds your view of the map from a fresh server snapshot, but that snapshot never mentioned muster flags at all -- so a flag you'd already staged (Hold, Advance, or a March) could vanish from the tile menu and the manpower panel's Active muster flags list until the next server update touched it, which never happens for a flag already sitting at its cap.",
    changes: [
      "A muster flag now shows up correctly in the tile menu and manpower panel immediately after logging in or reconnecting, instead of only after the next server update or a manual click on that tile"
    ]
  },
  {
    createdAt: 1789118559125, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.11.01",
    title: "Great City's second support ring now becomes frontier immediately on upgrade",
    why: "Capturing a Town auto-claims its whole support ring as frontier the instant it settles, but upgrading a City to Great City -- which doubles the support ring outward to a second ring of tiles -- never did the same for that new ring. Those tiles sat as plain unowned ground until you happened to Frontier Expand onto them, at which point they'd start settling as if nothing unusual had happened.",
    changes: [
      "Upgrading a town to Great City (or beyond) now immediately claims its newly-eligible second support ring as frontier, matching what a Town capture's support ring already does -- no more waiting on a manual Frontier Expand to make those tiles behave normally"
    ]
  },
  {
    createdAt: 1789149360438, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.11.06",
    title: "Map tile grid lines are now a transparent gray instead of dark navy",
    why: "The per-tile grid outline on both the 2D canvas map and the true-3D heightfield map used a near-black navy stroke color, which read as a heavy dark border against the map's terrain art instead of a subtle grid.",
    changes: [
      "The 2D map's per-tile grid outline is now a semi-transparent gray instead of dark navy",
      "The true-3D map's heightfield gridlines are now the same semi-transparent gray, matching the 2D renderer"
    ]
  },
  {
    createdAt: 1789144617322, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.11.05",
    title: "Great City / Metropolis 2nd support ring now highlights correctly on the 2D map",
    why: "The 2D-canvas (accessibility fallback) renderer's per-tile support-ring selection highlight still hardcoded the old radius-1 ring check, so a Great City or Metropolis's 2nd ring (distance-2, added this week) only outlined its inner 8 tiles instead of the full 24 -- even though the true-3D renderer's equivalent overlay and the buildings menu itself were already correct.",
    changes: [
      "Selecting a Great City or Metropolis on the 2D map now outlines its full 2nd-ring support tiles, matching the true-3D map"
    ]
  },
  {
    createdAt: 1789141413055, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.11.04",
    title: "Great City / Metropolis 2nd support ring now offers buildings when clicked",
    why: "A Great City or Metropolis's expanded, 16-tile 2nd support ring (distance-2, added this week) rendered correctly on both map renderers and was auto-claimed as territory, but two client lookups that decide which town a clicked tile can build support structures for (MINTWORKS, GRANARY, CLEARING_HOUSE, etc.) were missed when the rest of the codebase was updated for the wider ring -- they still hardcoded the old radius-1 check, so clicking a 2nd-ring tile opened the buildings menu with nothing in it.",
    changes: [
      "Clicking a Great City or Metropolis's 2nd-ring (distance-2) tile now correctly shows the same support-structure build options as a 1st-ring tile"
    ]
  },
  {
    createdAt: 1789121341436, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.11.03",
    title: "The buildings menu now shows a Wonder part's Shard cost, not just its manpower cost",
    why: "Wonder parts started costing 1 Shard each (2026.09.08.3.5), but the buildings menu's cost line only ever read gold and manpower -- it never displayed Shard at all, so every Wonder part silently showed just its manpower cost with no mention of the Shard it also requires. (An earlier version of this fix also tried to show Food/Titanium/Crystal/Umbrite build costs the same way, but those four are vestigial numbers left over from before the resource-slot rewrite and are never actually charged -- only Shard is still a real, enforced stockpile spend -- so that part was reverted before it reached players.)",
    changes: [
      "A structure with a Shard build cost now shows that cost in the buildings menu alongside gold/manpower",
      "Wonder parts now correctly show \"1 shard\" and finished Wonders show \"2 shard\" in their cost line"
    ]
  },
  {
    createdAt: 1789255054252, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.13.1",
    title: "Fixed a defended tile briefly flashing neutral when you attacked it",
    why: "A tile you attacked (or that had an active attack lock on it, as either side) could render as unowned/neutral for a split second, even though it never actually changed hands -- most reliably reproduced on a failed/repelled attack against an already-owned, defended tile. Two separate server code paths were building a tile update that omitted ownerId/ownershipState instead of including their real (unchanged) values, which the client always reads as an explicit ownership clear.",
    changes: [
      "A tile visible to you only because you have an active attack lock on it now still reports its real owner instead of stripping ownership info entirely",
      "A repelled attack against a defended tile no longer sends a battle-effect update that omits the tile's ownership, which was momentarily flashing it neutral client-side"
    ]
  },
  {
    createdAt: 1789121341435, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.11.02",
    title: "AI empires no longer clutter their own territory with redundant Relay Beacons",
    why: "AI-controlled empires were building Relay Beacons on tiles already deep inside another beacon's coverage, sometimes tiling an entire base with them, because a candidate site only needed to scrape a sliver of positive score from unexplored fog, plain land, or even an enemy's own tiles at the far edge of its scan radius -- including fog over permanent ocean that could never reveal anything, and enemy land a beacon can never actually claim (only ATTACK captures owned ground).",
    changes: [
      "AI no longer builds a Relay Beacon on ground already covered by one of its own towns, docks, or other beacons unless that site also reaches a genuinely new, valuable tile (a town, resource, dock, or natural wonder)",
      "Unexplored tiles that are actually permanent ocean no longer count toward a beacon site's score -- only fog that might plausibly hide real land does",
      "Another player's owned land no longer counts toward a beacon site's score -- a beacon can never claim owned ground, so only genuinely unowned land is credited"
    ]
  },
  {
    createdAt: 1789114974044, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.11.01",
    title: "Halved EXPAND (frontier claim) time",
    why: "Claiming a neutral tile felt slow relative to how often players expand, especially early game.",
    changes: [
      "EXPAND now takes 7.5s on plain land instead of 15s",
      "Forest and hills tiles keep their same 1.5x multiplier, so they now take 11.25s instead of 22.5s"
    ]
  },
  {
    createdAt: 1789114531477, // frozen, 1s after the muster-flag-reuse entry -- keeps ordering stable
    introducedIn: "2026.09.11.2",
    title: "A monument's unlock tech now shows \"already built\" once it's claimed",
    why: "Each monument (Imperial Exchange/World Engine/Aegis Dome/Astral Dock/Population Bureau/Titanium Levy) can only ever be completed once per season, and the build command already rejected a second attempt -- but the tech tree kept offering the monument's unlock tech to research for free, gold-and-resources spent, with no way to tell it had become pointless the moment someone else's assembly finished.",
    changes: [
      "A monument's unlock tech is removed from research choices for every player who doesn't already have it as soon as that monument is completed by anyone",
      "The tech tree, tech detail panel, and research command now show \"monument already built this season\" instead of a misleading \"ready to unlock\" or generic locked state"
    ]
  },
  {
    createdAt: 1789114530477, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.11.01",
    title: "Launch Attack now prefers reusing a nearby muster flag over staging a new one",
    why: "Launching an attack with no fully-funded flag right next to the target used to auto-create a brand new muster flag even when an existing owned flag was just a few tiles away but under-staffed -- and if the player was already at their muster-flag cap, that create was silently rejected server-side and only discovered 5 seconds later, cancelling the attack.",
    changes: [
      "An attack with no fully-funded flag nearby now first looks for any owned, unreserved flag already within remote-funding range (or touching the target), even if it isn't fully staffed yet, and reroutes the attack onto it instead of staging a new flag",
      "If the player is already at their muster-flag cap and no existing flag is usable, the attack is now cancelled immediately with a clear \"Muster flags full\" message, instead of silently requesting a doomed new flag and waiting 5 seconds to find out it was rejected",
      "The muster-flag cap shown in that message (and in the equivalent MUSTER_LIMIT fallback message) now reflects the player's real cap, including tech/domain/wonder bonuses, instead of a hardcoded \"max 3\""
    ]
  },
  {
    createdAt: 1789073088458, // frozen, 1s after the selection-ring-outline entry -- keeps ordering stable without widening the "latest week" bundle window past older earlier-N entries
    introducedIn: "2026.09.11.1",
    title: "Fixed queued waypoints past #20 showing no map marker",
    why: "The waypoint queue's map overlay (a flag for each queued march/expand step, numbered by position) is sized to the same 20-entry cap the durable server-side queue enforces -- but two of the ways a waypoint gets queued (a plain adjacent-tile \"Expand Here\" click, and starting a Relay Beacon from an unowned frontier tile) pushed straight onto the local queue without checking that cap first, unlike every other way to queue a waypoint. A player who queued past 20 that way got a real, server-synced entry -- visible in the tile's own progress tab -- with no marker on the map at all, because the overlay simply has no flag slot beyond position 20.",
    changes: [
      "Both queuing paths now show the same \"Waypoint queue is full (20/20)\" warning every other queuing action already gives once the queue is at its cap, instead of silently accepting an entry the map can't display"
    ]
  },
  {
    createdAt: 1789073087458, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.10.10",
    title: "Fixed the 3D map's selection-ring outline for a Great City/Metropolis town",
    why: "Selecting one of your own towns draws a highlighted outline around its support tiles on the true-3D map, distinct from the settle-tile hatch overlay. That outline was still hardcoded to the base 8-tile ring for every tier, so a Great City or Metropolis town's real second ring (its outer 16 tiles) never got the selection highlight even though those tiles do contribute to the town.",
    changes: [
      "A selected Great City or Metropolis town's 3D selection-ring outline now covers its full support ring (24 tiles), matching the settle-tile hatch overlay and every other support-ring consumer"
    ]
  },
  {
    createdAt: 1789050708101, // frozen, 1ms after the EXPAND claim-animation fix entry -- keeps ordering stable
    introducedIn: "2026.09.10.9",
    title: "Fixed a muster flag's auto-fired EXPAND showing no marching-company approach on the 3D map",
    why: "The server always computes a muster flag's mechanical travel-time delay the same way for an auto-fired ATTACK and EXPAND alike, but the gateway only ever forwarded it on the message ATTACK gets -- EXPAND has no equivalent message, so its only broadcast silently dropped the delay. The client-side code waiting on it was already correct and untouched by this fix; it simply never received the fields it needed, so a MARCH flag fighting through neutral ground on its way to a target showed no marching approach at all, only the claim-sweep animation (fixed separately) starting immediately.",
    changes: [
      "A muster flag's auto-fired EXPAND now shows the marching-company approach on the 3D map for the whole time its company is still traveling to the tile, matching what an auto-fired ATTACK already showed"
    ]
  },
  {
    createdAt: 1789050708100, // frozen, 1ms after the monument-announcement entry -- keeps ordering stable
    introducedIn: "2026.09.10.8",
    title: "Fixed a muster flag's auto-fired EXPAND showing no claim animation on the 3D map",
    why: "A muster flag's ADVANCE/MARCH auto-fired EXPAND (claiming neutral ground the flag fights through on its way to a march target, or the nearest open land for ADVANCE) is dispatched by the server, not by this client, so it never occupied the single 3D claim-animation slot that only ever tracked this client's own manually-dispatched claim. The marching-company travel animation already played correctly on the way there (fixed separately); once the flag actually started claiming the tile, though, the tile-filling sweep animation simply never appeared.",
    changes: [
      "A muster flag's auto-fired EXPAND now shows the same empire-color claim-sweep animation on the 3D map that a manually-dispatched EXPAND already showed, for the whole time the tile is being claimed",
      "Any number of a player's muster flags claiming neutral ground at once now each get their own claim animation, instead of only ever being able to show one at a time"
    ]
  },
  {
    createdAt: 1789050708099, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.10.7",
    title: "Added an announcement when a rival starts building a monument",
    why: "Monuments (Imperial Exchange, World Engine, Aegis Dome, Astral Dock, Population Bureau, Titanium Levy) are a season-unique, winner-takes-all race, but nobody knew a race had even started until someone finished it. Everyone now hears about it the moment ground actually breaks.",
    changes: [
      "Every player now gets an Activity Feed entry the moment any player's monument construction begins -- specifically, when the first of its 3 parts starts building, not when the intent is queued or when it finishes"
    ]
  },
  {
    createdAt: 1789019366000, // frozen, 1ms after the MARCH-pathfinding fix entry -- keeps ordering stable
    introducedIn: "2026.09.10.6",
    title: "Fixed a failed attack's tile-flip sometimes showing as unowned until you reselected it",
    why: "When a failed ATTACK counter-captured the attacker's own origin tile back to the defender, the server's follow-up notification for that flip (clearing the origin's muster flag) could be silently dropped for the very players who most needed it -- the attacker who lost the tile and the defender who just reclaimed it -- if the flip also happened to change either player's fog-of-war coverage of that tile in the same instant. The tile's real ownership was correct on the server the whole time; the client's cached copy just never got the update, so it kept rendering the tile as if it belonged to neither side until an unrelated reselect forced a full refetch.",
    changes: [
      "A failed attack that flips your origin tile back to the defender (or a defender reclaiming their tile) now always shows the correct new owner right away, instead of sometimes rendering as an unowned/neutral tile until you click it again"
    ]
  },
  {
    createdAt: 1789019365999, // frozen, 1ms after the muster-3D-overlay fix entry -- keeps ordering stable
    introducedIn: "2026.09.10.5",
    title: "MARCH muster flags now take genuinely shorter routes to their target",
    why: "MARCH picked its next tile using a distance estimate that (1) didn't account for the world wrapping at its edges, so a target actually close by wrap could look ~440 tiles away and get rejected outright, and (2) charged ground already owned (free to move through) the same as a future capture, biasing it toward a tile merely close to the flag over one that continued straight down an already-secured corridor. On top of that, the remaining-distance estimate was always a straight line, so it couldn't tell a clear path from one blocked by water.",
    changes: [
      "MARCH now measures distance to a march target the same way the map actually wraps, so a target near the opposite edge routes across the seam instead of stalling out with \"no target in range\"",
      "MARCH no longer penalizes a candidate for being reached via a longer stretch of already-owned territory -- that ground is free to cross, so it no longer loses out to a closer-to-the-flag candidate that's actually a worse route",
      "MARCH now floods out from the target tile to find real routes around water and other impassable terrain, instead of guessing a straight line that might run straight through an obstacle"
    ]
  },
  {
    createdAt: 1789019365998, // frozen, 1ms after the Great City revert entry -- keeps ordering stable
    introducedIn: "2026.09.10.4",
    title: "Fixed a muster flag's auto-fired attack showing no march animation and flipping the tile before the siege actually resolved",
    why: "An ADVANCE/MARCH flag's attack is fired by the server, not by this client, so it never went through the code that arms the marching-company supply line in 3D (the 2D map already drew it correctly). Separately, the fight's early predicted result -- the same kind of prediction a manually-launched attack always holds back until the real resolution -- was being applied the instant the siege lock started instead, so the contested tile appeared to change hands right away, before the ~30s combat-lock countdown (and its overlay) ever had a chance to show.",
    changes: [
      "A muster flag's auto-fired ADVANCE/MARCH attack now shows the marching supply-line animation on the 3D map while its company is still traveling to the front, matching the 2D map",
      "A muster flag's auto-fired attack no longer flips the contested tile's ownership at the moment the siege starts -- the tile now stays with its current owner and shows the combat-lock overlay for the whole countdown, only changing hands once the real resolution arrives"
    ]
  },
  {
    createdAt: 1788979082413, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.09.1",
    title: "3D ground terrain looks more detailed and less flat",
    why: "The painted ground texture's bump/sheen detail and the flat land's height variation both read as a little too clean and uniform up close. This pushes further within the game's existing hand-painted 3D style -- not a shift to photorealism -- for terrain with more visible texture and a gentler, more natural roll to the land.",
    changes: [
      "Ground texture now has sharper relief and more contrast between duller and shinier patches",
      "Flat land gently rolls instead of reading as a dead-flat plane",
      "Hills now cast and catch shadows like the rest of the terrain, so their shaded side no longer looks flat-lit"
    ]
  },
  {
    createdAt: 1788972991596, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.05.7",
    title: "New worlds place real jungle, marsh, snow, and plains -- plus oases in the desert, and towns that follow rivers",
    why: "Given how much bigger this world is than a typical strategy-game map, the previous 4-biome palette (grass/sand/tundra/coastal) read as repetitive at that scale. This adds four more genuinely distinct visual biomes, oasis landmarks in the desert, and biases new-season town placement toward river paths, so following a river is a real way to find towns instead of towns being placed with no relationship to the map's rivers at all.",
    changes: [
      "New seasons place real jungle (tropical forest), marsh (wet ground near coasts/lakes), snow (the coldest tundra), and plains (a lighter, drier grassland) as genuinely distinct biomes",
      "New seasons scatter oasis landmarks -- a small lake with a fertile ring -- inside large desert regions",
      "New seasons place roughly a third of their towns along river paths, so exploring along a river is a real way to find settlements",
      "Already-running seasons are unaffected -- this only applies to worlds generated from here on"
    ]
  },
  {
    createdAt: 1789050708100, // frozen, 1ms after the monument-announcement entry -- keeps ordering stable
    introducedIn: "2026.09.10.8",
    title: "Great City's second support ring is back, and now actually shows up",
    why: "The second support ring (distance-2 tiles, 24 total instead of 8) for Great City/Metropolis towns was reverted the same day it shipped over a server-cost concern -- restored here with that cost fixed at the source instead. Separately, the ring overlay and support-tile menu logic never actually consulted a town's tier at all: they were hardcoded to the base 8-tile square from the start, so a Great City/Metropolis town's outer ring never rendered, highlighted, or offered tile actions client-side even while the feature was live.",
    changes: [
      "Great City and Metropolis towns draw support structures/tiles from a second ring again (24 tiles total instead of 8)",
      "The support-tile overlay (the glowing ring/hatch highlight) and the tile-action menu now actually show and offer the full ring on Great City/Metropolis towns, instead of only ever the base 8 tiles",
      "The \"Upgrade City to Great City\" tile action mentions the added ring again"
    ]
  },
  {
    createdAt: 1789248022065, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.12.01",
    title: "Fixed buildings rendering much darker than trees in the true-3D map (e.g. Mint Works)",
    why: "Building materials (iron, brass, rivets, etc.) use non-trivial metalness, which in three.js's PBR lighting model scales a surface's diffuse response toward zero -- metallic surfaces are lit almost entirely by reflecting an environment map, not by the scene's hemisphere/sun/fill lights. With no environment map set, metallic buildings had nothing to reflect and rendered near-black, while trees (which use no metalness) were lit normally by the same lights.",
    changes: [
      "The true-3D renderer now bakes a neutral environment reflection and gives it directly to structure materials (Mint Works and other buildings), so they read as properly lit instead of near-black",
      "The reflection is scoped to structures only, not the whole scene -- trees, terrain, and everything else keep their original brightness",
      "Sun/hemisphere/fill lighting and shadows are unchanged"
    ]
  },
  {
    createdAt: 1789225435143, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.13.02",
    title: "Siege Outposts, Siege Towers, and Dread Towers build directly on frontier ground -- no settling first, and their attack bonus applies immediately",
    why: "Placement for the siege ladder already skipped the SETTLED requirement other structures need, but a friendly outpost's attack-aura bonus only ever applied from a SETTLED tile, and the build button still queued a settle-then-build chain (spending gold/manpower to settle a tile the structure never needed settled) that also blocked it outside your own reach even when the tile sat inside another player's -- exactly where a forward siege outpost is meant to be pushed.",
    changes: [
      "A Siege Outpost/Siege Tower/Dread Tower built on a FRONTIER (claimed but unsettled) tile now grants its attack multiplier to nearby attacks immediately, the same as one on a settled tile -- this also fixes the attack-preview shown before committing an attack, which previously undercounted the bonus from a frontier-tile outpost",
      "The \"Build Siege Outpost\"/\"Upgrade to Siege Tower\"/\"Upgrade to Dread Tower\" button no longer settles the tile first -- it builds directly on FRONTIER ground, with no settle cost/time added and no \" • settles this tile first\" label",
      "The siege ladder can now be built on an owned FRONTIER tile that currently sits inside another player's reach, not just your own -- it's still blocked only when no one's reach covers the tile at all",
      "Fixed a misleading \"Need a free UMBRITE slot\" (or other resource) message on a disabled build/upgrade button when 2+ slots were actually required (Siege Tower needs 2 UMBRITE, Dread Tower needs 3, a 2nd+ Observatory needs 1 more CRYSTAL per copy owned) -- freeing exactly one slot left the same message showing, looking stuck. It now names the real count and how many are currently free, e.g. \"Need 2 free UMBRITE slots (have 1)\""
    ]
  },
  {
    createdAt: 1789225435144, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.13.03",
    title: "Siege Battery/Tower/Dread Tower fire on their own attacking battles (true-3D map only)",
    why: "Siege structures gave a static damage bonus but never visibly reacted to the fights they were boosting.",
    changes: [
      "When your attack starts a battle and you own a nearby Siege Battery/Tower/Dread Tower, it snaps to aim and fires a purple Umbrite explosion on the battle tile -- attacker-owned structures only, cosmetic, no change to combat odds",
      "True-3D renderer only for now -- 2D canvas fallback players won't see it"
    ]
  },
  {
    createdAt: 1789375785264, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.14.02",
    title: "The main game HUD got a steampunk-futuristic visual pass -- brass, copper, riveted panels",
    why: "The core HUD chrome (login screen, panel frames, buttons, resource readouts, progress bars) used a generic dark sci-fi-dashboard palette that didn't feel distinct to this game or match Space View's existing steampunk redesign.",
    changes: [
      "New brass/copper/verdigris/aged-leather color palette and Cinzel (headers) + Spectral (body) + Space Mono (numeric readouts) fonts applied across the base HUD background, login/auth screen, side panels, and shared buttons",
      "The login screen's card is now a riveted brass-bordered panel with an engraved inner bevel instead of a soft rounded modern card",
      "Resource pills, the top strip, and side-panel frames now use brass borders and an aged-leather background instead of the old cold blue-gray",
      "Build/queue progress bars now read as analog brass pressure gauges -- tick-marked track, warm glowing brass fill -- instead of a flat modern progress bar",
      "Individual feature panels (fleet, senate, muster, tech tree, season lobby, etc.) still use their prior colors in this pass -- broader coverage is a follow-up"
    ]
  },
  {
    createdAt: 1789375785265, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.03",
    title: "Steampunk visual pass extends to the Fleet, Senate, and Tech Tree panels",
    why: "The last pass reskinned the shared HUD chrome (login, side panels, buttons, gauges) but left the individual gameplay feature panels on their old palettes -- this pass covers the panels players see most often.",
    changes: [
      "Fleet and Senate panels (in Space View) now use the brass/parchment/verdigris palette and Cinzel/Space Mono fonts instead of their old blue-green sci-fi tint -- incoming-raid alerts stay a deliberate red warning color",
      "Tech tree detail cards/modals now use the riveted brass panel frame and parchment/ember text colors instead of the old cold-blue modal",
      "Victory hold alert, ally-request badge, and the town overview stat grid (Population/Gold/Manpower/etc. cards) now use the brass/verdigris/ember palette",
      "Smaller chrome -- bug report modal, player profile card, rush-buy/capture-goto buttons, Discord join button, placement overlay, dev-queue and tile-progress-queued chips -- also picked up the brass palette",
      "Muster flags and the season lobby war-room screen were already on-theme from earlier passes and were left as-is",
      "Still on the old palette for a future pass: the remaining settings sub-panels not listed above, and any minor tooltip/chip not covered here"
    ]
  },
  {
    createdAt: 1789375785266, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.04",
    title: "Steampunk visual pass reaches the settings, debug, and remaining modal chrome",
    why: "The prior two passes covered core HUD chrome and the most-visited gameplay panels, but left settings sub-pages, debug overlays, and several standalone modals on their original dark-blue palette -- this pass is the final coverage push for the reskin.",
    changes: [
      "Settings hub navigation, page headers, and the profile-edit overlay now use the brass/parchment palette instead of cold blue-white",
      "The changelog, guide, respawn, intel, and structure-info modals, plus the on-map targeting card, mini-map/replay controls, mobile context card, and shard alert popup now use the brass/verdigris palette",
      "The debug/diagnostics overlay, rally-link card, and the trickle-pick resource modal are reskinned to match",
      "Dev-queue \"planned\"/\"queued\" tile-progress badges now use brass (planned) and verdigris (queued) instead of the old blue/green",
      "Season lobby and muster-flags panels were already on-theme and are unchanged"
    ]
  },
  {
    createdAt: 1789375785267, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.05",
    title: "Steampunk visual pass closes out the Economy, Domain, Tech Tree, Alliance, and mobile tip gaps",
    why: "A round of player feedback flagged five spots the earlier passes missed -- this pass closes them out.",
    changes: [
      "The Economy panel's resource cards, slot-source/occupant breakdown lines, and income/upkeep columns now use the brass/verdigris/ember palette instead of the old blue-gray",
      "Domain panel boxes -- the shard-network progress card, domain tier blocks, and domain choice/detail cards -- now use the brass/verdigris palette instead of the old dark-blue sci-fi box style",
      "The Tech Tree graph view -- tier headers, node cards, tech-card grid, and branch tags -- now uses the brass/parchment/verdigris palette (the tech detail modal/card was already reskinned in an earlier pass and is unchanged)",
      "The mobile bottom discovery-tip toast (the small floating \"first discovery\" card) now uses brass/parchment colors and Cinzel/Spectral fonts instead of its old amber-on-navy look",
      "The Alliance tab/panel -- request cards, accept/reject/break/cancel actions, and section chrome -- now uses the brass/verdigris (allied) and ember (break/reject) palette instead of its old plain dark GitHub-style look"
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
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_10,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_11,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_14,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_16,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_17,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_18,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_20,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_27,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_29,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_33,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_34,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_36,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_37,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_48,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_49,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_50,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_52,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_53,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_55,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_56,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_57,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_58,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_59,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_60
];
