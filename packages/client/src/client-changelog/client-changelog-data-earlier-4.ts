// Older client-changelog entries, split out of client-changelog-data.ts to keep
// that file under the repo's 500-line cap (see the comment at that file's top).
// Same shape and rules apply here: unordered, append-only, frozen createdAt
// literals.
//
// Entries here are still bound by the "latest week only" rule enforced in
// client-changelog.test.ts — this file exists purely to keep the other
// changelog data files under their line cap when the trailing week has a lot
// of entries, not as a permanent archive. Prune entries here once they fall
// outside the trailing week, same as in the other files.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_4: ClientChangelogEntry[] = [
  {
    createdAt: 1788128033639, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31",
    title: "Renamed the Observatory and Ambaric Tower",
    why: "Two structure names were due for a refresh to better fit the empire's aether/power theming.",
    changes: [
      "The Observatory is now called the Aether Tower everywhere in the UI (build menu, tile overview, tech unlocks, upkeep) -- no change to what it does",
      "The Ambaric Tower is now called the Ambaric Transformer Station everywhere in the UI -- no change to what it does"
    ]
  },
  {
    createdAt: 1788162346509, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31",
    title: "Fixed a fake \"plundered FOOD\" notice on town captures",
    why: "Capturing a settled FARM/FISH tile always showed a \"Plundered 1 FOOD\" line in the combat alert, but plunder has only ever transferred gold -- no food was ever actually taken from the defender or given to the attacker.",
    changes: [
      "Combat/raid alerts no longer show a fake FOOD plunder amount when capturing a resource tile -- plunder remains gold-only, matching what actually happens to both players' stockpiles"
    ]
  },
  {
    createdAt: 1788162890008, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31.1",
    title: "Fixed a town's full tile detail sometimes showing stale data right after opening it",
    why: "Opening a tile's full detail (or the debug download tool) reused the same \"only send what changed\" logic as the regular live tile updates -- so if nothing else about the tile had changed since the last regular update, fields like a town's bonus modifiers were silently left out of the response, and the client kept showing whatever it already had cached, which could be out of date.",
    changes: [
      "Opening a tile's full detail now always fetches the complete, current data instead of a partial update that can omit fields nothing else recently touched"
    ]
  },
  {
    createdAt: 1787845125246, // frozen: one ms after the previous newest entry
    introducedIn: "2026.08.27",
    title: "Aether Condenser overview cleanup",
    why: "The economy panel's CRYSTAL slot breakdown counted an Aether Condenser as occupying a slot even while it was still in Refine mode supplying that slot instead, and the tile overview repeated the converter's mode/cooldown state in two lines that duplicated what the flip button already said.",
    changes: [
      "An Aether Condenser (or its Advanced/Umbrite/Titanium counterparts) only shows up under \"Occupied by\" once it's actually flipped to Sell Off mode, matching the slot math the server uses.",
      "Removed the redundant \"selling off its slot\"/\"currently contributing output and upkeep\" status line and the \"Mode flip available in Xm\" cooldown line from the tile overview — the mode-flip button already shows both."
    ]
  },
  {
    createdAt: 1787845125245, // frozen: one ms after the previous newest entry
    introducedIn: "2026.08.27",
    title: "Islands map improvements: bigger islands, no sealed mountain rings, tighter dock/town placement",
    why: "Islands-style worlds skewed almost all ocean under the same land thresholds used for the huge continents style, mountain rings could form a fully closed loop that sealed off whatever was inside (sometimes trapping a dock), a bug in dock placement's pairing step silently dropped every dock on a world with only one eligible landmass, and player spawns required an existing town within a radius wide enough to land immediately next to the player's own new settlement town.",
    changes: [
      "Islands-style worlds now generate with lower sea/coastal thresholds and a few large island seeds mixed in with the small ones, so there's consistently room for a big island instead of mostly open ocean.",
      "Mountain rings always leave a gap in their loop now, so a ring can never fully seal off its interior from the surrounding terrain.",
      "Fixed a dock-generation bug where a world with only one sea-reachable landmass (nothing to pair or route a connection to) got zero docks; every eligible landmass now gets its dock on the first pass.",
      "Towns are no longer placed directly adjacent to each other anywhere on the map, and a player spawn's own settlement no longer lands immediately next to another town — a nearby town still counts for spawn placement, but it has to keep the same minimum distance towns keep from each other everywhere else."
    ]
  },
  {
    createdAt: 1787845125244, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.27.9",
    title: "Waypoints now keep making progress while you're offline",
    why: "The server only ever knew a waypoint's final destination, not the route -- while you were disconnected it could only try one synthetic EXPAND/ATTACK straight at that destination, which only ever worked if the target happened to already border your territory. A multi-hop waypoint chain made no progress at all while you were logged off.",
    changes: [
      "The client now sends its full planned route to the server, which replays it one hop at a time (using each hop's real origin) while you're disconnected -- rate-matched to the same pacing an active session would see.",
      "A route that goes stale while you're away (a rival grabs a tile mid-route, a border shifts) is marked as needing a fresh plan instead of being silently dropped -- reconnecting automatically re-plans and picks up where it left off.",
      "A barbarian-tracking waypoint stays frozen while you're offline and resumes tracking normally the moment you reconnect."
    ]
  },
  {
    createdAt: 1787840155807, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.27.8",
    title: "A town's Unfed status now updates on its own, without needing to touch that tile",
    why: "A town's fed/unfed state only got refreshed as a side effect of some other change landing on that exact tile (a build, upgrade, or capture) -- it was never proactively rechecked when the shared FOOD-slot shortfall shifted for a reason elsewhere in your empire, like settling a second town that pushed your total FOOD demand over supply. So an affected town could sit showing stale \"fed\" (or \"unfed\") indefinitely, with no visible reason and no way to force a refresh short of reconnecting.",
    changes: [
      "Every owned town's Unfed status now gets rechecked and corrected once a minute regardless of whether anything else touched that town's own tile, so it reflects your empire's real, current FOOD-slot balance instead of whatever it happened to show last."
    ]
  },
  {
    createdAt: 1787839538882, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.27.7",
    title: "Fixed the checklist bubble also overlapping the Center button on mobile",
    why: "The prior fix for this only measured the desktop Center button (#center-me-desktop). On phone-width screens that button is hidden -- the real overlap was with its mobile counterpart, which lives inside the default-visible mobile home panel sitting directly above the nav bar. The mobile position was still a guessed fixed offset that only cleared the nav bar itself, not that panel's own height above it.",
    changes: [
      "The checklist bubble now measures whichever Center button (desktop or mobile) is actually on screen, so it no longer overlaps it on phone-width layouts either.",
      "The Relay Beacon note now reads \"build a Relay Beacon to expand your reach\"."
    ]
  },
  {
    createdAt: 1787834428935, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.27.3",
    title: "Fixed queued waypoints and builds actually vanishing on reconnect",
    why: "The server has two separate ways of describing your empire on the wire: a full export used for save checkpoints, and a leaner one used for every ordinary reconnect/login. Only the full one ever included your queued waypoints and dev-queue (build/settle) entries -- the reconnect path never carried them at all. Both queues worked completely normally while you kept playing (nothing about that depends on reconnecting), but the moment you reconnected, the client was told the server had nothing queued -- and if your own local copy was also gone by then (a real tab close, for instance), the entry was gone for good even though the live queue on the server had been holding it the whole time.",
    changes: [
      "Reconnecting now correctly restores any waypoints and queued builds/settlements you had going, instead of only restoring them from a save checkpoint."
    ]
  },
  {
    createdAt: 1787832114649, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.27.2",
    title: "Fixed a waypoint sometimes vanishing after closing and reopening the game",
    why: "Placing a waypoint mirrors it to the server so it survives a reconnect, but that mirror message could silently fail to send if it happened right as your session was reconnecting -- nothing checked whether it actually went through, or retried it. The waypoint still worked fine for the rest of that browser tab (it was walking the route from local memory, not the server), so nothing looked wrong -- until closing the tab wiped that local copy too, with no server copy left to restore from on your next visit.",
    changes: [
      "Reconnecting now re-checks every waypoint you currently have queued against what the server has on file, and re-sends any that never made it across -- so a waypoint placed right around a reconnect can no longer be silently lost."
    ]
  },
  {
    createdAt: 1787827200551, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.27.1",
    title: "The tile popup no longer shows a town as fed when it's actually unfed",
    why: "A town's tile-detail popup computed \"fed\" as: is it a Settlement, OR is the player's overall FOOD stockpile fully covered, OR does the sim's own record already say fed, OR is there an adjacent Farm/Fish tile. That last pair are leftover checks from before FOOD became a slot mechanic, and since almost every farming town sits next to a Farm or Fish tile, they made the popup report \"fed\" for virtually any town regardless of an actual FOOD-slot shortfall -- so a town the game had correctly marked unfed could still show 4/4 Food when clicked.",
    changes: [
      "The tile popup's Food line now trusts the simulation's own fed/unfed verdict whenever it's available, instead of letting an adjacent Farm/Fish tile or overall FOOD stockpile override it back to \"fed\"."
    ]
  },
  {
    createdAt: 1787827096329, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.27.6",
    title: "Fixed the checklist bubble sometimes overlapping the Center button, and simplified the food-goal copy",
    why: "The checklist bubble's vertical position was a guessed fixed pixel offset above the \"Center / Jump to your banner\" button, tuned against one specific layout -- on other viewport sizes it could visually collide with that button instead of clearing it. Separately, the food-goal labels spelled out the FARM/FISH slot-weighting rule inline (\"4 slots -- grain 1, fish 2\") and called the claimed-slots goal \"X/4 food slots\", which read as two different, oddly-worded stats instead of a matched pair.",
    changes: [
      "The checklist bubble now measures the Center button's actual on-screen position each render and clears it by a fixed gap, instead of guessing a fixed pixel offset that could drift out of sync with the real layout.",
      "The food goals now read \"Find food tiles (X/4)\" and \"Expand To food tiles (X/4)\" -- matched, simpler copy instead of spelling out the grain/fish slot-weighting rule inline."
    ]
  },
  {
    createdAt: 1787816841167, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.27.1",
    title: "Expand animation now plays on a directly-tapped tile, and queued waypoints stop disappearing",
    why: "The on-map claim animation was keyed off an internal \"keep this claim quiet\" flag that exists to suppress the completion popup and feed spam for long queued chains. Tapping an adjacent tile directly deliberately clears that flag -- so the claim ran, the tile menu counted down, but nothing animated on the map, while the exact same claim arriving as a queued step animated fine. Separately, the server's offline waypoint drain removed a queued target from your queue when it declined to auto-attack a rival's tile -- a decision it's right to make, but it deleted the waypoint instead of leaving it for you to walk yourself.",
    changes: [
      "Tapping an adjacent tile to expand now plays the same claim animation queued tiles already did.",
      "A queued waypoint aimed at a rival-held tile is no longer silently deleted while you're offline -- it stays queued for you to act on when you return.",
      "A queued waypoint that isn't reachable yet no longer blocks the rest of your queue from being attempted."
    ]
  },
  {
    createdAt: 1787823003530, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.27.5",
    title: "Checklist now splits Find from Expand To, and fixes food-slot math",
    why: "Each checklist goal previously combined \"locate a target\" and \"claim it\" into one checkbox, so there was no way to tell a genuinely blocked goal (nothing found yet) apart from one that just hadn't been claimed yet. Separately, the food-slot progress was counting every FARM/FISH tile as 1 slot flat -- but a FISH tile is actually worth 2 slots toward the 4-slot target, not 1 (structure-slots.ts), so the checklist was overstating how much food a player still needed.",
    changes: [
      "The town and food goals are now 4 separate checkboxes -- Find a town / Expand To it, and Find food tiles / Expand To food slots -- instead of 2 combined ones.",
      "Food-slot progress now correctly weights a claimed FISH tile as 2 slots and a FARM tile as 1, matching the same weighting the rest of the game uses -- 2 fish, 4 grain, or any weighted mix now correctly reads as reaching the 4-slot target."
    ]
  },
  {
    createdAt: 1787822512342, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.27.4",
    title: "New-empire checklist panel now shows both goals with checkboxes",
    why: "The checklist panel only ever showed the single currently-active step's text, so there was no way to see the whole checklist at a glance or confirm a goal you'd already finished was actually done.",
    changes: [
      "Expanding the checklist bubble now lists both goals (find a town, claim food tiles) with a checkbox each -- a completed goal gets checked off and struck through instead of just disappearing from view.",
      "When nothing is currently in reach, the Relay Beacon suggestion now shows as a note under the two goals instead of replacing whichever goal it's blocking."
    ]
  },
  {
    createdAt: 1787821835669, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.27.3",
    title: "New-empire checklist rewritten around Expand To -- no more waiting on a town to grow on its own",
    why: "Step 1 previously told a new player to wait for their free starting SETTLEMENT to passively grow into a TOWN, which is slow and not the fastest way to get a town -- since world gen pre-seeds neutral towns everywhere and zero towns are ever player-founded (see docs/game-mechanics.md), Expand To-ing an already-existing neutral town is the actual fast path. Separately, the reach check behind the Relay Beacon suggestion was approximate (\"is anything visible on the map at all\") rather than real reach, so it could tell a player nothing was reachable when something actually was, or vice versa.",
    changes: [
      "Step 1 now points you at a nearby town to Expand To (auto-settles once ownership lands) instead of telling you to wait for your starting settlement to grow -- either path still completes the step once you own a TOWN-tier tile.",
      "Both steps now check the player's actual current reach (the same math the map's reach-boundary overlay uses), not just whatever's loaded on the client -- so the Relay Beacon suggestion only appears when a town or food tile genuinely isn't reachable yet, and re-checks itself as reach grows."
    ]
  },
  {
    createdAt: 1787819400331, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.27.2",
    title: "New-empire checklist now always appears, and its ring highlight no longer hides under a town",
    why: "The onboarding checklist bubble only ever recomputed on a TILE_DELTA_BATCH message, never on the initial spawn snapshot -- a fresh empire whose starting tiles never happened to generate a delta (e.g. quietly sitting next to an already-owned town and a fish tile) could go the whole session without ever seeing the checklist. Separately, the highlight ring around a checklist target tile was sized smaller than a settled town's footprint, so once a highlighted tile grew into a town the ring rendered entirely underneath the town model and was invisible.",
    changes: [
      "The onboarding checklist now also computes and appears right on spawn, not just after the first tile-delta batch arrives.",
      "The checklist's pulsing highlight ring is now wide enough to show around a town's footprint instead of being hidden underneath it, in both 2D and 3D map modes.",
      "Added a new EXPAND_REACH checklist step: if there's no unclaimed food tile AND no town nearby to capture, the checklist now points you at building a Relay Beacon to expand your reach instead of highlighting an objective that isn't actually reachable yet."
    ]
  },
  {
    createdAt: 1787937658626, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.3",
    title: "Fixed the out-of-reach decay timer never showing on the tile menu",
    why: "The gateway-sync layer that applies incoming tile deltas only recognized \"ENCIRCLEMENT\" as a valid frontierDecayKind and silently dropped any other value -- including \"OUT_OF_REACH\", the sim's other real decay kind -- back to undefined. An out-of-reach frontier tile's decay deadline (frontierDecayAt) synced to the client fine, but its kind didn't, so the tile menu's header status could never match the OUT_OF_REACH branch and always fell back to a static \"Outside reach\" with no live countdown, even while the tile was actively decaying.",
    changes: [
      "The tile menu now shows the \"Beyond your reach — decays in Xs\" countdown for a decaying out-of-reach frontier tile instead of a static \"Outside reach\" with no timer."
    ]
  },
  {
    createdAt: 1787817510197, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.27.1",
    title: "Fixed the frontier decay countdown freezing on a decaying tile's menu",
    why: "The tile menu's \"decays in Xs\" / \"disappears in Xs\" countdown for an encircled or out-of-reach frontier tile was only recomputed when the HUD re-rendered for some other reason (an incoming server message). With the menu left open on a decaying tile and nothing else happening, the countdown just sat frozen at whatever second it was showing when the menu opened, reading as if there were no timer at all.",
    changes: [
      "The tile menu now ticks its decay countdown once a second while it's open on a decaying tile, so the timer visibly counts down instead of freezing."
    ]
  },
  {
    createdAt: 1788088074612, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.2",
    title: "The Overall leaderboard now shows each empire's manpower cap",
    why: "The leaderboard's Overall row showed score, settled tiles, income, and tech count but nothing about manpower capacity, so you couldn't compare your army ceiling against rivals without opening their empire directly.",
    changes: [
      "Each row in the Overall leaderboard now lists a \"manpower cap\" figure alongside score, settled tiles, income, and tech count"
    ]
  },
  {
    createdAt: 1788107095722, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.4",
    title: "Aether Purge and Aether EMP no longer offer to target allied tiles",
    why: "The tile-action menu only checked whether a tile was your own before offering Aether Purge or Aether EMP, so an allied empire's tile looked like a valid, enabled target -- clicking it just got silently rejected by the server with a confusing \"target hostile settled or frontier land\" error, since allies were never actually strikeable.",
    changes: [
      "Aether Purge and Aether EMP now show as disabled with a \"Cannot purge/EMP your own or allied tiles\" reason when selecting an allied tile, instead of appearing available and then failing server-side"
    ]
  },
  {
    createdAt: 1787935226945, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.4",
    title: "Fixed tech/domain bonuses (e.g. Mercantile Charter) not applying until something else refreshed your towns",
    why: "Picking a tech or domain -- including tier 1's Mercantile Charter, which boosts gold production and population growth in your first three towns -- didn't invalidate the cached per-player town economy data. The new bonus silently sat unused until an unrelated tile change happened to refresh that cache, so newly chosen bonuses looked like they weren't applying to gold production or the town overview's modifier list.",
    changes: [
      "Choosing a tech or domain now immediately refreshes your towns' gold production and the town overview's modifier list to reflect the new bonus"
    ]
  },
  {
    createdAt: 1787937615718, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.5",
    title: "Alliance and truce request emails now match the rest of the game's branded emails",
    why: "Alliance and truce request emails were still built from a plain, unstyled paragraph template (a leftover from before the branded season-start/attack-alert template existed), so they looked out of place next to every other gameplay email you get.",
    changes: [
      "Alliance and truce request emails now use the same branded layout (header, body, call-to-action button) as season-start and attack-alert emails, and truce offers now call out the offered duration as a highlighted stat like other emails do"
    ]
  },
  {
    createdAt: 1787940609007, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.5",
    title: "Added a way back into 3D after it locked you out of it",
    why: "Two failed 3D attempts in a row (including a page refresh mid-load, which looks identical to a crash from the client's perspective) permanently pinned you to the 2D map, and the banner's own \"Add ?renderer=3d to try again\" instruction didn't actually work -- that param only controls whether 3D is attempted, not the on-disk crash streak that was blocking it, so retyping the URL just showed the same banner again.",
    changes: [
      "The \"3D map unavailable\" banner now has a \"Try 3D again\" button that clears the crash streak and reloads back into 3D",
      "Removed the banner's old ?renderer=3d instruction, since it never actually reset anything"
    ]
  },
  {
    createdAt: 1787999110086, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.1",
    title: "Fixed Aether Condenser gold income showing up as \"CRYSTAL_SYNTHESIZER\" in the economy panel",
    why: "An Aether Condenser flipped into Sell Off mode reports its gold income to the economy panel labeled with its raw internal type (CRYSTAL_SYNTHESIZER) instead of its display name, because that income bucket bypassed the same display-name lookup every other structure-driven line in the panel goes through -- making it easy to conclude the income wasn't showing up at all.",
    changes: [
      "The Gold income breakdown now shows \"Aether Condenser\" (and any other structure-labeled income/upkeep line) with its proper display name instead of its internal type"
    ]
  },
  {
    createdAt: 1788175437827, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31.3",
    title: "Fixed the Launch Attack win chance disappearing while you were reading it",
    why: "The win-chance calculation and \"how this is calculated\" breakdown were cached for only 5 seconds. Leaving an enemy tile's menu open past that -- while reading the math, or just deciding -- meant the next routine tile update silently re-rendered the panel against an expired cache, so the win chance and breakdown just vanished even though nothing about the battle odds had changed.",
    changes: [
      "The Launch Attack panel now quietly refreshes its win chance in the background while it's open on an enemy tile, so the calculation and breakdown stay visible instead of disappearing every few seconds"
    ]
  },

];
