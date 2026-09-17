// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_76: ClientChangelogEntry[] = [
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
  }
];
