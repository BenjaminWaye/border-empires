// Older client-changelog entries, split out of client-changelog-data-earlier.ts
// to keep that file under the repo's 500-line cap (see the comment at
// client-changelog-data.ts's top). Same shape and rules apply here:
// unordered, append-only, frozen createdAt literals.
//
// Entries here are still bound by the "latest week only" rule enforced in
// client-changelog.test.ts — this file exists purely to keep
// client-changelog-data-earlier.ts under its line cap when the trailing week
// has a lot of entries, not as a permanent archive. Prune entries here once
// they fall outside the trailing week, same as in the other two files.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_2: ClientChangelogEntry[] = [
  {
    createdAt: 1787693449098, // frozen one ms after the prior latest entry, to avoid pushing the 6-day window past an older "earlier" entry
    introducedIn: "2026.08.26.1",
    title: "Rival borders in true-3D mode are now accurate, not guessed",
    why: "The \"clashing borders\" effect where your reach meets a rival's needed to show exactly where your border ends and theirs begins, but a rival's border was only ever a rough client-side guess with no awareness of your own border -- so the two shapes almost never lined up: the seam effect either never appeared, or the two borders visually crossed through each other instead of meeting cleanly.",
    changes: [
      "The simulation now pushes each visible rival's real border to your client, clipped to what you can currently see -- the same authoritative treatment your own border already gets.",
      "Rival border lines in true-3D mode now line up correctly with your own, so the clashing-borders seam renders where the two actually meet."
    ]
  },
  {
    createdAt: 1787688879680, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.5",
    title: "Manpower for Expand and Settle is now spent the moment you queue them",
    why: "Building deducted manpower as soon as an action was queued, but Expand and Settle didn't -- Expand only charged it once the claim finished (up to ~90s later on forest/hills), and a queued Settle held nothing at all. Both let you queue more actions than your manpower could actually cover, since nothing showed as spent until each one individually went through.",
    changes: [
      "Expand now charges its manpower cost the moment the claim is accepted, refunded if you cancel it or it never resolves.",
      "A queued Settle now reserves its manpower immediately, the same way a queued Build already did."
    ]
  },
  {
    createdAt: 1787643819306, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.1",
    title: "Auto-settle no longer claims resource tiles before you've researched them",
    why: "Auto-settle's eligibility check for a frontier resource tile only asked whether the tile was currently within fog-of-war vision, not whether the settling player had actually researched the tech that reveals that resource (Titanium needs Masonry, Umbrite needs Leatherworking, Gems/Crystal need Crystal Lattices). That let auto-settle grab a scouted-but-unresearched resource tile out from under you before you'd unlocked it.",
    changes: [
      "Auto-settle now also requires the resource's revealing tech to be researched before it will claim that tile -- FARM/FISH tiles are unaffected since food was never tech-gated."
    ]
  },
  {
    createdAt: 1787651082566, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.2",
    title: "Added a new-player checklist for founding your first town and securing food",
    why: "Brand-new players had no in-game guidance pointing them toward the two things that matter most in the opening minutes: settling a first town, and claiming enough grain/fishing tiles to keep it fed. Nothing on the map called those tiles out, so new players could wander for a while before realizing food mattered.",
    changes: [
      "New empires now see a two-step onboarding checklist: settle your first town, then claim 4 food slots (any mix of grain and fishing tiles). The map highlights your town and nearby unclaimed grain/fish tiles until each step is done, and the checklist disappears for good once you're food-secure."
    ]
  },
  {
    createdAt: 1787643819308, // frozen just after this file's prior latest entry, to avoid a createdAt collision
    introducedIn: "2026.08.25.3",
    title: "Fixed borders not expanding after a reach anchor finished while you were away",
    why: "A Relay Beacon (or any reach anchor) that finished building while you were disconnected expanded your border on the server, but the update was sent before your connection was ready to receive it and was silently dropped. Reconnecting did not recover it, so the game kept showing your old border -- and because the waypoint planner uses the same border, queued expansions could stall against territory the server had already granted you.",
    changes: [
      "Your authoritative border is now pushed once your connection is fully established, so a reach anchor that completed while you were offline shows up as soon as you log back in."
    ]
  },
  {
    createdAt: 1787616000000, // 2026.08.25.1 — frozen; was Date.now() in the merged commit
    introducedIn: "2026.08.25.1",
    title: "Fixed sea tiles rendering as solid black from some camera angles",
    why: "The 3D water surface only got its color from directional lighting, with a near-black fallback (emissive 0x030e18) for anything that fell into shadow. Viewed from the south -- opposite the sun and fill light -- water faces caught neither light and the near-black fallback read as a black hole instead of dark sea.",
    changes: [
      "The water material's shadow-floor color is now a dim tint of the actual deep-water color instead of near-black, so unlit sea tiles read as dark water at any camera angle."
    ]
  },
  {
    createdAt: 1787678887251, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.3",
    title: "Rivers now curve smoothly and taper toward the sea instead of looking like glued-together rectangles",
    why: "The 3D river ribbon connected each walked point with a straight segment and a constant width the whole way, so every wobble step in the path showed up as a hard kink and every river read as a uniform-width strip regardless of how far it had traveled -- the classic 'blue rectangles' look rather than a real river.",
    changes: [
      "River paths are now smoothed with a Catmull-Rom curve and resampled at higher density, removing the faceted straight-segment look.",
      "River width now tapers from narrow at the source to wide at the mouth, based on how far each point has flowed toward the sea."
    ]
  },
  {
    createdAt: 1787643819307, // frozen just after this file's prior latest entry, to avoid a createdAt collision
    introducedIn: "2026.08.25.2",
    title: "Fixed spawns landing next to resources across water",
    why: "A new player's starting position only had to be within straight-line distance of a farm or fishing spot to count as \"nearby\" -- so a spawn could land on a coastline whose closest food was actually on the far side of a strait or a separate island, unreachable without crossing water.",
    changes: [
      "Spawn placement now requires that nearby food and towns be on the same landmass as the spawn point, not just within range as the crow flies."
    ]
  },
  {
    createdAt: 1787650830571, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.1",
    title: "Farmstead now grants +2 FOOD slots instead of +1",
    why: "Farmstead's same-tile FOOD slot boost was tied with Mine/Umbrite Rig's +1, even though it's a dedicated food building -- a bigger boost makes it more worth building and gives Waterworks (which multiplies Farmstead's bonus) more to amplify.",
    changes: [
      "An active Farmstead on a FARM tile now adds +2 FOOD slots to that tile instead of +1. Waterworks' separate +2-per-Farmstead-in-radius bonus is unchanged and stacks on top."
    ]
  },
  {
    createdAt: 1787691503245, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.3",
    title: "Added a Discord link to the settings menu",
    why: "The community Discord invite was only reachable from the season lobby overlay, so players already in a game had no in-app way to find it.",
    changes: [
      "Settings now has a \"Join the Discord\" link alongside Log Out."
    ]
  },
  {
    createdAt: 1787693449097, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.8",
    title: "Fixed three bugs in the new-player checklist",
    why: "The checklist bubble overlapped the \"Center / Jump to your banner\" button in the bottom-left corner, its first step counted the free starting settlement (SETTLEMENT tier) as an already-settled town so it skipped straight to the food step, and its map highlight ring was drawn with flat 2D isometric math that put it in the wrong place entirely when playing in true-3D mode.",
    changes: [
      "The checklist bubble now sits above the Center/banner button instead of on top of it.",
      "The \"find your first town\" step now requires reaching TOWN tier -- the free starting settlement no longer counts on its own.",
      "In true-3D mode, the highlight is now a real ring mesh placed on the terrain instead of a flat 2D overlay."
    ]
  },
  {
    createdAt: 1787724130000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.1",
    title: "Restyled the settings menu's Discord button",
    why: "The \"Join the Discord\" link in the settings menu was a plain generic button that didn't stand out or read as a Discord link at a glance.",
    changes: [
      "The Discord link in Settings now uses Discord's blurple branding with the Discord logo, so it's instantly recognizable."
    ]
  },
  {
    createdAt: 1787693449098, // frozen one ms after the prior latest entry, to avoid pushing the 6-day window past an older "earlier" entry
    introducedIn: "2026.08.26.1",
    title: "Rival borders in true-3D mode are now accurate, not guessed",
    why: "The \"clashing borders\" effect where your reach meets a rival's needed to show exactly where your border ends and theirs begins, but a rival's border was only ever a rough client-side guess with no awareness of your own border -- so the two shapes almost never lined up: the seam effect either never appeared, or the two borders visually crossed through each other instead of meeting cleanly.",
    changes: [
      "The simulation now pushes each visible rival's real border to your client, clipped to what you can currently see -- the same authoritative treatment your own border already gets.",
      "Rival border lines in true-3D mode now line up correctly with your own, so the clashing-borders seam renders where the two actually meet."
    ]
  },
  {
    createdAt: 1787766488424, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.2",
    title: "Incubation Engine now grants ongoing population growth, not just a one-time burst",
    why: "The Incubation Engine (Granary) only ever paid off once, on the tick it finished building, then sat there doing nothing for the rest of the game -- a Seed Granary's ongoing growth boost made the base building feel like a dead end once its instant burst was spent.",
    changes: [
      "A completed Incubation Engine now also grants a flat +10% ongoing population growth rate for its town, on top of the existing +10,000 instant population burst on completion.",
      "A Seed Granary's own buffed-radius growth bonus still stacks on top of this when it applies."
    ]
  },
  {
    createdAt: 1787769924625, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.3",
    title: "Aether Condensers can now stack on the same town",
    why: "Every other support-ring economic building in a family (Umbrite Works, Titanium Works, etc.) was already unlimited empire-wide with only a one-per-town cap forcing you to found more towns for more supply -- but the Aether Condenser's rejection also surfaced the raw internal name (\"crystal synthesizer\") instead of its real name, and its one-per-town cap didn't need to be as tight since it has no network-wide effect to worry about stacking.",
    changes: [
      "A town can now host more than one Aether Condenser (or Advanced Aether Condenser), limited only by its open support tiles, instead of exactly one.",
      "The \"town already has...\" rejection now says \"Aether Condenser\" instead of the internal \"crystal synthesizer\" name."
    ]
  },
  {
    createdAt: 1787818239063, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.27",
    title: "Settling a new town no longer knocks out unrelated Relay Beacons",
    why: "A settled town's FOOD demand was pinned as the oldest (never-goes-dormant) contributor in the FOOD-slot shortfall calculation, while every other FOOD consumer competed newest-built-first. That meant a brand-new town's own added FOOD demand could never itself go unfed -- so a shortfall it caused was silently paid for by disabling whatever unrelated structure (e.g. an existing Relay Beacon) happened to be the newest FOOD consumer instead, even if that structure had been built long before the town and had nothing to do with the shortfall.",
    changes: [
      "A town's FOOD demand now competes on the same newest-first footing as every other FOOD consumer, ranked by when it was settled -- so a freshly settled town that pushes FOOD demand over supply goes unfed itself, instead of an older, unrelated Relay Beacon or other structure losing power to cover it."
    ]
  },
  {
    createdAt: 1787822976132, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.27",
    title: "Build Aether Condenser button no longer falsely disabled, Sell Off gold now shows as a modifier",
    why: "The Build Aether Condenser button still disabled itself with \"Nearby town already has Aether Condenser\" in a town that already had one, even though the server exempts this building family from the usual one-per-town cap entirely. Separately, switching a converter (Aether Condenser, Titanium Works, Umbrite Works) to Sell Off (EXCHANGE) mode always produced real gold, but the Modifiers panel dropped the entry entirely instead of showing it -- the tile's own status line named the behavior (\"selling off its slot and paying out gold\") but never the amount, so there was no way to see the actual gold/day figure anywhere.",
    changes: [
      "Build Aether Condenser now stays enabled in a town that already has one, matching the server's support for stacking multiple.",
      "A converter structure in Sell Off mode now shows a \"Sell Off gold: +N/day\" modifier line matching its real payout, instead of no modifier at all."
    ]
  },
];
