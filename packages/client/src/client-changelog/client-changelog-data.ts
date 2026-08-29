// Changelog entry data only, split out from client-changelog.ts (rendering/
// visibility) to keep that file under the 500-line cap. Entries are unordered —
// client-changelog.ts sorts by createdAt. Move old entries to
// client-changelog-data-earlier.ts when this file approaches the cap.
import { CLIENT_CHANGELOG_ENTRIES_EARLIER } from "./client-changelog-data-earlier.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_2 } from "./client-changelog-data-earlier-2.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_3 } from "./client-changelog-data-earlier-3.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_4 } from "./client-changelog-data-earlier-4.js";
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
    createdAt: 1787999012029, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.1",
    title: "Join-season screen no longer shows a misleading \"0 players waiting\" for an already-active season",
    why: "The waiting count/roster only means something for a pending season's countdown lobby (\"N players have reserved a spot for the world that hasn't started\"). The plain join-now screen (season already active, player just hasn't clicked in yet) reused the same panel, so it showed \"0 PLAYERS WAITING / You're the first one here\" even when the world was already full of active empires.",
    changes: [
      "The already-active join-season screen now shows the Discord link and invite button without the waiting count/roster block"
    ]
  },
  {
    createdAt: 1787999215790, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.1",
    title: "Shard rain locators now clear once a shard is actually collected",
    why: "The in-world bobbing badge over a shard rain site and the off-screen HUD locator arrow pointing at one both tracked only the rain event's broadcast and its ~30-minute expiry, not the site's actual tile state -- so both kept showing a site for the rest of the event even after the shard there had already been picked up (by any player), which was misleading for everyone still navigating toward it.",
    changes: [
      "Both the in-world shard rain badge and the off-screen HUD locator arrow now drop a site as soon as that tile confirms (unfogged) the shard is gone, instead of persisting for the rest of the event"
    ]
  },
  {
    createdAt: 1787998957470, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.1",
    title: "Fixed the sign-in/name-and-color screen rendering behind a shard rain alert",
    why: "The sign-in overlay (including the new-player name/color picker) was styled at z-index 30, lower than the shard rain alert banner's z-index 33, the tech/structure detail overlays, and the season-end overlay. If a shard rain alert (or any of those overlays) became visible while a new player was still picking their name and color, it rendered on top of the picker, blocking it.",
    changes: [
      "Raised the sign-in/onboarding overlay to z-index 50 so it always sits above in-game alert and detail overlays while visible"
    ]
  },
  {
    createdAt: 1787948853587, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.6",
    title: "Fixed out-of-reach frontier tiles that never started decaying after their covering Relay Beacon/outpost was lost",
    why: "The out-of-reach decay timer was only ever stamped once, at the moment a tile was claimed -- a FRONTIER tile claimed while still inside your reach got no timer at all. If the anchor covering it later deactivated (a Relay Beacon disabled or destroyed, a Siege Outpost lost, a town or dock lost), nothing re-evaluated that tile's coverage: it just sat as \"Outside reach\" forever with frontierDecayKind stuck undefined, since the queue that drives expiry is only ever populated at claim time and there is deliberately no world-wide sweep (the mechanic that swept in PR #627 blocked the event loop for 9 seconds and was removed for it).",
    changes: [
      "Deactivating a reach anchor now re-checks its own disk (same scoped radius²-cost pass as the existing reach-caught-up case, not a sweep) and starts the decay timer on any FRONTIER tile left in genuine no-man's-land as a result"
    ]
  },
  {
    createdAt: 1787941776652, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.5",
    title: "Agrarian Works now shows its fish-tile bonus as its own highlight chip",
    why: "Researching Agrarian Works unlocks the Farmstead structure and also grants +1 FOOD slot on every owned fish tile, but the tech-tree card and detail view only ever showed a \"Farmstead\" chip -- the fish-tile bonus was undiscoverable unless you read the full description text.",
    changes: [
      "Agrarian Works now shows a \"Fish Tiles +1 Food Slot\" chip alongside its Farmstead chip, matching how other techs (e.g. Muster Flag +1) surface numeric bonuses as their own highlight"
    ]
  },
  {
    createdAt: 1787940942955, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.6",
    title: "Removed the settled-tile and dock defense bonuses; named the missing factory in \"no war industry\" combat lines",
    why: "Owning a settled tile or a dock granted a flat defense multiplier on top of forts/tech/war-industry, which didn't make sense thematically -- being settled or having a dock isn't a defensive structure. Separately, the attack/defense breakdown's \"has no war industry\" line never said which of the two Weapons Factories (Titanium or Umbrite) you or your target were actually missing, forcing you to go check.",
    changes: [
      "Removed the +35% \"Settled tile\" and +10% \"Dock\" defense bonuses from the combat breakdown; forts, towns, tech/domain mods, and war-industry status are unaffected",
      "The war-industry line in the attack/defense breakdown now names the specific missing factory, e.g. \"Target missing Umbrite Weapons Factory\" instead of a generic \"Target has no war industry\""
    ]
  },
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
    createdAt: 1787739347827, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.5",
    title: "Captured towns/docks now keep reach on their own tile",
    why: "Reach borders are sticky by design -- capturing a town or dock deep inside a rival's territory never pushes their border back. But that same stickiness was leaving the captured building with zero reach at all, not even on the single tile it stood on, if the rival's still-active anchors happened to still cover that exact spot.",
    changes: [
      "A captured town, dock, or outpost-family structure (relay beacon, siege outpost/tower, dread tower) now always keeps reach on its own tile, even when it's fully surrounded by a rival's larger, still-defended territory -- it just can't project that reach onto any neighbouring tile the rival is still actively defending"
    ]
  },
  {
    createdAt: 1787912102098, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.2",
    title: "Building Relay Beacon (or any structure) on a frontier tile no longer races its own settlement",
    why: "Clicking Build on a not-yet-settled frontier tile sends CLAIM_CONTINUATION_SET, whose server-side immediate-drive branch enqueues and dispatches its own SETTLE for that tile, while the client also sends a SETTLE directly for the same click. Both wanted the same already-in-flight outcome, but the server treated the second one as a conflicting duplicate and rejected it with SETTLE_INVALID 'tile is already settling' -- which the client then had to detect and paper over with a one-shot retry, visible as log noise and occasional settle-state flicker.",
    changes: [
      "A duplicate SETTLE for a tile the same player is already settling now resolves as a no-op on the server instead of rejecting, so the Relay Beacon claim-continuation race no longer hits the client's error-recovery/retry path at all (that path still exists for other cases, like a genuinely conflicting settle from another player)."
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
    createdAt: 1787908049178, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.3",
    title: "Build Relay Beacon now shows in both the Actions and Buildings tabs on a frontier tile",
    why: "Build Relay Beacon on an owned FRONTIER tile is a settle-then-build chain, but its action id (\"build_relay_beacon\") is shared with the plain building on a settled tile, so it got sorted only into the Buildings tab like any other structure -- unlike a neutral tile, where the equivalent action shows directly in the Actions tab next to Expand To.",
    changes: [
      "Build Relay Beacon now shows in both the Actions tab (next to Settle Land) and the Buildings tab on an owned FRONTIER tile, matching the parity it already has on a neutral tile, instead of being tucked away under Buildings only."
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
    createdAt: 1787937658626, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.3",
    title: "Fixed the out-of-reach decay timer never showing on the tile menu",
    why: "The gateway-sync layer that applies incoming tile deltas only recognized \"ENCIRCLEMENT\" as a valid frontierDecayKind and silently dropped any other value -- including \"OUT_OF_REACH\", the sim's other real decay kind -- back to undefined. An out-of-reach frontier tile's decay deadline (frontierDecayAt) synced to the client fine, but its kind didn't, so the tile menu's header status could never match the OUT_OF_REACH branch and always fell back to a static \"Outside reach\" with no live countdown, even while the tile was actively decaying.",
    changes: [
      "The tile menu now shows the \"Beyond your reach — decays in Xs\" countdown for a decaying out-of-reach frontier tile instead of a static \"Outside reach\" with no timer."
    ]
  },
  {
    createdAt: 1787930868931, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.3",
    title: "Cleaned up the sign-in magic link email",
    why: "The emailed sign-in link embedded whatever query string happened to be on the page when you requested it (e.g. leftover tile-focus params), making the link long and inconsistent between sends -- which reads worse to a reader and to spam filters.",
    changes: [
      "The magic link sent to your email now always points to the app's clean base URL instead of carrying along stray query params from the current page"
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
  }
];
export const CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  ...RECENT_CLIENT_CHANGELOG_ENTRIES,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_2,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_3,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_4
];
