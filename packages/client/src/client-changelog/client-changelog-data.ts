// Changelog entry data only, split out from client-changelog.ts to keep that
// file (rendering/visibility logic) under the repo's 500-line file cap. This
// file grows by ~1 entry per user-visible change; if it approaches the cap,
// prune entries older than the 6-day window enforced by
// client-changelog.test.ts ("keeps only the latest week of changelog
// entries").
//
// Entries are unordered here — append new ones anywhere (the end is
// easiest) instead of inserting at the top. client-changelog.ts sorts by
// createdAt before rendering, so there is no shared "top of list" or
// version field for parallel branches to collide on.

export type ClientChangelogEntry = {
  createdAt: number; // Unix ms. Use Date.now() when authoring a new entry.
  introducedIn: string;
  title: string;
  why: string;
  changes: string[];
};

// Add a new entry for every user-facing client release. Order doesn't
// matter; client-changelog.ts sorts by createdAt.
export const CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  {
    createdAt: 1785130609961, // 2026.07.27.1
    introducedIn: "2026.07.27.1",
    title: "Fixed: large-empire logins could still stall for 15+ seconds",
    why: "The 2026.07.25.1 duplicate-sign-in fix defined guards on both the client and the gateway, but neither was actually wired into the real login path — the client kept sending sign-in through its original unguarded code, and the gateway never checked its guard flag. A duplicate sign-in message (e.g. a flaky mobile connection triggering a reconnect while the first attempt was still finishing) could still run two full, concurrent login pipelines against the same connection, doubling snapshot-build work and sometimes leaving the connection stuck on the loading screen indefinitely.",
    changes: [
      "The client's duplicate-sign-in guard is now actually used on every sign-in attempt, including the very first one after opening Google sign-in.",
      "The gateway now also drops a duplicate sign-in message on the same connection instead of processing it a second time in parallel.",
      "Fixed a related gateway bug where a player's connection was permanently treated as \"already has data cached\" after their first login, even after a disconnect cleared that cache — a flaky connection with repeated drops could end up requesting an empty world snapshot with nothing to fill it back in."
    ]
  },
  {
    createdAt: 1784937780000, // 2026.07.25.3
    introducedIn: "2026.07.25.3",
    title: "Hills are now a real strategic prize",
    why: "Hills granted only a modest, easily-ignored vision bump, were scattered uniformly across the whole map instead of forming meaningful highland regions, and cost the same to claim as flat ground — nothing made fighting for high ground feel worthwhile.",
    changes: [
      "Base vision range lowered to 1 tile, so the hills vision bonus is now a real difference-maker: standing on a hill sees 2 tiles out instead of 1.",
      "Hills now cluster into highland regions (much like forests cluster into deep-forest regions), with only a rare scattering of standalone hills elsewhere.",
      "Expanding onto a hills tile now takes 1.5 seconds longer than claiming flat ground, reflecting the rougher terrain."
    ]
  },
  {
    createdAt: 1784937720000, // 2026.07.25.2
    introducedIn: "2026.07.25.2",
    title: "Fixed: waypoints to distant unexplored tiles could report no path even though one existed",
    why: "The 2026.07.24.5 unexplored-waypoint fix only treated the destination tile itself as reachable land — it still assumed every other unexplored tile in between was a wall. That made \"Expand Here\" work when the target was directly adjacent to your territory, but fail for anything farther away, since almost any real route to unscouted land crosses other unscouted tiles too.",
    changes: [
      "Waypoints toward any unexplored tile now treat every undiscovered tile along the route the same optimistic way as the destination — reachable, until real data proves otherwise."
    ]
  },
  {
    createdAt: 1784937660000, // 2026.07.25.1
    introducedIn: "2026.07.25.1",
    title: "Faster login for large empires",
    why: "Players with large territories could wait 10+ seconds on the loading screen. The login pipeline was doing the same heavy work multiple times: the client could send a duplicate sign-in request, the server marshalled the full visible tile set twice, and the snapshot builder re-computed vision coverage that the export step had already resolved.",
    changes: [
      "Duplicate sign-in requests during a single connection are now deduplicated on both the client and the server, so one login no longer triggers two full snapshot builds.",
      "The live subscription no longer re-marshals your entire visible tile set when the bootstrap snapshot already delivered it.",
      "The snapshot builder skips a redundant vision-coverage recompute on fog-of-war logins, cutting seconds off large-empire snapshot builds."
    ]
  },
  {
    createdAt: 1784851260000, // 2026.07.24.1
    introducedIn: "2026.07.24.1",
    title: "Hills terrain: +1 vision, visible in 2D and 3D",
    why: "The map previously had no way to reward holding high ground — every land tile granted the same vision range regardless of terrain relief.",
    changes: [
      "Hills tiles now grant +1 extra vision range to whoever is standing on them.",
      "In the 3D map, hills raise the ground itself into a distinct flat-topped rise — even a single, isolated hills tile pops fully out of completely flat surrounding ground.",
      "In the 2D map, hills tiles are marked with a rolling-mound icon."
    ]
  },
  {
    createdAt: 1784764860000, // 2026.07.23.1
    introducedIn: "2026.07.23.1",
    title: "Terrain now blocks and limits vision",
    why: "Vision previously ignored terrain entirely — an empire could see straight through mountain ranges and dense forest as if they were open plains, removing any tactical value from holding high ground or dense cover.",
    changes: [
      "Mountains now block line of sight: tiles directly behind a mountain (from a given vantage point) are hidden, though the mountain tile itself remains visible.",
      "A vision source standing on a forest tile only sees 1 tile out, regardless of tech or observatory bonuses that would otherwise extend its range."
    ]
  },
  {
    createdAt: 1784678820000, // 2026.07.22.7
    introducedIn: "2026.07.22.7",
    title: "Bigger, easier-to-read off-screen alert badges",
    why: 'The off-screen locator badges for active musters and unfed towns were small enough that the crossed-swords and "!" glyphs were hard to make out at a glance, especially against the yellow arrow background.',
    changes: [
      "Alert locator badges are now larger (26px radius, up from 20px), with the arrow and glyph scaled proportionally instead of using fixed pixel sizes.",
      "Both glyphs now have a subtle drop shadow for contrast against the arrow, matching the layered look used elsewhere in the HUD."
    ]
  },
  {
    createdAt: 1784678760000, // 2026.07.22.6
    introducedIn: "2026.07.22.6",
    title: "Season-victory hold alert",
    why: "Once a player met a victory threshold, the 24-hour hold countdown was only visible as a small text line inside the Leaderboard tab's pressure cards — easy to miss, and nothing told you a win was imminent unless you happened to open that tab.",
    changes: [
      "A dismissible alert card now appears the moment any player's season-victory objective starts its 24-hour hold, naming the leader, the objective, and the countdown.",
      'After dismissing it, a slim persistent banner keeps showing "Player winning in Xh Ym — Objective" until the hold resolves or is broken, on both desktop and mobile.',
      "The Leaderboard tab (desktop icon and mobile bottom-nav button) now pulses with a badge while the alert hasn't been acknowledged yet.",
      'The Leaderboard pressure cards also now show a "Winning in Xh Ym unless stopped" line for any objective currently holding its threshold.'
    ]
  },
  {
    createdAt: 1784678700000, // 2026.07.22.5
    introducedIn: "2026.07.22.5",
    title: "Fixed: Economic Ascendancy card showed a stale gold/minute figure",
    why: 'The leaderboard\'s "Overall" income column refreshed every tick, but the Economic Ascendancy victory-pressure card only refreshed every ~5 minutes, so the two could show different gold/minute numbers for the same empire until the next slow recompute caught up.',
    changes: [
      "The Economic Ascendancy card's leader value and your own gold/minute comparison now refresh every leaderboard tick, always matching the Overall column."
    ]
  },
  {
    createdAt: 1784678640000, // 2026.07.22.4
    introducedIn: "2026.07.22.4",
    title: "Empire Integrity warning now shows at most once every 30 days",
    why: "Dismissing the low Empire Integrity callout only lasted until integrity recovered above 90% and dropped again, or until the page reloaded — so if integrity stayed below 90% across sessions, the callout reappeared on every login even after you'd already acknowledged it.",
    changes: [
      'Dismissing the Empire Integrity warning (via × or "I understand") now persists locally for 30 days, so it won\'t reappear on future logins during that window unless integrity first recovers above 90% and drops again.'
    ]
  },
  {
    createdAt: 1784678580000, // 2026.07.22.3
    introducedIn: "2026.07.22.3",
    title: "Light Outposts now show their attack-aura range when selected",
    why: "Selecting a Siege Outpost on the 3D map drew a highlighted range ring showing the tiles it boosts, but selecting a Light Outpost drew nothing — even though Light Outposts grant the same kind of attack-aura bonus within the same 5-tile range.",
    changes: [
      "Selecting an active, owned Light Outpost now shows the same range ring as Siege Outposts, Siege Towers, and Dread Towers."
    ]
  },
  {
    createdAt: 1784678520000, // 2026.07.22.2
    introducedIn: "2026.07.22.2",
    title: "Crossed-swords icon for active muster alerts",
    why: 'The off-screen locator arrow for an active muster used the same generic "!" glyph as every other alert, making it hard to tell at a glance which off-screen indicator was a muster.',
    changes: [
      'The off-screen locator badge for an active muster flag now shows a crossed-swords icon instead of "!"; other alert types are unchanged.'
    ]
  },
  {
    createdAt: 1784678460000, // 2026.07.22.1
    introducedIn: "2026.07.22.1",
    title: "Minimap now shows territory ownership colors",
    why: "The minimap only ever showed terrain and fog, so at a glance you couldn't tell whose territory was where without opening the full map. Owned tiles are now tinted with each empire's color, same as the main map.",
    changes: [
      "Settled and frontier tiles now render with the owning player's color on the minimap (settled tiles slightly more opaque than frontier tiles), respecting fog of war."
    ]
  },
  {
    createdAt: 1785096772000, // 2026.07.26.1
    introducedIn: "2026.07.26.1",
    title: "Fixed seeing darkness after a new season starts",
    why: "When a new season rolled over the saved map camera location from the old season was never cleared. On the next page load the stale coordinates were restored and the player saw darkness instead of their new base.",
    changes: [
      "The persisted camera location is now cleared on season rollover so the next load centers on your new home tile instead of stale old-season coordinates."
    ]
  },
  // Older entries (2026.07.21.6 and earlier) trimmed: the release-day
  // window test only keeps entries within the latest 6 days of the newest
  // entry's createdAt -- see git history for the full changelog.
];
