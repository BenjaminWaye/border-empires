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
  version: "2026.07.25.1",
  title: "What's New",
  summary: "Logging in with a large empire is now much faster — several redundant steps in the login pipeline were removed.",
  entries: [
    {
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
      introducedIn: "2026.07.23.1",
      title: "Terrain now blocks and limits vision",
      why: "Vision previously ignored terrain entirely — an empire could see straight through mountain ranges and dense forest as if they were open plains, removing any tactical value from holding high ground or dense cover.",
      changes: [
        "Mountains now block line of sight: tiles directly behind a mountain (from a given vantage point) are hidden, though the mountain tile itself remains visible.",
        "A vision source standing on a forest tile only sees 1 tile out, regardless of tech or observatory bonuses that would otherwise extend its range."
      ]
    },
    {
      introducedIn: "2026.07.22.7",
      title: "Bigger, easier-to-read off-screen alert badges",
      why: "The off-screen locator badges for active musters and unfed towns were small enough that the crossed-swords and \"!\" glyphs were hard to make out at a glance, especially against the yellow arrow background.",
      changes: [
        "Alert locator badges are now larger (26px radius, up from 20px), with the arrow and glyph scaled proportionally instead of using fixed pixel sizes.",
        "Both glyphs now have a subtle drop shadow for contrast against the arrow, matching the layered look used elsewhere in the HUD."
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
    {
      introducedIn: "2026.07.19.14",
      title: "Fixed display name updates in Settings showing no feedback on failure",
      why: "Changing your display name in Settings silently showed no error if the message couldn't be sent (e.g. the connection dropped between opening the panel and clicking Update), and showed no success message if the server rejected the update with a generic gateway error — the first failure was only shown on the auth overlay (which isn't visible from the Settings panel), and the second left a stale pending-state flag that could suppress feedback from future attempts.",
      changes: [
        "Settings now shows a feed message ('Could not update display name. Finish sign-in and try again.') if the update request can't be sent, instead of silently doing nothing.",
        "The pending-name tracker is now also cleared on a generic gateway error that isn't already handled by the color-collision path, so the next successful PLAYER_UPDATE correctly reports the display name as updated."
      ]
    },
    {
      introducedIn: "2026.07.19.12",
      title: "Fixed the last-viewed map location getting reset on every login/reconnect",
      why: "A previous fix saved your last-viewed map location, but it was still being silently overwritten with your empire's location on every single login and reconnect, before you ever saw it restored — so it looked like the location was never actually being remembered.",
      changes: [
        "The map now correctly restores your last-viewed location on login and reconnect instead of always snapping back to your empire."
      ]
    },
    {
      introducedIn: "2026.07.19.11",
      title: "Fixed settled tiles still looking like frontier until you clicked them",
      why: "When a settlement finished, the tile's new SETTLED status was applied optimistically without bumping the map's tile-revision counter — the only signal the 3D map's overlay rebuild watches. The ownership overlay kept drawing the tile with the lighter frontier tint until an unrelated camera pan, zoom, or tile update forced a rebuild, which is why tapping the tile appeared to \"fix\" it.",
      changes: [
        "Optimistic tile updates that change ownership now bump the map revision, so a tile switches to its settled look the moment settlement completes instead of waiting for the next click or camera move."
      ]
    },
    {
      introducedIn: "2026.07.19.10",
      title: "Reduced silent disconnects with a server-side connection keep-alive",
      why: "Some players reported getting disconnected and reconnected frequently. Many of these had no close reason at all — the signature of an idle connection being silently dropped by a network or proxy without either side being told, rather than a real server problem.",
      changes: [
        "The server now sends a lightweight keep-alive ping to every connection every 30 seconds. This both keeps idle-timeout proxies from treating the connection as inactive and lets the server notice and clean up truly dead connections faster.",
        "This requires no change on your end — it happens automatically at the network level."
      ]
    },
    {
      introducedIn: "2026.07.19.9",
      title: "Alliance/truce request box now shows each AI's real name",
      why: "The previous fix for alliance/truce requests to AI players failing with \"target not found\" made the suggestion box only offer the resolvable \"AI N\" entry, but that left no way to tell which AI empire \"AI 1\" actually was.",
      changes: [
        "The suggestion box now shows an AI's real name (e.g. \"Freja Sund\") alongside its \"AI N\" entry, so you can identify it while the request still submits the resolvable name the server expects."
      ]
    },
    {
      introducedIn: "2026.07.19.8",
      title: "Fixed display name changes silently failing and reverting",
      why: "Changing your display name in Settings also resends your current tile color in the same request. If that stored color happened to collide with another player's (more likely on a large, long-running world than on staging's small test roster), the server rejected the whole update to protect color uniqueness — silently dropping the name change along with it. The Settings page also showed a \"Display name updated\" success message the instant the request was sent, without waiting to see whether the server actually accepted it, so the failure went unnoticed until the name reverted on the next reload.",
      changes: [
        "The server no longer re-checks color uniqueness when your color isn't actually changing, so a name-only update can no longer be blocked by an unrelated, pre-existing color collision.",
        "The Settings page now waits for server confirmation before showing \"Display name updated\", and shows the real rejection reason (e.g. a color conflict) if the update fails instead of claiming success."
      ]
    },
    {
      introducedIn: "2026.07.19.7",
      title: "Fixed the last-viewed map location getting stuck and never updating",
      why: "The last-viewed location was only saved when the camera crossed a full 64-tile chunk boundary, which an ordinary pan or zoom near your base routinely never does — so for a lot of play sessions the saved position never moved past wherever it was first set.",
      changes: [
        "Saving your last-viewed location is now decoupled from that chunk boundary — it saves on a lightweight one-second timer instead, so ordinary panning and zooming (not just big jumps) keeps it up to date.",
        "Zoom-only changes (mouse wheel / pinch, with no panning) are now saved too, which previously never triggered a save at all."
      ]
    },
    {
      introducedIn: "2026.07.19.6",
      title: "Fixed alliance/truce requests to AI players sometimes failing with \"target not found\"",
      why: "The alliance/truce target suggestion box offered two entries for the same AI player — the stable \"AI N\" name and that AI's real display name (e.g. \"Freja Sund\") shown on the leaderboard. Only \"AI N\" is recognized by the server, so picking the real name from the dropdown always failed with \"target not found\".",
      changes: [
        "The suggestion box now only offers the resolvable \"AI N\" name for AI players, matching what the server actually recognizes."
      ]
    },
    {
      introducedIn: "2026.07.19.5",
      title: "Fixed Report Bug popover not accepting clicks",
      why: "Clicking inside the Report Bug text box (from Settings) clicked through to the map behind it instead of focusing the textarea, making it hard to actually type a bug report.",
      changes: [
        "The Report Bug popover was missing from the HUD's list of interactive overlays, so it inherited pointer-events: none and passed clicks straight to the 3D map underneath. It now properly captures clicks like every other popup."
      ]
    },
    {
      introducedIn: "2026.07.19.4",
      title: "New \"Download Disconnect History\" button in Settings",
      why: "Some players have reported getting reconnected frequently, but there was no easy way to hand over evidence of when and why — the technical detail (close codes, timing) was only ever visible in a developer console.",
      changes: [
        "Settings now has a Download Disconnect History button next to Download Diagnostics, which saves a small JSON file listing your recent disconnects (when, how long you were connected beforehand, and whether it was a normal or abnormal close).",
        "This history is stored locally on your device and is not affected by the automatic reload that happens after a disconnect, so it can show a pattern across multiple reconnects, not just the most recent one."
      ]
    },
    {
      introducedIn: "2026.07.19.3",
      title: "The map now remembers your last-viewed location",
      why: "Reconnecting or reloading always re-centered the camera on your empire's tiles, even if you were looking somewhere else (scouting, checking a border, watching an ally) right before the disconnect.",
      changes: [
        "Your last-viewed map position and zoom are now saved automatically and restored on reconnect, reload, or the next time you log in on the same browser.",
        "This only affects the very first auto-recenter after load — the existing \"jump to my empire\" recenter button still works exactly as before."
      ]
    },
    {
      introducedIn: "2026.07.19.2",
      title: "Fixed structures appearing stuck at 00:00 forever",
      why: "A structure's construction progress popup only refreshed when some unrelated event happened to redraw the screen, so once the countdown hit zero it could sit there indefinitely even after the server had already finished the build — making it look like the fort would never complete.",
      changes: [
        "The tile detail popup now refreshes immediately when the server reports a structure finishing while that tile's menu is open.",
        "If a structure's countdown reaches zero but its status hasn't updated yet, the client now re-checks with the server instead of trusting the stale local timer forever."
      ]
    },
    {
      introducedIn: "2026.07.19.1",
      title: "Tile descriptions now show the AI player's real name",
      why: "Clicking a tile owned by an AI player showed a generic label like \"AI 5\" even though the leaderboard already displayed that AI's actual name (e.g. \"Freja Sund\") — the tile panel and the leaderboard were pulling from two different, inconsistent sources.",
      changes: [
        "Tile descriptions now show the AI's real name, matching the leaderboard.",
        "Truce and alliance requests targeting an AI player are unaffected — they still resolve correctly, since that flow keeps using the stable identifier the server expects."
      ]
    },
    // Older entries (2026.07.18.9 and earlier) trimmed: the release-day
    // window test only keeps entries within the latest 6 days of
    // LATEST_CLIENT_CHANGELOG.version -- see git history for the full changelog.
  ]
};
