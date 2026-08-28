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
    createdAt: 1787912311406, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.2",
    title: "Fixed several player-state fields silently reverting on reconnect",
    why: "The sim and gateway kept two separately-maintained copies of the reconnect-cache merge logic, and both had drifted: economyBreakdown, upkeepPerMinute, upkeepLastTick, and season-winner updates were dropped by one copy but not the other, and chosenTrickleResource the other way around. Separately, the INIT payload the gateway sends on reconnect never carried your event log, logistics throughput, imperial ward charges, or wonder rush-buy cooldown at all -- the last two have no client-side fallback, so a reconnect (a page refresh, a dropped connection) actively reset them to blank every time, even though the server's live state was correct the whole time.",
    changes: [
      "Reconnecting no longer resets your imperial ward charges or wonder rush-buy cooldown, and your event log, logistics throughput, economy breakdown, upkeep figures, chosen trickle resource, and season-winner status now consistently survive a reconnect regardless of which server-side cache happens to serve it."
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
    createdAt: 1787940609007, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.5",
    title: "Added a way back into 3D after it locked you out of it",
    why: "Two failed 3D attempts in a row (including a page refresh mid-load, which looks identical to a crash from the client's perspective) permanently pinned you to the 2D map, and the banner's own \"Add ?renderer=3d to try again\" instruction didn't actually work -- that param only controls whether 3D is attempted, not the on-disk crash streak that was blocking it, so retyping the URL just showed the same banner again.",
    changes: [
      "The \"3D map unavailable\" banner now has a \"Try 3D again\" button that clears the crash streak and reloads back into 3D",
      "Removed the banner's old ?renderer=3d instruction, since it never actually reset anything"
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
