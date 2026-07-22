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
  version: "2026.07.21.6",
  title: "What's New",
  summary: "The town capture popup now shows up when you win it in a fight, not just when you settle or expand into it.",
  entries: [
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
    {
      introducedIn: "2026.07.18.9",
      title: "Town Captured popup now shows expected gold production",
      why: "The Town Captured popup told you the town would provide Manpower Cap and Manpower Regen once settled, but only mentioned gold production in a vague note — no number was shown, even though the base rate can be computed from the tier constants the client already has.",
      changes: [
        "A new Gold Production stat card shows the base gold-per-minute rate for the captured town (e.g. 2.00/m for a Town, 3.00/m for a City, up to 6.40/m for a Metropolis).",
        "Settlements show a flat 1.00/m since they have no population tier multiplier and no support requirement.",
        "The note now clarifies that support tiles and structures further multiply this base rate, matching how the manpower stats use constants derived from tier alone."
      ]
    },
    {
      introducedIn: "2026.07.18.8",
      title: "Sharding panel now shows the next shard rain countdown on login",
      why: "The persistent \"Shard Network\" panel could sit without a countdown for a long time after logging in — the countdown only appeared once a live server push happened to arrive, which could be minutes or hours after opening the panel.",
      changes: [
        "The server now includes the next scheduled shard rain (or the remaining time on an active one) in your login data, so the panel shows a countdown immediately.",
        "The one-time popup alert still only appears when a shard rain is actually starting, not on every login."
      ]
    },
    {
      introducedIn: "2026.07.18.7",
      title: "Fixed the root cause of Google sign-in's storage error on mobile browsers",
      why: "Google sign-in's OAuth handshake round-trips through a page hosted on a different address (border-empires.firebaseapp.com) than the game itself. Some mobile browsers block that page from using the storage it needs to track the sign-in, which surfaced as Firebase's raw, confusing \"Unable to process request due to missing initial state\" error — on regular Chrome and Safari, not just in-app browsers.",
      changes: [
        "Google sign-in's handshake now runs on the game's own address instead of a separate one, so the browser no longer treats it as third-party storage to block.",
        "This fixes the underlying cause for regular mobile browsers; the existing guidance for in-app browsers (Messenger, Instagram, etc.) to open the page in Chrome or Safari is unaffected."
      ]
    },
    {
      introducedIn: "2026.07.18.6",
      title: "Fixed Google sign-in failing inside Messenger/Instagram's in-app browser",
      why: "Tapping a link from Facebook Messenger, Instagram, or similar apps opens it in that app's built-in browser, which blocks the popup Google sign-in uses and silently falls back to a redirect Firebase can't complete there (its session storage is blocked or wiped mid-redirect). Players saw only Firebase's raw, confusing \"Unable to process request due to missing initial state\" error page with no way forward.",
      changes: [
        "Google sign-in now detects known in-app browsers (Messenger, Instagram, Line, WeChat, TikTok, Twitter/X) up front and shows a clear message asking the player to open the page in Chrome or Safari instead of attempting a sign-in that's guaranteed to fail there.",
        "If that raw Firebase storage error still surfaces for an undetected in-app browser, it's now replaced with a friendly message pointing the player to their system browser."
      ]
    },
    {
      introducedIn: "2026.07.18.5",
      title: "Fixed Continue sometimes not closing this popup",
      why: "Closing this popup persisted correctly (you wouldn't see it again for this release) but the on-screen close depended on a full interface refresh completing right afterward. If anything else in that refresh had a problem, the popup could stay stuck open and unresponsive to further clicks even though the click itself worked.",
      changes: [
        "The Continue button (and clicking outside the popup) now closes it immediately, independent of the rest of the interface refresh."
      ]
    },
    {
      introducedIn: "2026.07.18.4",
      title: "The game connection no longer crashes on an unexpected error",
      why: "Every update from the game server (tile changes, combat results, alliance updates, and dozens of other message types) was processed by a single handler with no error containment of its own. Any unexpected failure while handling any one of those updates — a bad payload, a browser restriction, a bug in any one of the many message types — could crash the entire app rather than just that one update failing quietly.",
      changes: [
        "Server-update processing is now wrapped so a failure handling any single update is logged and skipped instead of crashing the app.",
        "The very large chunk of code that handles the initial game-state sync when you connect was also split into its own file as part of this change, with no change in behavior."
      ]
    },
    {
      introducedIn: "2026.07.18.3",
      title: "Fixed a Safari crash right after saving your display name",
      why: "Saving a profile/display-name change broadcasts a style update to every connected player, including yourself, which immediately re-renders your own HUD and login overlay. That re-render wasn't protected against a browser API throwing partway through (the same class of Safari storage/DOM restriction behind the email-link crash), so on some Safari sessions it could crash the app right after a successful name save.",
      changes: [
        "The HUD/overlay refresh that runs right after a name or color change is now contained — if a browser API throws partway through, the change still saves and the interface keeps working instead of crashing."
      ]
    },
    {
      introducedIn: "2026.07.18.2",
      title: "Fixed a Safari crash loop on the email sign-in link",
      why: "Some iPhone Safari sessions (most often when tapping the sign-in link from the Mail app) throw when the page tries to read browser storage instead of just returning empty. That unhandled error aborted the entire app before it could load, and because the failed link stayed in the address bar, reloading reproduced the identical crash every time — Safari eventually shows its own \"a problem repeatedly occurred\" page.",
      changes: [
        "Storage access during sign-in link handling no longer crashes the app if the browser blocks it; the login screen loads normally instead.",
        "A failed or already-used sign-in link is now cleared from the address bar automatically, so reloading doesn't repeat the same failure.",
        "Added a fallback error screen with a Reload button for any other unexpected startup failure, instead of a silent blank/white screen."
      ]
    },
    {
      introducedIn: "2026.07.18.1",
      title: "Farmstead now boosts empire-wide food income",
      why: "Farmstead's +50% food bonus (doubled again near an active Waterworks) was correctly applied to the per-tile yield you'd see when inspecting a farm tile, but the empire-wide food total shown on the food detail panel was computed by a separate formula that never accounted for Farmsteads at all, so building one didn't visibly move your food income.",
      changes: [
        "The food detail panel and the food rate shown in the resource ribbon now include Farmstead's food bonus, matching the per-tile yield."
      ]
    },
    {
      introducedIn: "2026.07.18.1",
      title: "Docks can no longer be bypassed by settling the land beside them",
      why: "Expanding across a dock is only supposed to let you claim the linked dock tile itself — you have to take the dock before pushing inland. A validation gap let empires (and the AI/barbarians most of all) settle the land tiles adjacent to an uncaptured linked dock, effectively teleporting past it.",
      changes: [
        "Dock-crossing expansion now only lands on the linked dock tile; the neighbouring land can no longer be claimed until the dock is captured. Attacks across docks are unchanged."
      ]
    },
    {
      introducedIn: "2026.07.16.7",
      title: "Display name updates now show immediately",
      why: "Saving a new display name sends a PLAYER_STYLE broadcast (to everyone, including you) followed by a self-only PLAYER_UPDATE. The client updated its internal state from PLAYER_STYLE but never re-rendered the screen for it, so the Display Name field and HUD stayed on the old name until some unrelated message happened to trigger a redraw — meanwhile other parts of the UI (like the Firebase-backed \"Signed in as\") could already show the new name, making it look like the change silently failed.",
      changes: [
        "The client now re-renders the HUD and auth overlay immediately when a PLAYER_STYLE update is about your own name or color, instead of waiting on a later message."
      ]
    },
    {
      introducedIn: "2026.07.16.6",
      title: "Diagnostic logging added for Survey Sweep floating markers",
      why: "A report that Survey Sweep's floating resource/town markers don't appear on the 3D map couldn't be confirmed from code review alone — the server-side ping generation, gateway routing, and client render sync all appear correctly wired and a regression test confirms ping generation works. Console logging at each stage will show exactly where pings stop flowing (or reveal a positioning bug) the next time the ability is used.",
      changes: [
        "Server logs how many tiles were scanned, how many carried a resource/town, and how many were filtered out as already-visible when Survey Sweep runs.",
        "Client logs the raw and parsed ping payload it receives, and (throttled to once per second) the marker count and computed scene position fed into the 3D render loop.",
        "All log lines are tagged [survey-sweep-debug] for easy filtering and removal once the root cause is found."
      ]
    },
    {
      introducedIn: "2026.07.16.5",
      title: "Waterworks food bonus doubled to +100%",
      why: "Waterworks was underperforming relative to its cost — a 50% boost within 10 tiles didn't justify the investment for most players. Doubling it to 100% makes water infrastructure a clearly impactful food multiplier.",
      changes: [
        "Waterworks now boosts farmstead food production by +100% (up from +50%) within a 10-tile radius."
      ]
    },
    {
      introducedIn: "2026.07.16.4",
      title: "Truces now block attacks, muster attacks, and observatory abilities",
      why: "Truces were tracked only in the gateway's social layer and never synced to the simulation, so every server-side \"is this target allied or truced\" check only ever saw alliances. A truce partner could still be attacked, muster-attacked, and targeted with Reveal Empire, Reveal Empire Stats, Aether Lance, Siphon, Airport Bombard, and Imperial Exchange Levy — the truce badge was cosmetic.",
      changes: [
        "Truce state now syncs to the simulation on accept/break and on natural expiry, the same way alliances already do.",
        "Attacks, muster attacks, and every ability listed above now correctly refuse to target a truce partner, matching alliance behavior."
      ]
    },
    {
      introducedIn: "2026.07.16.3",
      title: "AI empires stop re-proposing a support structure type the town already has",
      why: "A town below its overall support capacity doesn't mean it's missing THIS specific structure type — it might already have a granary and only need a market or bank. The AI's candidate selector didn't check for that, so it kept proposing (and getting rejected for) the same already-built structure type on repeat, every rejection-cooldown cycle, indefinitely, instead of falling through to the type it actually needed.",
      changes: [
        "The AI now skips any structure type the town's support tiles already have and proposes the genuinely missing type instead."
      ]
    },
    {
      introducedIn: "2026.07.16.2",
      title: "Tier 2 domain rebalance: Cogwork Foundries and stronger peers",
      why: "Frontier Bureau's only effect (+1 development capacity) duplicated its Tier 1 predecessor at triple the cost, and no domain in the game sped up economic structure construction. Scholastic Exchanges also carried a researchTimeMult effect that was never wired into any build/research timer, so it did nothing.",
      changes: [
        "Frontier Bureau is renamed Cogwork Foundries and now grants a 25% build-speed bonus to economic structures instead of +1 development capacity.",
        "Stone Curtain's frontier defense bonus increases from +15/1.1x to +20/1.2x.",
        "Iron Vanguard's attack bonuses vs. settled land and forts increase from 1.12x to 1.20x.",
        "Scholastic Exchanges drops its non-functional research-speed effect; its connected-town step bonus increases from +0.1 to +0.2.",
        "Crystal Network's reveal-upkeep discount increases from 15% to 20%, and its observatory range bonus increases from +6 to +10."
      ]
    },
    {
      introducedIn: "2026.07.16.1",
      title: "AI empires build economic structures reliably instead of stalling out",
      why: "The AI proposed markets/banks/granaries for any town below its support capacity without checking whether an open, already-settled neighboring tile actually existed to place the structure on (the runtime never builds these on the town tile itself). In production this meant ~99.9% of the AI's BUILD_ECONOMIC_STRUCTURE attempts were rejected, and each rejected attempt used up that turn's action instead of falling through to something the AI could actually do — leaving AI economies stalled even with gold to spend.",
      changes: [
        "The AI now checks for an open, correctly-assigned settled support tile before proposing a market, bank, or granary, so it stops repeatedly proposing builds the server was always going to reject.",
        "A rejected attack now goes on a brief cooldown instead of being immediately retried every tick — previously the AI could resubmit the same doomed attack roughly a dozen times while the earlier one was still resolving."
      ]
    },
    {
      introducedIn: "2026.07.15.5",
      title: "Muster flags now arm and fire attacks independently",
      why: "Queuing a second muster-fed attack while a first was still marching (or just fired and awaiting its result) reused a single global transit/deferred-attack slot, so the second attack overwrote the first's tracked state and the whole action queue stalled behind it — even though the server already funds and resolves each flag's attack independently.",
      changes: [
        "Each muster flag's marching timer and deferred attack are now tracked independently, keyed by the flag's own tile.",
        "Arming a muster transit no longer blocks the rest of the action queue — other targets (via other flags, or direct attacks/expands) keep processing while troops are still marching.",
        "The map supply-line overlay now shows a line for every active muster-fed attack at once instead of only the most recently queued one.",
        "Cancelling now clears every flag still marching, not just the most recently armed one."
      ]
    },
    {
      introducedIn: "2026.07.15.4", title: "Fixed muster flags rendering behind the ownership overlay on the 3D map", why: "Muster flag meshes (renderOrder 36) were opaque-only materials, so Four.js drew them during the opaque pass — before the ownership overlay (transparent, renderOrder 6-7) in the transparent pass. The overlay then painted on top, making flags appear to sit beneath the settled/frontier tint despite having a numerically higher renderOrder.", changes: ["Muster flag pole, pennant, spike, and soldier-dot meshes now use transparent: true, moving them into the transparent pass where their renderOrder of 36 correctly places them on top of the ownership overlay."]
    },
    {
      introducedIn: "2026.07.15.3", title: "Fixed truce/alliance offers to AI empires in seasonal games", why: "The 2026.07.11.1 fix aligned gateway social state AI names to \"AI N\" format, but the client's INIT payload still surfaced seasonal leaderboard names (e.g. \"Freja Sund\") in playerStyles and the leaderboard, so truce and alliance requests sent with those names still failed with \"target not found\".", changes: ["AI empire names in playerStyles and the leaderboard are now always \"AI N\", matching what the client sends in truce and alliance requests."]
    },
    {
      introducedIn: "2026.07.15.2",
      title: "Cancelling a structure build now refunds what you spent",
      why: "Cancelling a Fort, Siege Outpost, Observatory, or economic structure while it was still under construction (or mid-upgrade) deleted the in-progress structure but never gave back the gold, manpower, or strategic resources you paid to start it — that spend was simply gone.",
      changes: [
        "Cancelling a build or upgrade now refunds the exact gold, manpower, and strategic resource cost (iron, supply, crystal, etc.) that was spent to start it.",
        "Fort and Siege Outpost refunds use the tier that was actually being built, so a tech unlock partway through construction can't change what comes back.",
        "Cancelling a structure removal (not a build) is unaffected — removals were already free to start, so there is nothing to refund there."
      ]
    },
    {
      introducedIn: "2026.07.15.1",
      title: "Fixed alliance/truce search dropdown and target resolution",
      why: "The alliance/truce target search box listed AI empires that had never founded a settlement this season (only pre-registered, never active), the suggestion dropdown rewrote its options on nearly every HUD render — flickering or closing an open autocomplete popup while typing — and a request could target a name (like the default 'Nauticus' shown for a player who hasn't set a display name yet) that was never actually registered under that name for alliance/truce resolution, so the request always failed with 'target not found'.",
      changes: [
        "AI empires that haven't settled/founded an empire yet no longer appear as alliance/truce search suggestions; only AI with real activity (tiles, income, or tech) are offered.",
        "The suggestion dropdown now only rewrites its options when the list actually changes, instead of on every HUD render, fixing the flicker/disappearing popup while typing.",
        "A player who hasn't set a custom display name is now registered under the same cosmetic default name shown to others (e.g. 'Nauticus'), so alliance/truce requests targeting that name resolve correctly instead of failing."
      ]
    },
    // Older entries (2026.07.13.8 and earlier) trimmed: the release-day
    // window test only keeps entries within the latest 6 days of
    // LATEST_CLIENT_CHANGELOG.version -- see git history for the full changelog.
  ]
};
