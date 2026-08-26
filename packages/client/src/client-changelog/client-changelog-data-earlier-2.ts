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
    createdAt: 1787651082566, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.2",
    title: "Added a new-player checklist for founding your first town and securing food",
    why: "Brand-new players had no in-game guidance pointing them toward the two things that matter most in the opening minutes: settling a first town, and claiming enough grain/fishing tiles to keep it fed. Nothing on the map called those tiles out, so new players could wander for a while before realizing food mattered.",
    changes: [
      "New empires now see a two-step onboarding checklist: settle your first town, then claim 4 food slots (any mix of grain and fishing tiles). The map highlights your town and nearby unclaimed grain/fish tiles until each step is done, and the checklist disappears for good once you're food-secure."
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
    createdAt: 1787584599966, // frozen just after this file's prior latest entry, to avoid a createdAt collision
    introducedIn: "2026.08.24.6",
    title: "Added basic sign-up analytics",
    why: "We had no way to see where new players were coming from, or how many visitors from a shared link actually created an account -- link attribution and conversion were both invisible.",
    changes: [
      "The client now reports page landings and a sign-up event (for new accounts created by email, Google, or email-link sign-in) to Google Analytics, so shared links can be attributed by source/campaign and tracked through to conversion."
    ]
  },
  {
    createdAt: 1787584599967, // frozen just after this file's prior latest entry, to avoid a createdAt collision
    introducedIn: "2026.08.24.7",
    title: "Renamed AI empires to first names only",
    why: "AI empire names paired a first name with a surname that read as a fantasy/game surname (e.g. \"Sigrid Storm\", \"Edvin Frost\"), which looked out of place next to real players' names on the leaderboard.",
    changes: [
      "AI-controlled empires on the leaderboard now show a single first name (e.g. \"Sigrid\", \"Edvin\") instead of a first-plus-surname combo."
    ]
  },
  {
    createdAt: 1787584599968, // frozen just after this file's prior latest entry, to avoid a createdAt collision
    introducedIn: "2026.08.25.1",
    title: "Queued buildings now reserve manpower and a resource slot up front",
    why: "A BUILD queued behind another in-progress build didn't cost anything until it actually started -- so nothing stopped you from queuing far more than you could afford, and since players often queue things up and go offline, a shortfall could sit hidden for a long time before finally surfacing as a silently dropped build once its turn came.",
    changes: [
      "Queuing a building now reserves its manpower cost and a resource slot immediately, refunded in full if you cancel it while queued.",
      "You can no longer queue more buildings than you can currently afford or have slots for -- the queue now rejects an addition it can't reserve for, instead of accepting it and failing silently later.",
      "Reserved manpower is also handed back if anything goes wrong while queuing, so it can never be lost to an unexpected error."
    ]
  },
  {
    createdAt: 1787584599969, // frozen just after this file's prior latest entry, to avoid a createdAt collision
    introducedIn: "2026.08.25.2",
    title: "Fixed the Expand To / dev queue silently emptying after a server restart",
    why: "The frontier expand queue (\"Expand To\") and the development queue were only ever held in the simulation server's memory. They survived a player disconnecting and reconnecting, but a cold restart of the game server reset both queues to empty with no warning -- queued expand targets and build/settle orders were just gone, including any manpower and resource slot a queued build had reserved.",
    changes: [
      "The Expand To queue and the development queue now survive a server restart -- both are saved with the rest of your empire's state and restored exactly as you left them, including a queued building's reserved manpower and resource slot."
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
    createdAt: 1787429155443,
    introducedIn: "2026.08.22.12",
    title: "Fixed a dark \"crack\" flickering at animated shorelines",
    why: "Every coastline's animated water can dip deep enough at a wave trough to reveal the coastal skirt wall underneath it, which was shaded so dark that it read as a jarring black gap right at the shoreline.",
    changes: [
      "Brightened the coastal skirt wall's shading so it no longer looks near-black when the water's wave animation passes through a deep trough."
    ]
  },
  {
    createdAt: 1787380000000,
    introducedIn: "2026.08.22.3",
    title: "Battle preview dots now throw glyphs and take casualties during the siege countdown",
    why: "During a siege countdown, the pre-resolution skirmish animation just had dots vibrating at the tile center with no visual payoff -- no symbols thrown into the air, no losses. When the outcome finally arrived, the sudden appearance of glyph bursts, casualties, and the rout phase was a jarring switch. The skirmish now plays the same clash-phase effects as the resolved battle so the transition is seamless.",
    changes: [
      "Glyph bursts (the rune/shard particles) now spawn continuously throughout the skirmish clash, not just when combat resolves.",
      "Both sides now shed 2 of 10 dots during the skirmish's first clash cycle (WINNER_DEATHS per side), mirroring the resolved battle's casualty system so the swarm is already thinning when the outcome lands.",
      "When the resolved outcome arrives, the loser side simply sheds 2 more dots mid-clash and the rout begins naturally -- no sudden switch from a static vibration to a full animation."
    ]
  },
  {
    createdAt: 1787430200000,
    introducedIn: "2026.08.22.4",
    title: "Auto-settle no longer fires on tiles that have drifted out of reach",
    why: "Queuing a settle-then-build (or letting an AI empire's frontier auto-settle) could still fire once the tile had fallen out of reach in the meantime -- the server always rejected it as out-of-reach, but nothing checked first, so it just silently failed instead of being dropped up front.",
    changes: [
      "Both the player's queued auto-settle and an AI empire's automatic frontier settlement now check reach before sending a settle command, dropping the queued action instead of sending one that's guaranteed to be rejected.",
      "When a settled tile gets overtaken and reverts to a frontier tile because a rival's territory grew over it, it now plays a brief collapsing pylon effect on the map instead of changing silently."
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
    createdAt: 1787429155443,
    introducedIn: "2026.08.22.12",
    title: "Fixed a dark \"crack\" flickering at animated shorelines",
    why: "Every coastline's animated water can dip deep enough at a wave trough to reveal the coastal skirt wall underneath it, which was shaded so dark that it read as a jarring black gap right at the shoreline.",
    changes: [
      "Brightened the coastal skirt wall's shading so it no longer looks near-black when the water's wave animation passes through a deep trough."
    ]
  },
  {
    createdAt: 1787430600000,
    introducedIn: "2026.08.22.8",
    title: "Creating a mountain now clears any muster flag staged on the tile",
    why: "Turning a tile into a mountain destroyed the tile's ownership, but the muster flag staged on it stuck around, showing a stale muster icon on ground you no longer held.",
    changes: [
      "Creating a mountain on a tile with a staged muster flag now clears the flag along with the tile's ownership, matching how bombardment, capture, and tile shedding already handle it."
    ]
  },
  {
    createdAt: 1787430700000,
    introducedIn: "2026.08.22.9",
    title: "Muster flags now clear reliably after losing a tile in combat",
    why: "Losing an attack could hand your attacking tile to the enemy, and if that tile then fell outside your visible area in the same instant, the server's notice that the tile (and its staged muster flag) changed hands never reached your client -- the flag stayed stuck on ground you no longer owned until you happened to re-scout it.",
    changes: [
      "The server now always tells you when a tile you just lost -- whether your attack's origin was overrun or a target you held was captured -- changes hands, even if you no longer have vision of it, so a cleared muster flag (and the rest of that tile's state) updates immediately instead of going stale."
    ]
  },
  {
    createdAt: 1787484432246, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.23.2",
    title: "Fixed the whole screen becoming unclickable after submitting a bug report",
    why: "Closing the redesigned bug report dialog (including automatically, after a successful submit) only cleared its contents -- the full-screen invisible container div stayed in the DOM with pointer-events left on, silently intercepting every click across the entire game until you reloaded the page.",
    changes: [
      "Closing the bug report dialog (including the automatic close after a successful submission) now properly stops it from blocking clicks, so the game stays fully interactive without needing a page reload."
    ]
  },
  {
    createdAt: 1787557977223, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.24.1",
    title: "Fixed laggy panning/zooming on wide monitors",
    why: "The map's per-frame draw loop redrew every on-screen tile with no ceiling on how many tiles that could be. On a wide or ultrawide monitor zoomed all the way out, that meant tens of thousands of tiles redrawn every single frame -- pegging the main thread and making panning and zooming visibly stutter, especially on larger screens.",
    changes: [
      "The map now caps how many tiles it draws per frame to the same budget already used elsewhere in the renderer, shrinking the visible radius slightly (rather than stalling) only in the most zoomed-out state on unusually wide screens."
    ]
  },
  {
    createdAt: 1787430800000,
    introducedIn: "2026.08.22.10",
    title: "Your galaxy planet now shows what it's specialized in",
    why: "The galaxy view showed which victory path crowned your planet, but not what that meant going forward -- part of the early galactic meta-layer groundwork (docs/galactic-campaign-design.md), where each victory path is meant to grant a distinct planet specialization.",
    changes: [
      "Your galaxy planet (named or not-yet-named) now shows a specialization badge -- Industrial, Trade, Extraction, Logistics, or Capital -- based on which victory condition crowned it."
    ]
  },
  {
    createdAt: 1787432000000,
    introducedIn: "2026.08.22.12",
    title: "Your galaxy planets and outposts now earn Influence and Production, and can lose Stability",
    why: "The galaxy view previously showed your Planets/Outposts/Stipends as a static record with nothing ongoing attached to them -- the galactic meta-layer's actual economy (docs/galactic-campaign-design.md §4/§5/§7) wasn't running yet. This introduces the first slice of that economy: a weekly Cycle tick that trickles Influence/Production income from your held territory, charges Influence upkeep for spreading wide, and drains or recovers each territory's Stability accordingly.",
    changes: [
      "Your galaxy view now shows a running Influence/Production balance, updated once per weekly Cycle based on your held Planets' and Outposts' specializations.",
      "Holding more Planets costs more Influence upkeep -- Outposts still cost nothing to hold, staying the cheap entry rung for newer empires.",
      "Each held Planet and Outpost now has a Stability meter (0-100), shown as a bar under it in the galaxy view. Falling into an Influence deficit drains your weakest territory's Stability over time; a healthy Influence surplus recovers all of them."
    ]
  }
];
