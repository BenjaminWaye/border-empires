// Changelog entry data only, split out from client-changelog.ts (rendering/
// visibility) to keep that file under the 500-line cap. Entries are unordered —
// client-changelog.ts sorts by createdAt. Move old entries to
// client-changelog-data-earlier.ts when this file approaches the cap.
import { CLIENT_CHANGELOG_ENTRIES_EARLIER } from "./client-changelog-data-earlier.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_2 } from "./client-changelog-data-earlier-2.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_3 } from "./client-changelog-data-earlier-3.js";
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
    createdAt: 1787912311406, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.2",
    title: "Fixed several player-state fields silently reverting on reconnect",
    why: "The sim and gateway kept two separately-maintained copies of the reconnect-cache merge logic, and both had drifted: economyBreakdown, upkeepPerMinute, upkeepLastTick, and season-winner updates were dropped by one copy but not the other, and chosenTrickleResource the other way around. Separately, the INIT payload the gateway sends on reconnect never carried your event log, logistics throughput, imperial ward charges, or wonder rush-buy cooldown at all -- the last two have no client-side fallback, so a reconnect (a page refresh, a dropped connection) actively reset them to blank every time, even though the server's live state was correct the whole time.",
    changes: [
      "Reconnecting no longer resets your imperial ward charges or wonder rush-buy cooldown, and your event log, logistics throughput, economy breakdown, upkeep figures, chosen trickle resource, and season-winner status now consistently survive a reconnect regardless of which server-side cache happens to serve it."
    ]
  },
  {
    createdAt: 1787908074987, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.2",
    title: "Queuing an Expand outside your reach now explains it'll decay",
    why: "EXPAND isn't reach-gated server-side -- a claim landing outside your reach still succeeds, but it's stamped to decay away two minutes later unless you extend your reach to it with a nearby Town, Outpost, or Dock. Queuing a waypoint to such a target gave no warning at all until the claim actually decayed (or reverted on the next reach recompute), which read as the game silently undoing something for no reason.",
    changes: [
      "Queuing a waypoint whose destination is outside your current reach now shows the \"Beyond Your Reach\" tooltip immediately, explaining that the claim will decay unless you extend your reach to it."
    ]
  },
  {
    createdAt: 1787901144099, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.1",
    title: "Checklist no longer keeps a town/food target highlighted for the whole Expand duration",
    why: "The checklist only recomputed on tile-delta batches from the server, so once you clicked Expand To on a highlighted town or food tile, the highlight (and the goal's checked state) kept showing the old, un-expanded status for the whole multi-second window the real Expand takes to resolve server-side -- even though the client already knows locally, the moment the server accepts the command, that the tile is now yours.",
    changes: [
      "The checklist now recomputes as soon as an Expand command is accepted (the same moment the map's own optimistic ownership preview kicks in), instead of waiting for a later, unrelated tile-delta batch to happen to trigger a refresh."
    ]
  },
  {
    createdAt: 1787892933916, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28",
    title: "Checklist no longer highlights your own starting settlement as if it were a town target",
    why: "The onboarding checklist's Relay Beacon anchor highlight (and, later, the food-goal anchor highlight) included every tile the player owns with a town record -- including their free starting SETTLEMENT-tier tile, which every new empire spawns with. That tile isn't a TOWN and never was a valid Find/Expand target, so lighting it up read as the checklist bugging out and pointing at the player's own spawn point instead of a real objective. Once a real TOWN was also owned, the SETTLEMENT kept getting highlighted alongside it indefinitely.",
    changes: [
      "The checklist's highlight ring now only ever appears on TOWN-tier-and-up tiles -- never on the player's own SETTLEMENT-tier starting tile, whether as a Relay Beacon anchor or a food-goal anchor."
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
    createdAt: 1787817510197, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.27.1",
    title: "Fixed the frontier decay countdown freezing on a decaying tile's menu",
    why: "The tile menu's \"decays in Xs\" / \"disappears in Xs\" countdown for an encircled or out-of-reach frontier tile was only recomputed when the HUD re-rendered for some other reason (an incoming server message). With the menu left open on a decaying tile and nothing else happening, the countdown just sat frozen at whatever second it was showing when the menu opened, reading as if there were no timer at all.",
    changes: [
      "The tile menu now ticks its decay countdown once a second while it's open on a decaying tile, so the timer visibly counts down instead of freezing."
    ]
  },
  {
    createdAt: 1787812963830, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.9",
    title: "Waypoints no longer fight the server for every step while you're online",
    why: "A recent change made the server keep walking your waypoint queue on its own so it wouldn't stall while you were offline. That auto-drain never stopped once you reconnected, though -- it kept racing your own client's live dispatch for every single hop, and the server's in-process attempt won almost every time (no network round trip to lose to), bouncing your own attempt off an error on every step even though the waypoint was quietly progressing anyway. Separately, that same auto-drain gave up on a queued target the first time a single-leg attempt failed, discarding a perfectly reachable multi-hop target (an unexplored tile, or one behind an in-progress expansion) instead of waiting for it to become reachable.",
    changes: [
      "The server's waypoint auto-drain now only runs while you're actually offline -- your connected client is back to being the sole driver of your queue while you're playing, so no more error toasts on every waypoint step.",
      "A queued target that isn't reachable yet (not adjacent, locked, low on manpower/muster/gold, ...) is now retried on the next opportunity instead of being dropped outright, so it survives until it actually becomes reachable.",
      "Fixed the Settle animation sometimes not appearing until you clicked the tile or panned the camera when the settlement was started by something other than your own click (e.g. restored from a reconnect or an auto-settle)."
    ]
  },
  {
    createdAt: 1787773284493, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.9",
    title: "Fixed settle commands spamming errors on a Relay Beacon build chain",
    why: "A fix for a one-tick client/server duplicate-settle race made the client automatically resend a rejected SETTLE. When the rejection reflected a settlement that was genuinely still pending (not a one-tick race), the client kept resending the same doomed command every tick with no backoff -- flooding the connection with SETTLE_INVALID and COMMAND_RATE_LIMITED errors instead of ever succeeding.",
    changes: [
      "The automatic settle-retry now fires once per tile instead of looping forever.",
      "A settlement that's genuinely still in progress no longer pops a false \"Action failed\" alert -- it's not actually a failure."
    ]
  },
  {
    createdAt: 1787771594204, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.8",
    title: "Fixed a stray error toast on some waypoint/Expand steps",
    why: "The server now also auto-drains your waypoint queue on its own (so it keeps moving while you're offline). That occasionally raced your own client's live dispatch of the same step, and whichever one lost the race showed you an error -- but the client then mistakenly treated the winning side's unrelated success message as confirmation of the one that had just failed, since it stopped checking which command a late server reply was actually answering once nothing was in flight.",
    changes: [
      "A stray success message that arrives after an action already failed no longer gets misapplied to it -- you'll see the real outcome instead of a confusing error-then-success flicker."
    ]
  },
  {
    createdAt: 1787774400874, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.9",
    title: "Converter structure tile panel no longer shows stale Refine-mode upkeep/modifiers while selling off",
    why: "A converter structure (Aether Condenser, etc.) in Sell Off (EXCHANGE) mode still showed the Refine-mode gold upkeep rate in the Upkeep panel and \"Refine mode supplies: +1 <resource> slot\" in the Modifiers panel -- both computed by static lookup with no awareness of the structure's live mode, directly contradicting the structure's own status line, which correctly said it was selling off with no gold upkeep.",
    changes: [
      "The tile detail panel's Upkeep and Modifiers sections for a converter structure now match its actual current mode: no GOLD upkeep line and no \"Refine mode supplies\" modifier while it's in Sell Off mode."
    ]
  },
  {
    createdAt: 1787772627368, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.9",
    title: "Aether Condenser (and other converter structures) no longer sit mode-locked right after construction",
    why: "A freshly built converter structure defaults to Refine (SYNTHESIZE) mode, but build completion also stamped a fresh 60-minute mode-flip cooldown on it -- locking out the Sell Off/Refine toggle for an hour even though no mode had actually been flipped yet. The lock exists to stop rapid free mode-toggling, but that's already enforced independently: every successful flip re-locks for 60 minutes regardless of direction, so removing the build-time lock only frees up the very first choice.",
    changes: [
      "A newly built converter structure (Aether Condenser, etc.) can flip its mode immediately -- the 60-minute cooldown now only starts after your first flip, not on construction."
    ]
  },
  {
    createdAt: 1787769789241, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.8",
    title: "Fixed a captured settlement appearing to remain intact after capture",
    why: "When an ATTACK captured an enemy's SETTLEMENT-tier town, the simulation correctly razed it, but the wire delta cleared the town by setting townJson to undefined rather than an explicit empty value. JSON.stringify drops object keys whose value is undefined, so the clear signal never reached the client -- the client's merge logic treats an absent townJson key as \"unchanged\" (by design, to avoid a different class of stale-data bug), so it kept rendering the old town as if capture had done nothing.",
    changes: [
      "A captured settlement now visibly disappears for everyone immediately on capture, instead of appearing to survive until an unrelated update happened to touch the tile."
    ]
  },
  {
    createdAt: 1787768869848, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.8",
    title: "Waterworks no longer claims a food-production boost it doesn't have",
    why: "Waterworks's description said it boosts every nearby Farmstead's food production by +100%, the same dead per-tile production claim already corrected for Farmstead, Mine, and Umbrite Rig -- the resource-slot rewrite retired per-tile food production, so the multiplier never applies to anything.",
    changes: [
      "Waterworks's description, tech-tree copy (Hydraulic Works), and modifier chip now only show its real effect: +2 FOOD slots for every Farmstead within 10 tiles"
    ]
  },
  {
    createdAt: 1787752754484, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.2",
    title: "Fixed food/crystal (and other resource slot) totals getting stuck wrong until you changed a tile",
    why: "Resource slot totals and dormancy (what shows a structure as short on food/crystal/titanium/umbrite and disables further builds) are cached per player and only recomputed when a tile of yours changes. If that cache ever ended up wrong without a tile change to invalidate it, the wrong totals -- and any resulting build lockout -- stuck around indefinitely; a client refresh couldn't fix it since the bad value lived server-side, and the only known workaround was forcing a tile change yourself (e.g. abandoning a tile).",
    changes: [
      "Connecting (or reconnecting) now forces one fresh resource-slot supply/demand/dormancy recompute straight from your live territory, bypassing the cache entirely. This self-heals a stuck-wrong total without requiring any tile change, and runs once per connect rather than on any repeated or per-check basis, so it adds no cost during normal play."
    ]
  },
  {
    createdAt: 1787767880392, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.5",
    title: "Farmstead no longer claims a food-production boost it doesn't have",
    why: "Farmstead's description said it boosts farm-tile food production by 50%, matching Mine and Umbrite Rig's identical (and already-corrected) dead production claim -- the resource-slot rewrite retired per-tile food production entirely, and the one function that would compute Farmstead's 50% bonus has no callers anywhere in the code.",
    changes: [
      "Farmstead's description, tech-tree copy, and modifier chip now only show its real effect: +2 FOOD slots on a farm tile"
    ]
  },
  {
    createdAt: 1787765310135, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.2",
    title: "Fixed: queued Expand/Attack orders now execute automatically",
    why: "The waypoint/expand queue only stored your queued targets on the server -- it never actually walked the route for you while you were offline, so queued orders just sat there until you reopened the game and your client resumed dispatching them itself.",
    changes: [
      "A queued Expand/Attack now fires automatically as soon as it's your turn in the queue, including while you're completely offline.",
      "A queued target that's no longer valid by the time it comes up (already taken, no longer reachable, etc.) is skipped instead of stalling the rest of your queue."
    ]
  },
  {
    createdAt: 1787755800000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.7",
    title: "Fixed Crystal staying hidden on tiles you could already see when Aetheric Resonance finished",
    why: "Researching a resource-revealing tech only recomputed vision radius, not the resource data of tiles already inside your vision. Since the crystal reveal only rode along on a fresh tile delta, a crystal tile you could already see stayed masked forever once Aetheric Resonance completed -- nothing ever mutated that tile again to trigger a resend, and even a fresh login pulled the same stale masked state.",
    changes: [
      "Completing a tech that reveals a resource (Aetheric Resonance/Crystal, Masonry/Titanium, Leatherworking/Umbrite) now re-sends every already-visible tile of that resource type, so it shows up immediately instead of only on tiles you scout afterward."
    ]
  },
  {
    createdAt: 1787765177459, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.7",
    title: "Fixed \"Get Rally Link\" flashing a sign-in prompt for already-signed-in players",
    why: "The button did a full page navigation to /rally/new, which reloaded the whole client and restarted Firebase Auth from scratch. The rally panel tried to mint a link before auth finished rehydrating, so it briefly showed \"Sign in, then this page will create your rally link\" even for players who were already signed in.",
    changes: [
      "Get Rally Link now opens the rally panel in place, without reloading the app, so already-signed-in players go straight to a minted link instead of seeing a sign-in flash.",
      "Fixed the rally panel's close (×) icon rendering off-center in its button."
    ]
  },
  {
    createdAt: 1787765177460, // frozen from `node -e "console.log(Date.now())"`, +1ms to avoid a collision with the entry above
    introducedIn: "2026.08.26.7",
    title: "Fixed a rally invite link covering the sign-in button",
    why: "Opening a rally invite link (/r/<code>) while signed out showed a floating \"Join a rally\" card on top of the sign-in screen. #auth-overlay lives inside #hud, which is position:fixed with z-index:auto and forms its own stacking context, so the invite card's z-index (29, meant to sit below the overlay's 30) was compared against #hud as a whole instead -- the card always painted on top, right over the Continue with Google button.",
    changes: [
      "The rally invite message now appears as a small banner inside the sign-in card itself instead of a separate floating popup, so it never blocks the sign-in buttons."
    ]
  },
  {
    createdAt: 1787755721503, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.6",
    title: "Attack alerts now show the attacker's real display name",
    why: "Attack alerts (in-app and email) were built from the simulation's own player record, which is created equal to the player's raw account ID and never learns their actual display name -- so an attacker with a display name set still showed up as an unreadable string like \"VK5iriJAhickNf9ArrRweUDnq1W2\" instead of their chosen name.",
    changes: [
      "Attack alerts now look up the attacker's live profile name (the same source the leaderboard already uses) before falling back to a short anonymized empire label (e.g. \"Empire A1B2C3\") for players who haven't set one.",
      "The attack alert email has also been restyled to match the season-start email's card design instead of being plain unstyled text."
    ]
  },
  {
    createdAt: 1787754175140, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.5",
    title: "Pulsing badge on the Allies tab for pending alliance/truce requests",
    why: "Incoming alliance and truce requests from other players had no indicator on the Ally tab icon, so they could sit unnoticed until you happened to open the panel.",
    changes: [
      "The Ally tab icon now shows a pulsing badge with a count when you have pending incoming alliance or truce requests."
    ]
  },
  {
    createdAt: 1787692499340, // frozen from a live Date.now() call
    introducedIn: "2026.08.25.8",
    title: "AI auto-settle now respects reach too, and losing reach unsettles ground you can no longer defend",
    why: "The client's auto-fill queue was already fixed to stop settling out-of-reach resource tiles, but AI empires' own auto-settle driver -- and the live queue emitted to a connected human player -- still turned any owned frontier resource/support tile into a town regardless of reach. Separately, losing or disabling the last beacon/outpost/fort covering a tile left that ground permanently claimed even once nothing defended it, since the reach border only ever shrank when a rival actively contested it.",
    changes: [
      "AI empires' auto-settle, and the live auto-settlement queue, now skip any resource or plain-support frontier tile that's outside the owner's reach border. A captured town or dock still auto-settles regardless of reach, same as before -- it has no reach of its own to grant until settled.",
      "A settled tile that falls entirely outside anyone's reach (its last covering beacon/outpost/fort is lost or disabled, and no rival covers it either) now reverts to frontier, playing the existing unsettle collapse effect. This applies to the structure's own tile too, if it was the sole anchor holding it -- a fully isolated outpost with nothing else nearby can be lost for good this way; extend reach back over it first (another anchor, or expanding in from adjacent territory) before it can be settled again."
    ]
  },
  {
    createdAt: 1787726484063, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.1",
    title: "New player and respawn placements now draw from a precomputed, equal-opportunity spawn map",
    why: "Spawn placement previously ran a fresh random search per player against the live map, so two players joining minutes apart could land with very different access to nearby food and towns purely by luck of that search. Worldgen now precomputes a roster of candidate spawn sites up front, all drawn from the same amenity tier and spread evenly across the map, so every new empire and every respawn starts on comparably fair footing.",
    changes: [
      "Worldgen now precomputes a roster of up to 50 candidate spawn sites, spread evenly across the map instead of clustering, and prioritized so every site with both a town and food nearby is used before a lesser site is ever added.",
      "New players and eliminated players respawning now draw from this roster first, falling back to the previous random search only once it's exhausted.",
      "Joining via a friend's rally link now also draws from that same precomputed roster first, picking whichever site is closest to the inviting player, before falling back to the random search when every site nearby is already taken or too close to another empire.",
      "Worldgen now regenerates the entire map with a new seed (same as it already does for a bad island distribution or a bland map) if the candidate map can't secure a full 50-site roster, instead of shipping a season where late joiners are more likely to fall back to the plain random search from the start."
    ]
  },
  {
    createdAt: 1787739722417, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.1",
    title: "Fixed the Founding Engineer tag matching by display name instead of a stable id",
    why: "The Founding Engineer badge matched on display name (case-insensitive), so it would disappear if that player renamed and could be picked up by anyone else who renamed to the same string. The tile detail check also skipped the ally check's sea/coastal-sea and self-tile guard, so it could show up next to the generic \"Open sea\"/\"Crossing route\" text on a tile they owned.",
    changes: [
      "The Founding Engineer badge now matches on the player's stable id everywhere it's shown (lobby roster, leaderboard, tile detail), and no longer appears on sea or coastal-sea tiles."
    ]
  },
  {
    createdAt: 1787734461399, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.2",
    title: "Allies can now share dock-network access",
    why: "Docks let you cross open water, but only from a dock you personally owned -- so an ally holding the far end of a shared shipping lane didn't help you reach it, even though your empire already had a foothold somewhere in that same connected network of docks.",
    changes: [
      "EXPAND and ATTACK can now launch from an allied dock, as long as you control at least one other dock in that dock's connected network"
    ]
  },
  {
    createdAt: 1787734129392, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.2",
    title: "Added a Founding Engineer tag",
    why: "A small, fixed set of early contributors didn't have any way to be recognized in the game's social UI.",
    changes: [
      "Founding Engineer players now show a gold name and a top-hat tag next to their name in the season lobby roster, the tile detail owner label, and the leaderboard"
    ]
  },
  {
    createdAt: 1787733981707, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.4",
    title: "Aegis Dome shield radius reduced to 25 tiles",
    why: "The Aegis Dome's protection radius was 30 tiles in code while the build-menu description had always said 25 -- the two disagreed, and 25 is the intended number going forward.",
    changes: ["Aegis Dome (and its Aegis Lock) now protects a 25-tile radius, down from 30"]
  },
  {
    createdAt: 1787733981706, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.3",
    title: "Corrected several building descriptions that no longer matched their real effects",
    why: "An audit of every structure's build-menu and tech-tree copy against the actual simulation code turned up several descriptions left over from before the manpower-economy rewrite (§5), still advertising numbers or mechanics the current code doesn't implement.",
    changes: [
      "Astral Dock's satellite launch is now correctly described as free (it always was in code; the old copy claimed a 1,000 gold cost that was never actually charged)",
      "Harbor Exchange's per-dock income is now correctly shown as +5 gold/day (was shown as +1,440 gold/day -- a 288x display error)",
      "Trade Nexus's connected-town bonus now shows the real stepped +50%/+40%/+30% ladder instead of a flat, fictional +25%",
      "Rail Depot's description no longer claims it auto-settles frontier tiles or grants connected-town income points -- neither was ever implemented",
      "Ministry Hall (Governor's Office) and Seed Granary no longer claim a food-upkeep discount that was never implemented; Ministry Hall's real effect (reducing a nearby town's FOOD slot demand by its tier step) is unchanged and still shown",
      "Mine and Umbrite Rig no longer claim a +50% production boost or flat resource caps retired by the resource-slot rewrite -- both now correctly show their real +1 resource-slot effect",
      "Umbrite Works, Titanium Works, and Aether Condenser (and their Advanced tiers) no longer claim a daily resource-production rate in Refine mode that the economy no longer produces -- Refine mode is now correctly described as supplying +1 resource slot; Sell off mode's numbers were already accurate and are unchanged"
    ]
  },
  {
    createdAt: 1787731482829, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.2",
    title: "Agrarian Works now also boosts your fishing grounds",
    why: "Researching Agrarian Works only ever unlocked the Farmstead, which has no effect on fish tiles at all -- fish-heavy empires got nothing out of the tech beyond an economy-branch checkbox.",
    changes: [
      "Agrarian Works now adds +1 FOOD slot on every owned fish tile, on top of unlocking the Farmstead",
      "This is a flat tech bonus, independent of any structure -- it applies to bare fish tiles too, not just ones with a Farmstead built on them"
    ]
  },
  {
    createdAt: 1787724124671, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.1",
    title: "Frontier tiles no longer decay while sitting inside anyone's live reach",
    why: "Out-of-reach frontier decay only checked reach coverage at the moment a tile was claimed. If another player's town/outpost reach later grew to cover that ground, the original claim's decay timer kept counting down regardless, so tiles that were clearly inside someone's live border still got auto-cleared to neutral.",
    changes: [
      "Re-checks reach coverage at the moment a frontier tile's decay timer would fire, not just at claim time",
      "A tile inside any player's live reach -- the owner's own or another player's -- has its decay timer cleared instead of expiring"
    ]
  },
  {
    createdAt: 1787724118006, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.1",
    title: "Rally-linked players now spawn near a real foothold, not just the nearest empty tile",
    why: "Joining via a friend's rally link placed you on whichever open tile happened to be closest to their anchor, even a barren one with no town or food nearby -- while a normal spawn always looked for a town and food within reach.",
    changes: [
      "Rally spawns now search outward from the anchor for a spot with both a town and food nearby before falling back to a town-only, then food-only, then any-open-tile spot, all still within the rally radius"
    ]
  },
  {
    createdAt: 1787692481411, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.8",
    title: "Gave the \"join now\" season prompt a real intro instead of a bare confirmation dialog",
    why: "The plain join-season overlay (season already live, player just hasn't clicked join yet) read as a placeholder-y \"Join Season season-23?\" dialog with a static \"Ready\" dial that did nothing -- no sense of occasion for what's actually your empire's founding moment.",
    changes: [
      "Replaced the title/summary with narrative flavor text introducing the season",
      "Removed the static \"Ready\" dial and turned the confirm button itself into the focal call-to-action, relabeled \"Let's go!\""
    ]
  },
  {
    createdAt: 1787689447704, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.7",
    title: "Fixed flickering at the coastline where the water and land skirts overlapped",
    why: "The water skirt wall added in 2026.08.25.5/.6 drew a wall on all 4 sides of every exposed water tile, including north/east/west edges that sat right where the land's own coastal skirt wall already runs. Two near-coplanar unlit walls animating independently z-fought against each other every frame, flickering.",
    changes: [
      "The water skirt now only draws its south-facing edge (the side that actually faces the camera at the default view angle), leaving the land skirt to cover the other three sides instead of overlapping it."
    ]
  },
  {
    createdAt: 1787823264967, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.27",
    title: "Enable <structure> is disabled on an unsettled tile",
    why: "A disabled economic structure (Relay Beacon, synthesizer, weapons factory, etc.) standing on a FRONTIER (not yet settled) tile could still be re-enabled, letting it resume occupying a resource slot and providing bonuses from a tile that isn't actually settled.",
    changes: [
      "The Enable action for any disabled economic structure is now disabled with \"Tile is not settled\" whenever the tile it stands on is FRONTIER rather than SETTLED."
    ]
  }
];
export const CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  ...RECENT_CLIENT_CHANGELOG_ENTRIES,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_2,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_3
];
