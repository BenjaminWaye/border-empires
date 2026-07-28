// Changelog entry data only, split out from client-changelog.ts to keep that
// file (rendering/visibility logic) under the repo's 500-line file cap. This
// file grows by ~1 release entry per user-visible change; if it approaches
// the cap, prune entries older than the 6-day release-day window enforced by
// client-changelog.test.ts ("keeps only the latest week of release entries").

export type ClientChangelogEntry = {
  introducedIn: string;
  title: string;
  why: string;
  changes: string[];
};

export type ClientChangelogRelease = {
  version: string;
  title: string;
  summary: string;
  entries: ClientChangelogEntry[];
};

// Update this object for every user-facing client release.
export const LATEST_CLIENT_CHANGELOG: ClientChangelogRelease = {
  version: "2026.07.28.1",
  title: "What's New",
  summary: "Rush-buy lets you finish an in-progress settle or build instantly for gold.",
  entries: [
    {
      introducedIn: "2026.07.28.1",
      title: "Rush-buy: finish an in-progress settle or build for gold",
      why: "Manpower is scarce and slow to regenerate by design, but that also means an in-progress Settle or structure build has no way to speed up once started — gold, meanwhile, had nothing to spend on outside of tech and upkeep. Rush-buy gives gold a second job: pay to finish something you're already building right now, priced by how much time is actually left, not the action's full cost.",
      changes: [
        "A tile that's actively settling or has a structure under construction now shows a rush-buy button (⏩🪙) next to its remaining-time countdown in the tile detail panel.",
        "The price scales down as the timer progresses — rushing something nearly done costs almost nothing, rushing something you just started costs close to the full price (anchored at 0.5 gold per manpower point the action costs).",
        "Applies to Settle and every structure build (Fort/Siege tier upgrades included) — not to removals, which can't be rushed."
      ]
    },
    {
      introducedIn: "2026.07.27.3",
      title: "Garrison Hall and Rail Depot now grant real manpower bonuses",
      why: "Garrison Hall previously did nothing but cost resources and gold upkeep — its old \"+20% defense\" description was never actually implemented. Rail Depot's manpower regen was a flat bonus per depot with no cap on how many you could spam. This wires up the manpower structure tree the economy rewrite was missing: acquiring towns still grows your manpower on its own, but investing in Garrison Halls and a connected Rail Depot network now gives a real, earned way to grow further.",
      changes: [
        "Garrison Hall now grants +150 manpower cap to the town it's built in, unconditionally.",
        "Rail Depot no longer gives a flat manpower regen bonus per depot. Instead, only one Rail Depot may be built per connected-town network, and it amplifies every Garrison Hall already in that network: +75 manpower cap and +0.1 manpower/min, per Garrison Hall, with no cap on how many Garrison Halls can contribute.",
        "Trying to build a second Rail Depot in a network that already has one is now rejected — build menus and the manpower breakdown panel reflect the new bonuses."
      ]
    },
    {
      introducedIn: "2026.07.27.2",
      title: "Structures no longer cost gold to build",
      why: "Gold income was cut about 288x in an earlier update so a strong empire could no longer coast on it forever, but every structure's build-gold price stayed at its old, pre-cut value — Bank was still 3,200 gold against an economy earning roughly 10 gold/day/town. That made every structure both far too expensive in gold and, on top of that, also required its full manpower price, a double-tax nobody could realistically pay. Gold now only matters for tech, rush-buys, and a few structures' ongoing upkeep, never for the act of building.",
      changes: [
        "Every structure's build gold cost is now 0 — manpower (and, for some structures, a strategic resource) is the entire build price.",
        "This includes Forts, Siege Outposts, Light/Wooden Outposts, and all four monument parts and their final assemblies, not just the everyday economic buildings.",
        "The four monument assemblies (Imperial Exchange, Worldbreaker Cannon, Aegis Dome, Astral Dock) are no longer mislabeled \"Free after 3 parts\" — they show and require their real manpower + SHARD cost.",
        "Cost displays across the build menu no longer show a stray \"0 gold +\" — the gold clause disappears entirely when it's zero."
      ]
    },
    {
      introducedIn: "2026.07.27.1",
      title: "Manpower now gates every structure build",
      why: "Structure build costs already draw manpower (Market, Bank, Farmstead, synthesizers, and everything else), but the build menu only checked gold, so it offered builds you couldn't actually afford until the server rejected them. This closes that gap for the roughly 30 remaining economic structures, matching the fix already shipped for Expand/Settle.",
      changes: [
        "Every economic structure's build/upgrade option (Market, Bank, Farmstead, Camp, Mine, Granary, Census Hall, Clearing House, Caravanary, all three Synthesizers and their Advanced upgrades, Exchange House, Rail Depot, Garrison Hall, Governor's Office, Foundry, Waterworks, Radar System, Airport, Aether Tower, Customs House, and all four monument parts) now checks and displays its manpower cost, not just gold and strategic resources.",
        "The build menu now tells you specifically when you're short on manpower instead of only ever citing gold or a resource."
      ]
    },
    {
      introducedIn: "2026.07.26.1",
      title: "Expand and Settle now cost manpower",
      why: "Gold's income scaled up with empire size while EXPAND and SETTLE stayed flat-priced, so both actions decayed into a non-decision by mid-game — the one currency that funded expansion could never stay scarce. Manpower, by contrast, is already structurally throttled (deep cap, slow regen), so moving expansion onto it keeps every claim and settlement a real, ongoing cost.",
      changes: [
        "Claiming a frontier tile now costs 10 manpower; settling a claimed tile now costs 20 manpower, in addition to their existing (now much smaller) gold costs.",
        "A new player starts with a larger manpower pool (576, regenerating at 0.4/min) so early expansion still feels generous — sized to cover roughly 40 claims and 8 settles before waiting on regen.",
        "Capturing or founding a new town immediately adds that town's own manpower cap and regen on top of your starting pool, instead of being masked by it.",
        "The map, waypoint planner, and bulk auto-settle queue all now show and respect the real manpower cost, so they no longer offer an expand/settle you can't actually afford."
      ]
    },
    {
      introducedIn: "2026.07.22.6",
      title: "Season-victory hold alert",
      why: "Once a player met a victory threshold, the 24-hour hold countdown was only visible as a small text line inside the Leaderboard tab's pressure cards — easy to miss, and nothing told you a win was imminent unless you happened to open that tab.",
      changes: [
        "A dismissible alert card now appears the moment any player's season-victory objective starts its 24-hour hold, naming the leader, the objective, and the countdown.",
        "After dismissing it, a slim persistent banner keeps showing \"Player winning in Xh Ym — Objective\" until the hold resolves or is broken, on both desktop and mobile.",
        "The Leaderboard tab (desktop icon and mobile bottom-nav button) now pulses with a badge while the alert hasn't been acknowledged yet.",
        "The Leaderboard pressure cards also now show a \"Winning in Xh Ym unless stopped\" line for any objective currently holding its threshold."
      ]
    },
    {
      introducedIn: "2026.07.22.5",
      title: "Fixed: Economic Ascendancy card showed a stale gold/minute figure",
      why: "The leaderboard's \"Overall\" income column refreshed every tick, but the Economic Ascendancy victory-pressure card only refreshed every ~5 minutes, so the two could show different gold/minute numbers for the same empire until the next slow recompute caught up.",
      changes: [
        "The Economic Ascendancy card's leader value and your own gold/minute comparison now refresh every leaderboard tick, always matching the Overall column."
      ]
    },
    {
      introducedIn: "2026.07.22.4",
      title: "Empire Integrity warning now shows at most once every 30 days",
      why: "Dismissing the low Empire Integrity callout only lasted until integrity recovered above 90% and dropped again, or until the page reloaded — so if integrity stayed below 90% across sessions, the callout reappeared on every login even after you'd already acknowledged it.",
      changes: [
        "Dismissing the Empire Integrity warning (via × or \"I understand\") now persists locally for 30 days, so it won't reappear on future logins during that window unless integrity first recovers above 90% and drops again."
      ]
    },
    {
      introducedIn: "2026.07.22.3",
      title: "Light Outposts now show their attack-aura range when selected",
      why: "Selecting a Siege Outpost on the 3D map drew a highlighted range ring showing the tiles it boosts, but selecting a Light Outpost drew nothing — even though Light Outposts grant the same kind of attack-aura bonus within the same 5-tile range.",
      changes: [
        "Selecting an active, owned Light Outpost now shows the same range ring as Siege Outposts, Siege Towers, and Dread Towers."
      ]
    },
    {
      introducedIn: "2026.07.22.2",
      title: "Crossed-swords icon for active muster alerts",
      why: "The off-screen locator arrow for an active muster used the same generic \"!\" glyph as every other alert, making it hard to tell at a glance which off-screen indicator was a muster.",
      changes: [
        "The off-screen locator badge for an active muster flag now shows a crossed-swords icon instead of \"!\"; other alert types are unchanged."
      ]
    },
    {
      introducedIn: "2026.07.22.1",
      title: "Minimap now shows territory ownership colors",
      why: "The minimap only ever showed terrain and fog, so at a glance you couldn't tell whose territory was where without opening the full map. Owned tiles are now tinted with each empire's color, same as the main map.",
      changes: [
        "Settled and frontier tiles now render with the owning player's color on the minimap (settled tiles slightly more opaque than frontier tiles), respecting fog of war."
      ]
    },
    // Older entries (2026.07.21.6 and earlier) trimmed: the release-day
    // window test only keeps entries within the latest 6 days of
    // LATEST_CLIENT_CHANGELOG.version -- see git history for the full changelog.
  ]
};
