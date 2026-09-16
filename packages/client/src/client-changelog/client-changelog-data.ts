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
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_60 } from "./client-changelog-data-earlier-60.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_61 } from "./client-changelog-data-earlier-61.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_62 } from "./client-changelog-data-earlier-62.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_63 } from "./client-changelog-data-earlier-63.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_64 } from "./client-changelog-data-earlier-64.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_65 } from "./client-changelog-data-earlier-65.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_66 } from "./client-changelog-data-earlier-66.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_67 } from "./client-changelog-data-earlier-67.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_68 } from "./client-changelog-data-earlier-68.js";
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
    createdAt: 1789549757906, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.16.1",
    title: "Hills read as gentle, connected highland rather than a stamped pointy peak",
    why: "Hill tiles used to render as one or three sharply pointed mounds, and two adjacent hill tiles never actually joined up -- the connecting bridge between them tapered to nothing just short of the shared edge, so a hill patch or ridge always looked like separate stamped bumps with thin gaps between them. Separately, the ownership tint draped over a hill used a coarser mesh than the hill's own surface, letting a sliver of the water/fog colour underneath show through as a light-blue glitch.",
    changes: [
      "Hills are now a broad, irregular, almost-flat raised mound with 3 small, barely-noticeable points, sloping gently down to ground level at the tile edge",
      "Two hill tiles that are cardinal neighbours now visibly merge into one connected landmass instead of leaving a gap at their shared border",
      "Fixed a light-blue glitch in the settled-tile ownership tint where it drapes over a hill"
    ]
  },
  {
    createdAt: 1789549757905, // frozen, 1ms after the newest existing entry
    introducedIn: "2026.09.16.03",
    title: "Watchtower and Waystation sites now actually appear in new seasons",
    why: "The season worldgen pipeline correctly placed Watchtower and Waystation sites on the map, but a field-whitelist step that copies each generated tile into the season's persisted starting state never included those two fields alongside similar site types like docks and natural wonders, so every placed site was silently dropped before the season ever went live. This affected every season generated so far -- players who never found a Watchtower or Waystation weren't missing them by chance, the sites were never actually there.",
    changes: [
      "Fixed the season worldgen pipeline so Watchtower and Waystation sites placed by the generator now survive into the live map",
      "Only affects seasons generated after this ships -- the currently running season's map is unchanged"
    ]
  },
  {
    createdAt: 1789549757904, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.16.02",
    title: "Fixed: owned frontier ground stuck with no reach and no path back after a server restart",
    why: "The persistent reach border isn't saved to disk -- it's rebuilt at boot from your towns/outposts/docks currently active right now, replaying the same contest a live anchor activation uses. A live empire's border grows past those anchors' base radius over a session (EXPAND pushes it outward tile by tile), and that accumulated growth isn't anchor geometry, so a restart's replay can't reproduce it. A tile you still owned but that sat outside every current anchor's disk came back from a restart with no reach and, because nothing ever re-evaluates an already-owned tile's coverage outside of a live anchor loss, no way to ever resolve on its own -- it just sat there permanently, reading as if it belonged to someone else.",
    changes: [
      "After a restart, an owned frontier tile the reach border doesn't currently cover now starts the same out-of-reach countdown a live anchor loss would give it, instead of sitting in permanent limbo -- it resolves within that window by regaining reach (if an anchor still covers it once re-evaluated) or reverting to neutral ground, matching how undefended frontier is meant to behave everywhere else",
      "This never grants reach outright and never touches ground a rival's live reach is already contesting, so it can't resurrect the earlier reach/ownership mismatch bug the boot-time border contest exists to prevent"
    ]
  },
  {
    createdAt: 1789541688935, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.16.01",
    title: "Fixed: attacking an enemy's frontier tile no longer shows the claim sweep over still-enemy-colored ground",
    why: "Instant-capturing an undefended frontier tile reuses EXPAND's \"becoming mine\" plate sweep in the 3D renderer. That looks right for a real EXPAND target, which has no owner tint to begin with, but an ATTACK on an enemy's frontier tile keeps that enemy's color tinting the tile the whole time -- ownerId only actually changes once the server resolves the capture. The sweep ended up animating on top of ground that never visually went neutral first, instead of the intended neutral-then-mine transition.",
    changes: [
      "The 3D map now hides a frontier tile's owner tint for the duration of an ATTACK claim against it (this client's own manual attack or a muster flag's auto-fire), so the target reads as neutral ground while the claim-plate sweep fills it in with your color, matching a real EXPAND target",
      "The 2D renderer never had this per-tile sweep animation (it only shows the \"Capturing Territory...\" progress banner), so it had no equivalent visual mismatch to fix"
    ]
  },
  {
    createdAt: 1789417055105, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.15.03",
    title: "Waystation activation popup now has hero art",
    why: "The Waystation activation reward popup was plain text on a dark panel -- eyebrow label, coordinates, one line of copy -- despite its own PR description claiming it was visually modeled on the Town Captured popup, which has a hand-illustrated skyline hero. That gap was easy to miss because nothing in the code or the popup itself called it out.",
    changes: [
      "Activating a Waystation now shows a hero illustration of the frontier rig (mast, glowing lens, roofed shelter, crates) above the reward text, matching the Town Captured popup's visual treatment",
      "The reward copy now reads as a narrative sentence (e.g. naming the actual town a Population burst moved into) followed by a bold \"Modifiers\" line with the concrete effect",
      "The Population reward now offers a \"Jump to Town\" button, and the Tech reward's \"Unlocked: <name>\" line is now clickable and opens that tech's detail panel"
    ]
  },
  {
    createdAt: 1789417055104, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.08",
    title: "Siege Tower and Dread Tower beams open the fight by taking out a defender",
    why: "The siege tower's aether lens already swung to track and beam an ongoing battle, but the beam never appeared to do anything -- marines fell purely on their own combat-resolved schedule with no visual link to the tower supposedly firing on them. This ties the two together: when a real Siege Tower or Dread Tower is beaming a tile, the beam now strikes down a defender right as combat starts, opening the fight.",
    changes: [
      "While a Siege Tower or Dread Tower is beaming a battle, its lance now strikes an actual defending unit combat resolution already scheduled to fall, right as the fight begins -- this attributes an existing casualty to the tower and moves only that one unit's own visual death timing up to the start of the fight; it never changes who wins, who dies, or the units' own combat rolls",
      "No change when no siege tower is present, or when the tower is aimed at a different battle -- the beam stays purely decorative in that case, as before"
    ]
  },
  {
    createdAt: 1789417055103, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.07",
    title: "Battles open with a blue-violet opening strike",
    why: "A squad's approach march used to lead straight into the firefight with no beat marking the transition, so combat felt like it just started rather than being kicked off by anything. A single lance now drops onto the tile right as the approach ends, giving the clash a clear opening shot before the marines' own empire-colored bolts take over.",
    changes: [
      "A blue-violet lance now strikes down onto a battle tile in the last moment before a squad's firefight begins, landing right as combat commences",
      "This opening strike is separate from the empire-colored bolts marines trade during the fight itself -- it's a one-time cosmetic beat, not a new combat mechanic"
    ]
  },
  {
    createdAt: 1789417055102, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.06",
    title: "Siege towers rise as towering aether artillery",
    why: "The upgraded siege variants (Siege Tower and its Dread Tower successor) shared the Siege Battery's compact carriage, so a max-tier siege engine looked like a planted cannon instead of the looming war machine its stats describe. They're now distinct towers: a heavy black-iron lattice braced on stabilizer legs, one enormous glowing aether lens in a brass gimbal, and a cyan-violet beam that swings down at the latest ongoing battle.",
    changes: [
      "Siege Tower and Dread Tower now render as tall black-iron towers with a huge glowing aether lens instead of the Siege Battery's low cannon carriage",
      "Each tower's lens swings to track the most recently started ongoing battle, firing a beam that fades in while the fight is live and dims the moment it ends",
      "New \"Siege Tower Aim\" setting in the Gameplay settings lets you choose between aiming just the aether lens or rotating the whole tower toward the battle"
    ]
  },
  {
    createdAt: 1789417055101, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.15.02",
    title: "Waystations now grant one random reward instead of all four at once",
    why: "Activating a Waystation granted every one of its four effects (map reveal, population burst, free tech, resource slot) simultaneously, every time -- a guaranteed grab-bag rather than a reward with any variance. Waystations are common enough (~1 per 400 tiles) that this made each activation feel like a checklist instead of a discovery.",
    changes: [
      "Expanding onto a Waystation now grants exactly ONE of the four rewards, chosen at random, instead of all four at once",
      "The map-reveal reward now centers on the nearest town within range (any owner) instead of the Waystation's own tile, so it points you at something worth knowing about -- falls back to revealing around the Waystation itself if no town is nearby",
      "The free-tech reward now grants a random tier-1 tech you don't already own, instead of always granting the same fixed tech",
      "The resource-slot reward now adds its +1 slot to whichever of Food/Titanium/Crystal/Umbrite your empire currently has the fewest slots of, instead of bumping all four at once",
      "A new popup now shows exactly which reward you received when you activate a Waystation"
    ]
  },
  {
    createdAt: 1789417055100, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.15.01",
    title: "Fixed a false-positive fatal-error screen on some map tile clicks",
    why: "Clicking between location tiles quickly could interrupt the location's one-shot sound effect mid-play, which browsers report as a harmless rejected play() promise. That rejection wasn't caught, so it tripped the app's global error guard and showed the full-screen \"Border Empires hit a problem loading\" reload overlay even though nothing was actually broken.",
    changes: [
      "A rapid location-tile theme change no longer triggers the fatal \"hit a problem loading\" reload screen"
    ]
  },
  {
    createdAt: 1789417055099, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.07",
    title: "Fixed a stability issue from the earlier barbarian-attack AI fix",
    why: "An earlier fix let AI empires retarget instantly (no cooldown at all) after an attack was rejected because the target changed hands. On a fast-moving barbarian frontier that meant some AI empires could resubmit rejected attacks every single game tick with nothing slowing them down, which piled up enough simultaneous work on the game server to stall it -- for a period, no one could log in.",
    changes: [
      "AI empires retargeting after a barbarian border flip now wait a brief moment (about a second) before attacking again, instead of instantly resubmitting -- still fast enough that it doesn't get stuck, but no longer able to overwhelm the server"
    ]
  },
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
  },
  {
    createdAt: 1789375785268, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.06",
    title: "Hills and coastlines look less like a square grid",
    why: "Square-tile terrain reads as a checkerboard when hills are a single stamped dome and coastlines trace the tile lattice exactly -- this makes both read as organic, irregular ground on the 3D map.",
    changes: [
      "Hill tiles now render as a cluster of 3 small, irregularly placed low mounds instead of one perfectly centered dome, with the shape varying per hill tile",
      "Coastlines now wobble slightly off the tile grid instead of tracing a perfectly straight/right-angled shoreline -- purely visual, no change to which tiles are land vs. sea",
      "2D canvas fallback renderer is unchanged (its flat hard-edged tiles remain the simple accessibility path)"
    ]
  },
  {
    createdAt: 1789506746396, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.15.01",
    title: "Diagonal land tiles now read as a connected landmass instead of a pinched-off water gap",
    why: "A 3D map vertex shared by 4 tiles couldn't tell a diagonal LAND/SEA checkerboard (land at two opposite corners, sea at the other two) apart from a normal coastline -- both looked identical to the corner's land/sea tally, so two diagonally touching land tiles always showed a thin ring of beach/sea between them at that corner, no matter how the coastline wobble (shipped separately) was tuned. This purely visual fix recognizes that specific diagonal arrangement and biases the shared corner's blend and elevation toward land instead, so the pair reads as a narrow spit/isthmus connecting them rather than a pinch of water. Doesn't change which tiles are actually land vs. sea.",
    changes: [
      "Two diagonally touching land tiles on the 3D map now read as connected by a narrow land bridge at their shared corner, instead of always showing a thin ring of beach/sea between them",
      "2D canvas fallback renderer is unaffected -- it draws each tile as its own independent square with no shared-corner blending across tiles, so this pinch-point problem never existed there"
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
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_60,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_61,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_62,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_63,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_64,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_65,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_66,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_67,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_68
];
