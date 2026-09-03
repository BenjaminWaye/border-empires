// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_6: ClientChangelogEntry[] = [
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
    createdAt: 1787930868931, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.3",
    title: "Cleaned up the sign-in magic link email",
    why: "The emailed sign-in link embedded whatever query string happened to be on the page when you requested it (e.g. leftover tile-focus params), making the link long and inconsistent between sends -- which reads worse to a reader and to spam filters.",
    changes: [
      "The magic link sent to your email now always points to the app's clean base URL instead of carrying along stray query params from the current page"
    ]
  },
  {
    createdAt: 1787999763164, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.2",
    title: "Titanium Bastion and Thunder Bastion cost more manpower to build",
    why: "All three top fort tiers (Fort, Titanium Bastion, Thunder Bastion) cost a flat 300 manpower to build despite defending at very different strengths (2.5x/4x/8x), so the strongest fort in the game was no harder to raise than the weakest of the three.",
    changes: [
      "Titanium Bastion now costs 480 manpower to build (was 300)",
      "Thunder Bastion now costs 960 manpower to build (was 300)",
      "Fort and Palisade (Wooden Fort) manpower costs are unchanged at 300 and 150"
    ]
  },
  {
    createdAt: 1787999049644, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.1",
    title: "Settled tiles are defensible again",
    why: "PR #1656 removed the settled-tile and dock defense bonuses because neither is a defensive structure, but that left settled land with no baseline defense at all -- only forts, town bonus, tech/domain mods, and war-industry status contributed, so an undeveloped settled tile defended no better than open frontier.",
    changes: [
      "Settled tiles now grant a +30% defense multiplier again (previously +35%, and separate from the still-removed dock bonus), stacking with Town, forts, and other defense mults as before"
    ]
  },
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
  }
];
