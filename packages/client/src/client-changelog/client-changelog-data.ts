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
  version: "2026.07.26.1",
  title: "What's New",
  summary: "Expanding and settling land now costs manpower, not just gold.",
  entries: [
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
    {
      introducedIn: "2026.07.21.6",
      title: "Fixed: town capture popup missing after winning an attack",
      why: "The celebratory town-capture popup only fired for tile-delta updates (EXPAND, settling), so capturing an enemy town through combat never showed it even though the capture itself worked correctly.",
      changes: [
        "Winning an ATTACK that captures an enemy town now shows the town capture popup, same as capturing via EXPAND or settlement."
      ]
    },
    {
      introducedIn: "2026.07.21.5",
      title: "Low Empire Integrity now shows a dismissible warning",
      why: "Falling below the 90% integrity threshold quietly cuts into your income and growth bonus, but the only way to notice was to open the breakdown panel yourself. A callout pointing at the Empire Integrity chip now flags it directly.",
      changes: [
        "When Empire Integrity drops below 90%, a callout anchored to the Empire Integrity chip explains the income/growth penalty.",
        "Dismiss it with the × in its corner or the \"I understand\" button; it reappears if integrity recovers above 90% and later drops again."
      ]
    },
    {
      introducedIn: "2026.07.21.4",
      title: "Smoother minimap on maps with a lot of unexplored fog",
      why: "The minimap redrew its fog-of-war overlay one pixel at a time every time it refreshed, which could stall the frame for several milliseconds on large explored maps. It now draws each contiguous fog run in a single stroke instead.",
      changes: [
        "Reduced minimap redraw cost by merging contiguous fog-of-war pixels into single fill operations instead of drawing pixel-by-pixel."
      ]
    },
    {
      introducedIn: "2026.07.21.3",
      title: "Move a queued build or settlement to the front of the line",
      why: "A tile with a queued build or settlement only offered a cancel button, even though the actual goal was usually just to get it started sooner. Now you can bump it ahead of everything else waiting for a development slot without losing its place entirely.",
      changes: [
        "Queued builds and queued settlements now show a \"Jump to front of queue\" button alongside the existing cancel option (hidden once the entry is already first in line)."
      ]
    },
    {
      introducedIn: "2026.07.21.2",
      title: "Display name changes now confirm up front and are limited to once per season",
      why: "Nothing stopped a player from renaming repeatedly, and a successful rename was easy to miss with only a feed message noting it. Settings now asks for confirmation before sending an actual rename (not the initial name pick), the server enforces one rename per season, and a successful change now also pops a clear confirmation.",
      changes: [
        "Clicking Update on an actual name change (not your first-time setup) now confirms first, noting the once-per-season limit, before sending the request.",
        "The server now rejects a second rename attempt within the same season with a clear \"try again next season\" message.",
        "A successful rename now also shows a confirmation popup with your new name, in addition to the existing feed message."
      ]
    },
    {
      introducedIn: "2026.07.21.1",
      title: "Fixed \"Signed in as\" showing your old name after changing it in Settings",
      why: "The \"Signed in as\" line in Settings read the auth label captured from your Firebase account at login time, which is never touched by a display name change — only the Display Name field itself (backed by a separate piece of state) updated. So a successful rename showed the new name in the input box and a \"Display name updated.\" feed message, but the line right above it kept showing the name you signed in with.",
      changes: [
        "\"Signed in as\" now shows your current in-game display name once it's known, instead of the name captured at login."
      ]
    },
    // Older entries (2026.07.19.14 and earlier) trimmed: the release-day
    // window test only keeps entries within the latest 6 days of
    // LATEST_CLIENT_CHANGELOG.version -- see git history for the full changelog.
  ]
};
