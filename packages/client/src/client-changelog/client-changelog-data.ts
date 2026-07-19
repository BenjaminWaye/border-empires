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
  version: "2026.07.19.4",
  title: "What's New",
  summary: "The Settings panel now has a \"Download Disconnect History\" button for handing us evidence if you're getting reconnected a lot. Also includes the map remembering your last-viewed location on reconnect, the fix for forts/observatories/siege outposts getting visually stuck at \"Remaining 00:00\", the AI-owned tile display-name fix, and the Town Captured popup's gold production stat.",
  entries: [
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
    {
      introducedIn: "2026.07.13.8",
      title: "Barbarian hordes multiply more slowly",
      why: "Barbarians were multiplying too quickly, growing to 483 tiles on a recent season — far beyond the intended population cap. Each successful capture of a player tile accumulated progress, and at 3 progress they spawned a new barbarian tile. Now they need 5, slowing their growth by about 40%.",
      changes: [
        "Barbarian multiply threshold raised from 3 to 5 — they now need 5 captured player tiles before spawning an extra barbarian instead of 3."
      ]
    },
    {
      introducedIn: "2026.07.13.7",
      title: "Fixed AI empires spamming rejected fort builds",
      why: "An AI empire whose Build Fort proposal was rejected by the server had no memory of the rejection, so it re-proposed the exact same build on the very next tick — over and over, burning planner cycles instead of doing anything productive.",
      changes: [
        "A rejected build now puts that decision on a 10-second cooldown for that empire, so the planner picks a different action (or waits) instead of immediately retrying the same rejected build."
      ]
    },
    {
      introducedIn: "2026.07.13.6",
      title: "Fixed AI opponents going idle for extended periods",
      why: "An AI empire under continuous attack could cut to the front of the turn queue every tick with no fairness limit, occupying every turn indefinitely and leaving other AI empires unable to act — including ones with large gold reserves and clear expansion opportunities.",
      changes: [
        "An AI empire that hasn't taken a turn in 2 seconds is now guaranteed to go next, even ahead of one under active attack."
      ]
    },
    {
      introducedIn: "2026.07.13.5",
      title: "Placement preview highlights the structures that will actually benefit",
      why: "The Waterworks/Foundry placement radius preview showed the affected area, but not which of your existing structures inside it would actually receive the bonus — you had to know the mechanic and count tiles yourself.",
      changes: [
        "While placing a Foundry, every active Mine you own within its radius now highlights green.",
        "While placing a Waterworks, every active Farmstead you own within its radius now highlights green.",
        "Works in both the flat map and 3D view."
      ]
    },
    {
      introducedIn: "2026.07.13.4",
      title: "Building placement mode for Waterworks and Foundry",
      why: "Placing a radius-based structure like Waterworks or Foundry was a blind commitment — you tapped Build and hoped the tile you picked was valid, with no visibility into the actual affected area or whether the location was strategically optimal.",
      changes: [
        "Tapping Build on a Waterworks or Foundry now enters placement mode instead of immediately building — a radius preview appears on the map showing the affected area.",
        "Click any valid tile to move the building there; the preview updates in real time with the correct radius for each structure.",
        "Valid placements show the structure's color; invalid placements (wrong surface type, conflicts, missing tech) show red.",
        "Confirm to finalize, press Escape or right-click to cancel — no commitment until you're satisfied."
      ]
    },
    {
      introducedIn: "2026.07.13.3",
      title: "Town Captured popup now fires for neutral towns too",
      why: "The popup only fired when the tile's previous owner was a real, different player id, to avoid firing on first-time map reveals. That over-excluded a legitimate case: claiming an already-known but unowned (neutral) town peacefully via Expand — e.g. one that decayed back to neutral, or a vacated barbarian town — never showed the popup at all.",
      changes: [
        "Claiming a previously-known neutral town via Expand now shows the Town Captured popup, not just combat captures from another empire.",
        "First-time map reveals (a tile you've never seen before) still correctly don't trigger the popup, since there's no earlier state to compare against."
      ]
    },
    {
      introducedIn: "2026.07.13.2",
      title: "Town Captured popup now fires for destroyed settlements too",
      why: "The Town Captured popup only fired when the captured tile still had town data afterward. Combat destroys a Settlement-tier town on capture — its population disperses instead of joining the empire — so the tile legitimately ends up with no town, and the popup silently never showed for what's usually the majority of captures.",
      changes: [
        "Capturing a Settlement-tier town via combat now shows a 'Settlement Destroyed' variant of the popup using the town's pre-capture name, tier, and population, instead of showing nothing.",
        "The destroyed variant explains the population dispersed rather than joining your empire, and drops the Manpower Cap/Regen stats since nothing was actually gained.",
        "Towns that survive capture (Town tier and above) keep showing the original 'Town Captured' popup with full stats."
      ]
    },
    {
      introducedIn: "2026.07.13.1",
      title: "Town Captured popup",
      why: "Capturing a shard site already celebrated the moment with a popup, but capturing a town — a much bigger empire event — was silent, easy to miss in the middle of a fight, and gave no quick way to jump back to the new town.",
      changes: [
        "Capturing an enemy or barbarian town now shows a hero popup with town art, its name, coordinates, and tier.",
        "The popup shows the town's population, the Manpower Cap and Manpower Regen it will add to your empire, and a note that full production resumes once it's settled and supported.",
        "A Jump to Town button recenters the map on the captured town in case it's off-screen."
      ]
    },
    {
      introducedIn: "2026.07.13.0",
      title: "Supply Raiding reworked into Dewildernisation — bonus vs barbarians",
      why: "The original Supply Raiding domain boosted outpost deployment speed and reduced outpost supply upkeep, which pigeonholed it into a niche siege-outpost role that felt disconnected from its raiding theme. The domain now lives up to its name as a focused barbarian offensive bonus.",
      changes: [
        "Supply Raiding has been renamed to Dewildernisation — a concerted imperial campaign to push back the wilds.",
        "Iron Bastions has been renamed to Dwarf Kingdom.",
        "Dewildernisation now grants +50% attack power against barbarian tiles instead of the old outpost deployment and upkeep bonuses."
      ]
    },
    // Older entries (2026.07.12.7 and earlier) trimmed: the release-day
    // window test only keeps entries within the latest 6 days of
    // LATEST_CLIENT_CHANGELOG.version -- see git history for the full changelog.
  ]
};
