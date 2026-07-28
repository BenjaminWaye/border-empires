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
    createdAt: 1785230720833, // 2026.07.28.3
    introducedIn: "2026.07.28.3",
    title: "Fixed: farms, towns, and other overlays floated above hills in 3D mode",
    why: "The 3D renderer's shared surfaceY calculation (used to place buildings, towns, resource icons, and every other tile overlay) already picked up a hill tile's elevation bonus from heightfield.elevationAt(), then added that same bonus a second time for any tile flagged as hills. That doubled the hill's height bump under every overlay on a hill tile, so farms, towns, and resource icons rendered a full bonus-height above the visible hill dome instead of resting on its peak.",
    changes: [
      "Removed the duplicate hills-elevation bonus from the 3D overlay placement formula — buildings, farms, towns, and resource icons now sit directly on the hill's surface instead of floating above it."
    ]
  },
  {
    createdAt: 1785225359405, // 2026.07.28.2
    introducedIn: "2026.07.28.2",
    title: "Fixed: Empire Integrity warning nagged you on every login; added discovery tips",
    why: "The Empire Integrity dismissal was stored under a single global localStorage key with no per-account scoping, so on a shared browser/device a dismissal from one account could leak onto (or get overwritten by) another account, making the warning reappear even after you'd dismissed it. Separately, new players had no in-game explanation of what towns and resource tiles do or why they're worth capturing.",
    changes: [
      "Empire Integrity warning dismissal is now scoped per account, so dismissing it actually keeps it hidden for that login going forward (it still resurfaces after 30 days or once integrity recovers above 90%).",
      "Added a tip the first time you discover a town, and separate tips for the first Food, Iron, Crystal, and Supply resource tile you discover, each explaining why it's worth capturing.",
      "Each discovery tip reappears after 30 days/a season if dismissed (same window as Empire Integrity). A \"Don't show tooltips\" checkbox on the tip lets you mute all discovery tips for that same window in one action."
    ]
  },
  {
    createdAt: 1785215980277, // 2026.07.28.1
    introducedIn: "2026.07.28.1",
    title: "Fixed: hill tiles had no grid square around them in 3D mode",
    why: "Tile gridlines shared the exact same vertex buffer as the main terrain mesh. A hill tile's boundary sits at exactly the same height as the hill dome's own flat outer rim (by design, the dome tapers to zero before reaching the tile edge), so the gridline and the dome's opaque rim geometry occupied the identical 3D position — a coplanar tie the thin grid line consistently lost, leaving every hill tile with no visible grid square around it.",
    changes: [
      "Tile gridlines now use their own slightly-raised position buffer, so they render reliably on top of hill tiles instead of losing a depth tie against the dome mesh.",
      "Verified against isolated hills, scattered hills, and dense adjacent hill clusters — gridlines are now intact around every hill tile in all cases."
    ]
  },
  {
    createdAt: 1785200500000, // 2026.07.27.4
    introducedIn: "2026.07.27.4",
    title: "Fixed: territory ownership overlay didn't follow the hill's shape",
    why: "The 3D hills dome mesh rises above the flat terrain grid, but the ownership overlay (and its fogged-tile variants) drew one flat plane between a tile's 4 corners regardless. On a hill, that plane either sank into the dome or floated as a flat plate poking above/through it, instead of tracing the hill's actual curve.",
    changes: [
      "Owned hill tiles now render their ownership tint draped over the hill's real curved surface, matching the terrain exactly instead of a flat plane cutting through it.",
      "Applies to the normal ownership overlay and both fogged-tile ownership overlays (last-witnessed owner tint on tiles you no longer have vision of)."
    ]
  },
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
    createdAt: 1785147877000, // 2026.07.27.2
    introducedIn: "2026.07.27.2",
    title: "Fixed: ownership overlay and buildings invisible on hills in 3D mode",
    why: "The 3D hills dome mesh (added 2026.07.25.1) rose 0.45 world-units above the base terrain, but the ownership overlay and all building/structure markers used Y positions from the heightfield grid — which excludes hills. The ownership overlay failed the depth test against the closer dome geometry and was never drawn, and buildings on hill tiles appeared to sink underground instead of sitting on the surface.",
    changes: [
      "Ownership overlays (settled and frontier territory colors) now always render on top of the hill mesh, matching the 2D canvas behavior where ownership is a flat fill on top of terrain.",
      "Towns, forts, resources, economic structures, and all other tile markers now correctly rise with the hill dome on hills tiles instead of being hidden underneath."
    ]
  },
  {
    createdAt: 1785129932105, // 2026.07.27.1
    introducedIn: "2026.07.27.1",
    title: "Fixed: unexplored-tile waypoints stopped working entirely",
    why: "An unrelated merge on client-action-flow.ts accidentally reverted the unexplored-tile waypoint feature back to its pre-feature state — clicking an unexplored tile went back to silently doing nothing (no menu, no selection) instead of opening the \"Unexplored\" menu with an Expand Here option.",
    changes: [
      "Restored the unexplored-tile menu and waypoint action handling that were silently dropped by an earlier merge."
    ]
  },
  {
    createdAt: 1785096000000, // 2026.07.26.1
    introducedIn: "2026.07.26.1",
    title: "Fixed seeing darkness after a new season starts",
    why: "When a new season rolled over the saved map camera location from the old season was never cleared. On the next page load the stale coordinates were restored and the player saw darkness instead of their new base.",
    changes: [
      "The persisted camera location is now cleared on season rollover so the next load centers on your new home tile instead of stale old-season coordinates."
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
    createdAt: 1784927317000, // 2026.07.24.3 (restored)
    introducedIn: "2026.07.24.3",
    title: "Watchtowers are now rarer",
    why: "At roughly half the town count, watchtowers were common enough that finding one was rarely a meaningful discovery. Cutting the count makes each one a more notable find.",
    changes: [
      "The number of watchtower sites spread across the map has been lowered from ~150 to ~50."
    ]
  },
  {
    createdAt: 1784923957000, // 2026.07.24.1 (restored)
    introducedIn: "2026.07.24.1",
    title: "New structure: Watchtowers",
    why: "Scouting a new area meant either committing to a slow, tile-by-tile expansion or attacking blind. Watchtowers give players a way to peek at what's around a distant, unclaimed area before deciding whether it's worth pushing into.",
    changes: [
      "Roughly 150 dormant watchtower sites are now spread across the map, about half as many as there are towns.",
      "Expanding your territory onto a watchtower's tile activates it once: for about 10 seconds, it reveals the resources, towns, and terrain in the surrounding area (without permanently clearing fog of war), then the area fades back to normal fog.",
      "Watchtowers appear on the minimap and on the main map in both 2D and 3D play modes as a small brass, steampunk-styled tower with a lantern beacon that lights up once activated."
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
    createdAt: 1785200000000, // 2026.07.27.3
    introducedIn: "2026.07.27.3",
    title: "Fixed: login stalls on mobile reduced by ~50%",
    why: "Every login opened two WebSocket connections (control and bulk) and ran the full heavyweight login pipeline on both — doubling prepare-player, bootstrap-subscribe, and snapshot-build work on the CPU-constrained staging box. The bulk channel only needs identity resolution and socket attachment; everything else was redundant.",
    changes: [
      "The bulk WebSocket channel now skips the prepare-player, bootstrap-subscribe, live-subscribe, and snapshot-build steps during login, cutting per-login CPU work roughly in half.",
      "Login stalls for large empires should be significantly shorter on mobile and slow connections."
    ]
  },
  {
    createdAt: 1785097225841, // 2026.07.26.2
    introducedIn: "2026.07.26.2",
    title: "Snappier actions during heavy fights",
    why: "Closing a tile menu or clicking a non-muster tile sent a pointless \"stop watching muster\" request to the server every single time — even when you were never watching one. During rapid attacking this fired several times a second, and each one cost the server a full command round-trip that always failed, adding to server-side delays that could make combat results arrive late.",
    changes: [
      "The client now only tells the server to stop watching a muster flag when it actually started watching one.",
      "Server-side: muster watch toggles are no longer written to the command database at all — they are view state, not game actions — eliminating a steady stream of database errors."
    ]
  },
  {
    createdAt: 1785215000000, // 2026.07.28.3
    introducedIn: "2026.07.28.3",
    title: "Discovery tips for docks and barbarians; Storybook catalog for reviewing all tip copy",
    why: "Docks and barbarian territories are important strategic features but had no in-game explanation when first encountered. A Storybook story now renders every discovery tip from the source data so copy can be reviewed in one place.",
    changes: [
      "Added a one-time discovery tip for the first dock you discover, explaining that docks connect across the sea for launching attacks and expanding onto distant shores.",
      "Added a one-time discovery tip for the first barbarian tile you discover, explaining that barbarian camps spawn patrols and that clearing them yields gold and expands your border.",
      "Added a Storybook story (UI/Discovery Tips) that renders every discovery tip from the source data — copy changes to client-discovery-tips.ts automatically update the story."
    ]
  },
  {
    createdAt: 1785215100000, // 2026.07.28.4
    introducedIn: "2026.07.28.4",
    title: "New season now requires 5 players to vote",
    why: "Anyone could unilaterally trigger a new season for every player with a single click. That made accidental early rollovers too easy, and gave the last player standing less incentive to keep playing — the season could end at any moment on someone else's whim.",
    changes: [
      '"Start New Season" is replaced by "Vote for New Season". Each player can vote once; the season starts when 5 unique players have voted.',
      "Once you vote, the button shows the current vote count (e.g. 'Vote cast (3/5)') and is disabled.",
      "Votes are cleared when a new season actually begins, so every post-rollover season requires a fresh vote."
    ]
  },
  {
    createdAt: 1785215200000, // 2026.07.28.5
    introducedIn: "2026.07.28.5",
    title: "Season-end Misc tab with deadliest tile and longest road",
    why: "The season end screen now tracks which tile saw the most manpower lost in battle and the longest continuous road, giving players a glimpse into the season's unique history.",
    changes: [
      "Added a Misc tab to the season end overlay showing the deadliest tile (most manpower lost in a single battle) and the longest road (most tiles connected by road network).",
      "Tracks manpower losses per tile across the entire season."
    ]
  },
  {
    createdAt: Date.now(),
    introducedIn: "next",
    title: "Victory countdown now shows immediately when a threshold is met",
    why: "When a player met a victory condition threshold (e.g. controlling 50% of towns), the leaderboard showed \"Threshold met\" but never displayed the 24-hour hold countdown until the next day — because the timer enrichment was discarded on the first recompute.",
    changes: [
      "The leaderboard now shows \"Winning in 23h 59m unless stopped\" (and ticks down) from the moment a victory threshold is first met.",
      "The victory hold alert overlay also fires immediately instead of being silent for up to 24 hours."
    ]
  },
  // Older entries (2026.07.22.1 and earlier) trimmed: the release-day
  // window test only keeps entries within the latest 6 days of the newest
  // entry's createdAt -- see git history for the full changelog.
];
