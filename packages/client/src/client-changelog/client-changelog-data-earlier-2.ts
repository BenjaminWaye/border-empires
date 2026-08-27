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
    createdAt: 1787501551523, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.23.4",
    title: "Lowered the season player cap to 50",
    why: "The lobby was hitting the prior 120-player cap; capping seasons at 50 keeps them a manageable size.",
    changes: [
      "New seasons now stop admitting new players once 50 human players have joined, down from 120."
    ]
  },
  {
    createdAt: 1787489000059, // frozen from a live Date.now() call
    introducedIn: "2026.08.23.3",
    title: "Fixed camera not recentering when you spawn mid-session",
    why: "Joining a season while already connected (rather than on a fresh page load) spawned your starting territory, but the camera stayed wherever you'd been panning beforehand and never moved to your new settlement -- and since the camera controls which map area loads, you could end up looking at empty, unloaded darkness with no way to find your own empire.",
    changes: [
      "Joining a season mid-session now recenters the camera on your new settlement as soon as it spawns.",
      "The map around your new settlement now loads immediately instead of requiring a manual pan to trigger it.",
      "The stale pre-spawn camera position is no longer saved for next time you load the game."
    ]
  },
  {
    createdAt: 1787476076398, // frozen just after this file's prior latest entry, to avoid pushing the 6-day window past an older "earlier" entry
    introducedIn: "2026.08.23.2",
    title: "Expand is gated to your reach again, with a new way to reach an out-of-reach rival",
    why: "Expanding onto land outside your reach border used to succeed, then quietly go nowhere -- you couldn't settle it, build on it, or hold it against a rival's growing border, so it just sat there looking claimed while doing nothing. That was confusing without adding anything you could actually use it for.",
    changes: [
      "Expand now requires the target tile to be inside your reach border, same as Settle already did.",
      "The one exception: if a rival's reach border touches yours, you can still expand into their reach right at that contact point -- opening a legal Attack origin against them even if none of your other territory reaches that far.",
      "Where two empires' reach borders touch, the border pylons and connecting lines now blend into a shared translucent beam instead of showing one owner's solid color, with faint drifting dust in both empires' colors passing through it."
    ]
  },
  {
    createdAt: 1787487792786, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.23.3",
    title: "Punched up the season-lobby copy",
    why: "The 'Season starts soon' text was accurate but flat -- it read like a disclaimer instead of hyping up the moment everyone's about to launch together.",
    changes: [
      "The join-season overlay now reads \"Same starting line for everyone -- the whole season kicks off in one shot, no head starts,\" with the timezone caveat kept as a short aside."
    ]
  },
  {
    createdAt: 1787485929859, // frozen from a live Date.now() call
    introducedIn: "2026.08.23.3",
    title: "Fixed the name/color picker not showing for new players joining a season",
    why: "The season lobby's full-screen treatment hides every other overlay on screen while it's up -- including the name/color setup screen, which needs to run first for a brand-new player. A new player hitting a pending or newly-started season had no screen left to pick a name and color on, so it silently never appeared.",
    changes: [
      "The season lobby now waits for name/color setup to finish before taking over the screen, instead of hiding it."
    ]
  },
  {
    createdAt: 1787484620520, // frozen from a live Date.now() call
    introducedIn: "2026.08.23.2",
    title: "Fixed the season lobby's cog vibrating instead of turning, and the invite button appearing to do nothing",
    why: "The season lobby overlay rebuilt its entire DOM on every render pass, most of which fire from ordinary background traffic unrelated to the lobby itself -- that reset the brass cog's CSS animation before it ever completed a visible rotation (looked like vibrating), and wiped out the invite button's \"Copied!\" confirmation within milliseconds of clicking it, making the button look broken even though the copy succeeded. Separately, reloading the page while waiting in the lobby dropped you back to a plain \"Join Season?\" prompt with an empty player list instead of returning you straight to the countdown you were already in.",
    changes: [
      "The season lobby's cog now spins smoothly, and the countdown/roster no longer flicker on every background update.",
      "The \"Bring a friend\" button's \"Copied!\" confirmation is now visible long enough to actually see it.",
      "Reloading the page (or reconnecting) while waiting in the pending-season lobby now returns you straight to the countdown with the live player count and roster, instead of showing an empty \"Join Season?\" prompt first."
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
    createdAt: 1787462871189, // 2026.08.23.05 — frozen from a live Date.now() call
    introducedIn: "2026.08.23.05",
    title: "Turned off rivers in new map generation",
    why: "Generated rivers didn't fully work -- they could cut land in ways that broke territory shapes and pathing, so we're disabling them until the generator is fixed.",
    changes: [
      "New maps no longer generate rivers; existing maps are unaffected."
    ]
  },
  {
    createdAt: 1787472289089, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.23",
    title: "Settled resource tiles now show their real slot production instead of stale prose",
    why: "A settled Farm/Fish/Titanium/Gems/Umbrite tile's overview said \"Resource node can produce food once developed and collected\" even after being settled -- a holdover from the old per-day yield model. FOOD/TITANIUM/CRYSTAL/UMBRITE production moved to the slot-supply system a while ago, so that line was permanently stale and never resolved into a real number.",
    changes: [
      "A settled resource tile's overview now shows a \"Production:\" line with the actual FOOD/TITANIUM/CRYSTAL/UMBRITE slot count it contributes (e.g. \"Production: 🍞 Food +1\"), matching the format already used for buildings, instead of the old \"can produce ... once developed and collected\" prose.",
      "A Farmstead/Mine/Umbrite Rig built on its tile now visibly bumps that slot count (e.g. a Farmstead on a Farm tile shows \"Food +2\")."
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
    createdAt: 1787462564744, // 2026.08.22.15 — frozen from a live Date.now() call
    introducedIn: "2026.08.22.15",
    title: "Fixed the same false \"Map sync stalled\" warning on the plain \"Join Season?\" prompt",
    why: "The previous fix only covered the pending-season countdown lobby. The plain \"Join Season?\" prompt -- shown once a season is already active but you haven't clicked join yet -- has the same reason for zero map tiles (you haven't spawned), and hit the same false alarm.",
    changes: [
      "The map-sync watchdog now also stays quiet behind the \"Join Season?\" prompt, not just the countdown lobby."
    ]
  },
  {
    createdAt: 1787462189036, // 2026.08.22.14 — frozen from a live Date.now() call
    introducedIn: "2026.08.22.14",
    title: "Fixed a false \"Map sync stalled\" warning while waiting in the season lobby",
    why: "A player waiting in the pending-season lobby hasn't spawned yet, so no map tiles have arrived for them by design -- but the map-loading watchdog didn't know that, and treated it the same as a real stuck sync, firing a \"Map sync stalled\" warning over the lobby after a few seconds.",
    changes: [
      "The map-sync watchdog now stays quiet while you're waiting in the season lobby, since there's nothing to sync yet."
    ]
  },
  {
    createdAt: 1787431431635, // frozen from a live Date.now() call
    introducedIn: "2026.08.22.12",
    title: "Fixed rivers clipping through hills",
    why: "River ribbons rendered at the flat ground elevation, ignoring the raised dome mesh used for hill tiles, so a river crossing a hill looked like jagged glued-together rectangles instead of a smooth ribbon.",
    changes: ["Rivers now render above the hill dome wherever their path crosses a hills tile."]
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
    createdAt: 1787650830571, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.1",
    title: "Farmstead now grants +2 FOOD slots instead of +1",
    why: "Farmstead's same-tile FOOD slot boost was tied with Mine/Umbrite Rig's +1, even though it's a dedicated food building -- a bigger boost makes it more worth building and gives Waterworks (which multiplies Farmstead's bonus) more to amplify.",
    changes: [
      "An active Farmstead on a FARM tile now adds +2 FOOD slots to that tile instead of +1. Waterworks' separate +2-per-Farmstead-in-radius bonus is unchanged and stacks on top."
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
    createdAt: 1787432000000,
    introducedIn: "2026.08.22.12",
    title: "Your galaxy planets and outposts now earn Influence and Production, and can lose Stability",
    why: "The galaxy view previously showed your Planets/Outposts/Stipends as a static record with nothing ongoing attached to them -- the galactic meta-layer's actual economy (docs/galactic-campaign-design.md §4/§5/§7) wasn't running yet. This introduces the first slice of that economy: a weekly Cycle tick that trickles Influence/Production income from your held territory, charges Influence upkeep for spreading wide, and drains or recovers each territory's Stability accordingly.",
    changes: [
      "Your galaxy view now shows a running Influence/Production balance, updated once per weekly Cycle based on your held Planets' and Outposts' specializations.",
      "Holding more Planets costs more Influence upkeep -- Outposts still cost nothing to hold, staying the cheap entry rung for newer empires.",
      "Each held Planet and Outpost now has a Stability meter (0-100), shown as a bar under it in the galaxy view. Falling into an Influence deficit drains your weakest territory's Stability over time; a healthy Influence surplus recovers all of them."
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
    createdAt: 1787435600000, // 2026.08.22.13 — frozen from a live Date.now() call
    introducedIn: "2026.08.22.13",
    title: "Fixed: another player's town could show your \"ready to upgrade\" badge",
    why: "The map's green up-arrow badge and the food-shortage badge only checked that a town had an owner, not that the owner was you, so a rival town that happened to qualify lit up on your map the same way one of your own towns would.",
    changes: [
      "The population-tier upgrade badge and the unfed-town food badge now only appear on towns you own, on both the 3D map and the classic 2D map."
    ]
  },
  {
    createdAt: 1787472290597, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.23.1",
    title: "Added a Slot Sources breakdown to the Economy panel for Food, Titanium, Crystal, and Umbrite",
    why: "The Economy sidebar's slot-based resources only showed \"Occupied by\" (who's using your slots), with no way to see where the slot capacity itself came from -- unlike GOLD, which already lists its Income Sources.",
    changes: [
      "The Economy panel's detail card for FOOD/TITANIUM/CRYSTAL/UMBRITE now has a \"Slot Sources\" column listing which tiles and boost structures (Farmstead, Mine, Umbrite Rig, Waterworks/Foundry radius bonuses, active synthesizers) are contributing slot capacity, alongside the existing \"Occupied by\" column."
    ]
  },
  {
    createdAt: 1787474961956, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.23",
    title: "Higher starting manpower for new capitals",
    why: "New capitals started with 576 manpower, an odd number derived from expansion-cost math -- raising it to a round 720 gives new players more early room to expand and settle.",
    changes: [
      "A new capital's starting manpower cap (and starting manpower, which fills it) is now 720, up from 576."
    ]
  },
  // Moved down from client-changelog-data.ts to keep that file under its
  // 500-line cap (see agent/settle-town-out-of-reach) -- still within the
  // 6-day trailing window client-changelog.test.ts enforces.
  {
    createdAt: 1787475367888, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.23",
    title: "Corrected the lobby's timezone claim",
    why: "The join-season overlay said a synchronized start means \"the first move isn't decided by timezone\" -- that's wrong, a shared start time doesn't erase timezone effects on when players are actually online. What it actually guarantees is that everyone gets the same starting line, not the same impact from timezone.",
    changes: [
      "The lobby's \"Season starts soon\" text now says a synchronized start gives everyone the same chance from the same starting line, rather than incorrectly claiming timezone has no effect on the first move."
    ]
  },
  {
    createdAt: 1787475219678, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.23",
    title: "Rally link dialog can now be dismissed, and rally links are reachable from Settings",
    why: "The rally-create and rally-invite dialogs had no way to close once you'd copied the link -- the only way out was navigating away entirely. And minting a rally link required knowing the /rally/new URL by hand.",
    changes: [
      "The rally link dialog now has a close (×) button in the top-right corner that dismisses it and clears the rally URL from the address bar.",
      "Signed-in players can now open \"Get Rally Link\" from Settings → Gameplay instead of typing /rally/new."
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
    createdAt: 1787476076398, // frozen just after this file's prior latest entry, to avoid pushing the 6-day window past an older "earlier" entry
    introducedIn: "2026.08.23.2",
    title: "Expand is gated to your reach again, with a new way to reach an out-of-reach rival",
    why: "Expanding onto land outside your reach border used to succeed, then quietly go nowhere -- you couldn't settle it, build on it, or hold it against a rival's growing border, so it just sat there looking claimed while doing nothing. That was confusing without adding anything you could actually use it for.",
    changes: [
      "Expand now requires the target tile to be inside your reach border, same as Settle already did.",
      "The one exception: if a rival's reach border touches yours, you can still expand into their reach right at that contact point -- opening a legal Attack origin against them even if none of your other territory reaches that far.",
      "Where two empires' reach borders touch, the border pylons and connecting lines now blend into a shared translucent beam instead of showing one owner's solid color, with faint drifting dust in both empires' colors passing through it."
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
  }
];
