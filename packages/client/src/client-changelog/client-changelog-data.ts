// Changelog entry data only, split out from client-changelog.ts (rendering/
// visibility) to keep that file under the 500-line cap. Entries are unordered —
// client-changelog.ts sorts by createdAt. Move old entries to
// client-changelog-data-earlier.ts when this file approaches the cap.
// The "keeps only the latest week" test drops any entry whose createdAt is
// more than 6 days before the newest entry -- when a new entry's timestamp
// ages an earlier-N file's entries out of that window, remove that file's
// import and spread below (the .ts file itself can stay as a historical
// record, just unreferenced) rather than leaving a stale import.
import { CLIENT_CHANGELOG_ENTRIES_EARLIER } from "./client-changelog-data-earlier.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_2 } from "./client-changelog-data-earlier-2.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_3 } from "./client-changelog-data-earlier-3.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_4 } from "./client-changelog-data-earlier-4.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_5 } from "./client-changelog-data-earlier-5.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_7 } from "./client-changelog-data-earlier-7.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_10 } from "./client-changelog-data-earlier-10.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_11 } from "./client-changelog-data-earlier-11.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_14 } from "./client-changelog-data-earlier-14.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_16 } from "./client-changelog-data-earlier-16.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_17 } from "./client-changelog-data-earlier-17.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_18 } from "./client-changelog-data-earlier-18.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_20 } from "./client-changelog-data-earlier-20.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_27 } from "./client-changelog-data-earlier-27.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_29 } from "./client-changelog-data-earlier-29.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_33 } from "./client-changelog-data-earlier-33.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_34 } from "./client-changelog-data-earlier-34.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_36 } from "./client-changelog-data-earlier-36.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_37 } from "./client-changelog-data-earlier-37.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_52 } from "./client-changelog-data-earlier-52.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_55 } from "./client-changelog-data-earlier-55.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_56 } from "./client-changelog-data-earlier-56.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_58 } from "./client-changelog-data-earlier-58.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_61 } from "./client-changelog-data-earlier-61.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_62 } from "./client-changelog-data-earlier-62.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_63 } from "./client-changelog-data-earlier-63.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_64 } from "./client-changelog-data-earlier-64.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_67 } from "./client-changelog-data-earlier-67.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_68 } from "./client-changelog-data-earlier-68.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_69 } from "./client-changelog-data-earlier-69.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_72 } from "./client-changelog-data-earlier-72.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_77 } from "./client-changelog-data-earlier-77.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_79 } from "./client-changelog-data-earlier-79.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_83 } from "./client-changelog-data-earlier-83.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_84 } from "./client-changelog-data-earlier-84.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_85 } from "./client-changelog-data-earlier-85.js";
import { CLIENT_CHANGELOG_ENTRIES_PARALLEL_MUSTER } from "./client-changelog-parallel-muster.js";
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
    createdAt: 1789839014183, // frozen, 1ms after the prior newest entry
    introducedIn: "2026.09.19.2",
    title: "Airport bombardment now reliably clears mustering flags",
    why: "Bombing a tile cleared its ownership through the normal tile update every client receives, but the mustering flag on that tile was only ever cleared through a separate best-effort broadcast that could be missed — leaving a stuck muster flag visible on a tile that had already lost its owner, with no way to clear it.",
    changes: [
      "Bombarding a tile with a staged muster flag now clears that flag through the same reliable update that clears ownership, instead of a separate message that could be dropped"
    ]
  },
  {
    createdAt: 1789852188214, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.19.01",
    title: "Mintworks descriptions now show all gold bonuses",
    why: "The Mintworks description highlighted the town production multiplier but omitted its flat base-income bonus and one-time completion reward.",
    changes: ["Mintworks descriptions now show +1 base gold income, +10% town gold production per copy, and +10 instant gold on completion"]
  },
  { createdAt: 1789766351673, introducedIn: "2026.09.18.7", title: "Waystation captures now keep their reward", why: "Expanding onto a Waystation briefly activated it on the server, but the capture-complete tile update could then resend the older inactive tile shape, hiding the reward popup and making the site look like it did nothing.", changes: ["Frontier expansion over a Waystation now sends the activated Waystation result in the final capture update, so the reward and popup persist correctly"] },
  {
    createdAt: 1789848292584, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.19.1",
    title: "AI actions now recover from unreachable beacons and full FOOD slots",
    why: "AI action planning now checks relay-beacon settlement reach before issuing SETTLE and remembers rejected action targets until the relevant world state changes, so live empires no longer loop on commands the runtime will reject.",
    changes: [
      "Relay-beacon settlement uses the same reach and town/dock exemption as the runtime",
      "A rejected FOOD-capacity build now prefers reversible FOOD-slot relief and explains when no safe relief exists"
    ]
  },
  {
    createdAt: 1789807901404, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.19.1",
    title: "Added an Email Notifications settings page",
    why: "Every gameplay email alert (alliance requests, alliance breaks, truce offers, attacks, Aether Purges, new season) used to fire unconditionally for any account with a bound email, with no way to turn individual categories off.",
    changes: [
      "New \"Email Notifications\" settings page lets you opt out of each gameplay email category individually",
      "Every category defaults to on, matching the previous always-on behavior, until you turn one off"
    ]
  },
  {
    createdAt: 1789766918101, // frozen, 1ms after "Duke title for planet-holding empires" (the previous newest)
    introducedIn: "2026.09.18.10",
    title: "Fixed the Observatory dossier showing the wrong name and manpower cap",
    why: "Revealing a rival empire with an Observatory showed their raw account ID instead of their display name, and showed their manpower cap as equal to their current manpower (so it always read as \"full\"). The simulation server doesn't know player display names -- those only exist in the gateway's profile store -- so it was falling back to the raw ID, and the dossier builder was echoing current manpower back as the cap instead of reading the real cap.",
    changes: [
      "The Observatory dossier now shows the revealed empire's real display name, resolved the same way the map and leaderboard already do",
      "The Observatory dossier's manpower stat now shows the empire's real manpower cap instead of repeating their current manpower"
    ]
  },
  {
    createdAt: 1789766918100, // frozen, 1ms after "AI empires can push relay beacons into fresh fog again" (the previous newest)
    introducedIn: "2026.09.18.9",
    title: "Duke title for planet-holding empires",
    why: "Owning a galaxy Planet is a persistent, cross-season honor that wasn't shown anywhere outside the profile's Galactic Holdings list.",
    changes: [
      "A player who currently owns a galaxy Planet is now shown as \"Duke\": a royal-purple name tint + crown badge, applied everywhere names render (leaderboard, tile-owner labels, lobby roster) and in the player profile"
    ]
  },
  {
    createdAt: 1789766918098, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.18.8",
    title: "AI empires can push relay beacons into fresh fog again",
    why: "A mature AI empire could have free FOOD slots and plenty of frontier land, but still stop growing once every visible nearby prize was already claimed. The relay-beacon planner rejected some otherwise useful launch sites just because the beacon tile itself was already inside current reach, even when building there would reveal unexplored land beyond the visible border.",
    changes: [
      "AI relay beacons can now use already-held reach as a launch point when the site opens genuinely unexplored land",
      "The anti-overlap guard still blocks redundant beacons that only reach already-known plain scraps"
    ]
  },
  {
    createdAt: 1789763248832, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.18.7",
    title: "Fixed: Deadliest Tile and Longest Road missing from the end-of-season Misc tab for a season that clearly had both",
    why: "Both stats were computed correctly and broadcast live during the game -- the live season summary always had the real data. But the function that builds the permanent archived record for a finished season (used once the next season starts and you're looking back at the last one) copied over the winner, galaxy tiers, and a few other fields one by one and simply never referenced seasonStats, so mostDeadlyTile/longestRoad were silently dropped from every archived season, every time, regardless of how much fighting happened.",
    changes: [
      "A finished season's archived record now keeps its Deadliest Tile and Longest Road stats, so the Misc tab shows up correctly when reviewing a past season instead of only during the live post-victory window"
    ]
  },
  {
    createdAt: 1789749968740, // frozen, newer than every existing entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.18.6",
    title: "More land, more detailed coastlines on Continents maps",
    why: "The tectonic-plate continent generator (introduced this same branch) still read as too much open water, and its coastlines were smooth almost everywhere -- nearly all of the coastline-noise weight sat on continent-scale octaves (a third to half the map wide), leaving barely any weight on the tile-scale detail that makes a coastline look like it has real bays and inlets instead of one long curve.",
    changes: [
      "Continents-style maps now target ~45% land instead of ~37%",
      "Coastlines carry visible detail down to single-tile notches everywhere, not just in occasional fjord/archipelago zones"
    ]
  },
  {
    createdAt: 1789731957252, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.18.5",
    title: "A welcome letter for new Dukes",
    why: "Winning your first Sector campaign dropped you straight into Space View with no ceremony -- your new Planet had no name and no acknowledgment of what you'd just done.",
    changes: [
      "First visit to Space View with an unnamed Planet now asks you to name it",
      "Naming your Planet is followed by a decree letter from the Imperial Court welcoming you as Duke of it"
    ]
  },
  {
    createdAt: 1789656367100, // frozen, 1ms after the "New seasons now require a player vote to start" entry (the previous newest)
    introducedIn: "2026.09.18.4",
    title: "Waystations now glow while unclaimed and notify you if one activates while you're away",
    why: "A waystation's lens used to glow bright once activated and sit dim while dormant -- backwards from what players expect (a dim beacon reads as \"already dealt with\", not \"come claim me\"). Separately, activation can trigger passively (auto-settling onto a dormant waystation tile), and the popup explaining what it granted only ever fired for players connected at that exact moment -- anyone who logged back in afterward, on any device, just found an already-activated waystation with no explanation of what they got.",
    changes: [
      "Waystation lenses now glow bright while dormant (in both the 2D and 3D renderers, plus the minimap) and settle to a dim glow once activated",
      "Logging in or reconnecting now shows the activation popup for any of your waystations that activated while you were away, the same popup you'd see live -- and it now follows your account across devices instead of only the browser that was open at the time"
    ]
  },
  {
    createdAt: 1789656367099, // frozen, 1ms after the "Next season's map will be continents" entry (the previous newest)
    introducedIn: "2026.09.18.3",
    title: "New seasons now require a player vote to start",
    why: "A season could auto-start on its own an hour after the previous one ended, even if players hadn't voted -- skipping past the old season's scoreboard before anyone chose to move on.",
    changes: [
      "Removed the automatic season-start timer -- a new season now only begins once players vote for it",
      "Lowered the votes needed to start a new season from 5 to 2"
    ]
  },
  {
    createdAt: 1789656367098, // frozen, 1ms after the "Aether Wall blocks now say so" entry (the previous newest)
    introducedIn: "2026.09.18.2",
    title: "Next season's map will be continents",
    why: "Production's first season was seeded as island-heavy. The next season rollover switches the map style to continents.",
    changes: [
      "The next season, once started, will generate a continents-style map instead of islands"
    ]
  },
  {
    createdAt: 1789656367097, // frozen, 1ms after the "Fixed the CRYSTAL economy panel undercounting Aether Towers" entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.18.1",
    title: "Aether Wall blocks now say so",
    why: "Trying to expand across a border sealed by an Aether Wall showed the same generic message used for spawn-protection blocks (\"that empire is still under spawn protection\"), which was misleading when no spawn shield was involved.",
    changes: [
      "Attacking or expanding across a crossing sealed by an Aether Wall now reports \"that border is sealed by an Aether Wall\" instead of the spawn-protection message"
    ]
  },
  {
    createdAt: 1789656367096, // frozen, 1ms after the "Removed the \"Waypoint halted\" activity feed message" entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.17.10",
    title: "Fixed the CRYSTAL economy panel undercounting Aether Towers",
    why: "The \"Occupied by\" breakdown under the CRYSTAL resource panel only read a tile's fort, siege outpost, and economic-structure fields when tallying who was using a slot. Aether Towers (Observatories) are tracked as their own separate tile field, so every Aether Tower's CRYSTAL slot was invisible to this breakdown -- the panel could show a used/total ratio like 69/55 while the visible per-building list only summed to 14.",
    changes: [
      "The CRYSTAL \"Occupied by\" list now includes Aether Towers, so the visible breakdown adds up to the total slots used"
    ]
  },
  {
    createdAt: 1789656367095, // frozen, 1ms after the "Clickable player names now show an underline" entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.17.9",
    title: "Removed the \"Waypoint halted\" activity feed message",
    why: "A stalled waypoint already turns its flag into a cancel-me state (NO_PATH), so the extra feed line just duplicated that signal and cluttered the feed with information players didn't need.",
    changes: [
      "A halted waypoint no longer posts a message to the activity feed",
      "The waypoint flag itself still shows the halted/cancellable state"
    ]
  },
  {
    createdAt: 1789656367093, // frozen, one past the previous newest entry
    introducedIn: "2026.09.17.8",
    title: "Clickable player names now show an underline",
    why: "Player names that open a profile card (in tile descriptions, the leaderboard, etc.) looked like plain text, so the fact they were clickable wasn't discoverable.",
    changes: [
      "Clickable player names now show a dotted underline to make it clear you can click them to open the player's profile card"
    ]
  },
  {
    createdAt: 1789549757915, // frozen, 1ms after the "Fixed the server stall..." entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.17.2",
    title: "Barbarian camps start larger",
    why: "Barbarian starting camps were seeded with only 20 tiles, making them a trivially quick clear for most empires early on. Bumping the seed size gives barbarians a bit more early staying power without changing their separately-capped growth ceiling.",
    changes: [
      "Barbarian camps now start with up to 30 tiles instead of 20"
    ]
  },
  {
    createdAt: 1789549757914, // frozen, 1ms after the "Stage Muster per season" entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.17.1",
    title: "Fixed the server stall that blocked logins on 2026-09-17",
    why: "A live CPU profile of the game server showed roughly 40% of all its work going into re-computing one player's auto-settle queue (which frontier tiles qualify for free settling) from scratch on every state update and three times per 30-second automation tick -- about 10,000 town-support ring scans each time, to produce a 2-entry list. That steady load exhausted the server's shared-CPU budget, the host throttled it to a fraction of a core, every tick took seconds, and logins timed out at \"Loading your world state\". The queue was already cached for AI empires, but not for human players, on the assumption that humans trigger it rarely -- it is actually driven by state updates, not by settling.",
    changes: [
      "The auto-settle queue is now cached for every player and only recomputed when that player's tiles actually change (at most once per 5 seconds, and always within 60 seconds), instead of on every state update",
      "In practice the queue you see can lag a real change by up to a few seconds; settling itself is unchanged"
    ]
  },
  {
    createdAt: 1789549757913, // frozen, 1ms after the "New spawns land a safe distance from towns" entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.16.8",
    title: "Stage Muster now unlocks on barbarian contact and remembers across devices, per season",
    why: "The Stage Muster tile action stays hidden until a player has met someone worth attacking, but the unlock only counted rival empires -- a player whose nearest neighbour was a barbarian camp had no way to muster against it -- and it was only remembered in the browser, so a data clear or a second device re-locked it until the next enemy sighting.",
    changes: [
      "Seeing a barbarian-held tile now unlocks Stage Muster and the First Contact tip, the same as seeing a rival empire",
      "The unlock is saved to your account on the server (alongside dismissed hints and the onboarding checklist), so it follows you across browsers and devices",
      "The unlock is scoped to the current season -- a fresh season is a new map with no enemies met yet, so it re-locks until you meet one again, same as a brand-new player"
    ]
  },
  {
    createdAt: 1789549757912, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.16.07",
    title: "New spawns now land a safe distance from the nearest town",
    why: "A new player's spawn tile could land right next to an existing town, letting them settle it within their first couple of moves instead of exploring their surroundings first.",
    changes: [
      "New spawns (including rally spawns) now keep at least 5 tiles of distance from the nearest town, so joining a game no longer hands you an instant settle target"
    ]
  },
  {
    createdAt: 1789549757911, // frozen, 1ms after the "Cancel All Waypoints" entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.16.6",
    title: "Watchtower and Waystation sites now actually reach your screen",
    why: "Even after the previous fix made Watchtower and Waystation sites survive into a season's starting map, two more field-whitelist gaps of the exact same shape kept them invisible in practice: the sim's own boot/restart hydration path silently dropped both fields when reloading tiles from a checkpoint (so a restart -- including a routine deploy -- could wipe them right back out), and the login/reconnect map export never included them in the payload sent to your client in the first place, unlike every sibling site type (docks, natural wonders, shard sites, etc.).",
    changes: [
      "Fixed sim checkpoint/restart hydration so Watchtower and Waystation sites survive every restart, not just initial season generation",
      "Fixed the login and reconnect map export so Watchtower and Waystation sites are actually sent to your client instead of being silently stripped"
    ]
  },
  {
    createdAt: 1789549757910, // frozen, 1ms after the newest existing entry ("warty terrain fix") -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.16.4",
    title: "Added a Cancel All Waypoints action to the tile menu",
    why: "A queued waypoint targeting a tile outside your current view -- for example one set by an accidental click just before you signed in -- had no way to be cancelled, since the only cancel option required selecting that exact tile.",
    changes: [
      "Opening the action menu on any of your tiles now offers \"Cancel All Waypoints\" whenever you have any queued, letting you clear the whole list without needing to find the specific tile a waypoint targets"
    ]
  },
  {
    createdAt: 1789549757909, // frozen, 1ms after the newest existing entry ("steampunk visual pass") -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.16.3",
    title: "Toned down the 3D grass/sand/tundra surface bump so it no longer looks warty",
    why: "A recent pass pushing the 3D terrain's painterly art style further sharpened the ground's normal-map strength, its per-material normal scale, and the spread of its roughness values all at once. Stacked together, those three changes made the low-frequency height noise that shapes the surface read as a dense field of small pits and bumps -- especially visible on grass and sand -- instead of a subtle painterly texture.",
    changes: [
      "Lowered the terrain normal-map bake strength and the heightfield material's normal scale back toward their pre-pass values",
      "Narrowed the roughness contrast between surface pits and ridges back toward its pre-pass range",
      "2D canvas fallback renderer is unaffected -- it has no equivalent per-pixel bump/roughness noise system"
    ]
  },
  {
    createdAt: 1789549757907, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.16.1",
    title: "Hills read as gentle, connected highland rather than a stamped pointy peak",
    why: "Hill tiles used to render as one or three sharply pointed mounds, and two adjacent hill tiles never actually joined up -- the connecting bridge between them tapered to nothing just short of the shared edge, so a hill patch or ridge always looked like separate stamped bumps with thin gaps between them. Separately, the ownership tint draped over a hill used a coarser mesh than the hill's own surface, letting a sliver of the water/fog colour underneath show through as a light-blue glitch.",
    changes: [
      "Hills are now a broad, irregular, almost-flat raised mound with 3 small, barely-noticeable points, sloping gently down to ground level at the tile edge",
      "Two hill tiles that are cardinal neighbours now visibly merge into one connected landmass instead of leaving a gap at their shared border",
      "Fixed a light-blue glitch in the settled-tile ownership tint where it drapes over a hill"
    ]
  },
  {
    createdAt: 1789549757906, // frozen, 1ms after the newest existing entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.16.04",
    title: "Fixed: \"settle + build\" settled the tile but never started the building",
    why: "Queueing a building on your own frontier ground (\"settle + build Relay Beacon\" and every other chained build) hands the follow-up build to the server, so it still completes if you disconnect mid-settle. But the server only ever ran that queue while you were offline -- the whole point being that your own client runs it while you're connected. The follow-up build was written into a queue your client can't see and the server had stood down from, so for anyone who simply stayed in the game and watched, it sat there forever: the tile settled, and nothing was ever built on it.",
    changes: [
      "\"Settle + build\" now actually starts the building once settling finishes while you're still connected, instead of settling the tile and silently stopping there",
      "This covers every chained build on owned frontier ground, including the one queued behind an in-flight expansion -- Relay Beacon was just the most common way to hit it",
      "A queued follow-up build no longer gets stuck behind other things in your build queue, and if all your build slots are busy when settling finishes it now starts as soon as a slot frees instead of being dropped",
      "Foundry and Waterworks are unchanged: those still ask you to pick the exact tile yourself, so they stay client-driven",
      "Fixed a related leak where each \"settle + build\" left a dead entry occupying one of your queue slots (and holding onto its reserved manpower) until you reconnected"
    ]
  },
  {
    createdAt: 1789549757905, // frozen, 1ms after the newest existing entry
    introducedIn: "2026.09.16.03",
    title: "Watchtower and Waystation sites now actually appear in new seasons",
    why: "The season worldgen pipeline correctly placed Watchtower and Waystation sites on the map, but a field-whitelist step that copies each generated tile into the season's persisted starting state never included those two fields alongside similar site types like docks and natural wonders, so every placed site was silently dropped before the season ever went live. This affected every season generated so far -- players who never found a Watchtower or Waystation weren't missing them by chance, the sites were never actually there.",
    changes: [
      "Fixed the season worldgen pipeline so Watchtower and Waystation sites placed by the generator now survive into the live map",
      "Only affects seasons generated after this ships -- the currently running season's map is unchanged"
    ]
  },
  {
    createdAt: 1789549757904, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.16.02",
    title: "Fixed: owned frontier ground stuck with no reach and no path back after a server restart",
    why: "The persistent reach border isn't saved to disk -- it's rebuilt at boot from your towns/outposts/docks currently active right now, replaying the same contest a live anchor activation uses. A live empire's border grows past those anchors' base radius over a session (EXPAND pushes it outward tile by tile), and that accumulated growth isn't anchor geometry, so a restart's replay can't reproduce it. A tile you still owned but that sat outside every current anchor's disk came back from a restart with no reach and, because nothing ever re-evaluates an already-owned tile's coverage outside of a live anchor loss, no way to ever resolve on its own -- it just sat there permanently, reading as if it belonged to someone else.",
    changes: [
      "After a restart, an owned frontier tile the reach border doesn't currently cover now starts the same out-of-reach countdown a live anchor loss would give it, instead of sitting in permanent limbo -- it resolves within that window by regaining reach (if an anchor still covers it once re-evaluated) or reverting to neutral ground, matching how undefended frontier is meant to behave everywhere else",
      "This never grants reach outright and never touches ground a rival's live reach is already contesting, so it can't resurrect the earlier reach/ownership mismatch bug the boot-time border contest exists to prevent"
    ]
  },
  {
    createdAt: 1789541688935, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.16.01",
    title: "Fixed: attacking an enemy's frontier tile no longer shows the claim sweep over still-enemy-colored ground",
    why: "Instant-capturing an undefended frontier tile reuses EXPAND's \"becoming mine\" plate sweep in the 3D renderer. That looks right for a real EXPAND target, which has no owner tint to begin with, but an ATTACK on an enemy's frontier tile keeps that enemy's color tinting the tile the whole time -- ownerId only actually changes once the server resolves the capture. The sweep ended up animating on top of ground that never visually went neutral first, instead of the intended neutral-then-mine transition.",
    changes: [
      "The 3D map now hides a frontier tile's owner tint for the duration of an ATTACK claim against it (this client's own manual attack or a muster flag's auto-fire), so the target reads as neutral ground while the claim-plate sweep fills it in with your color, matching a real EXPAND target",
      "The 2D renderer never had this per-tile sweep animation (it only shows the \"Capturing Territory...\" progress banner), so it had no equivalent visual mismatch to fix"
    ]
  },
  {
    createdAt: 1789417055105, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.15.03",
    title: "Waystation activation popup now has hero art",
    why: "The Waystation activation reward popup was plain text on a dark panel -- eyebrow label, coordinates, one line of copy -- despite its own PR description claiming it was visually modeled on the Town Captured popup, which has a hand-illustrated skyline hero. That gap was easy to miss because nothing in the code or the popup itself called it out.",
    changes: [
      "Activating a Waystation now shows a hero illustration of the frontier rig (mast, glowing lens, roofed shelter, crates) above the reward text, matching the Town Captured popup's visual treatment",
      "The reward copy now reads as a narrative sentence (e.g. naming the actual town a Population burst moved into) followed by a bold \"Modifiers\" line with the concrete effect",
      "The Population reward now offers a \"Jump to Town\" button, and the Tech reward's \"Unlocked: <name>\" line is now clickable and opens that tech's detail panel"
    ]
  },
  {
    createdAt: 1789417055104, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.08",
    title: "Siege Tower and Dread Tower beams open the fight by taking out a defender",
    why: "The siege tower's aether lens already swung to track and beam an ongoing battle, but the beam never appeared to do anything -- marines fell purely on their own combat-resolved schedule with no visual link to the tower supposedly firing on them. This ties the two together: when a real Siege Tower or Dread Tower is beaming a tile, the beam now strikes down a defender right as combat starts, opening the fight.",
    changes: [
      "While a Siege Tower or Dread Tower is beaming a battle, its lance now strikes an actual defending unit combat resolution already scheduled to fall, right as the fight begins -- this attributes an existing casualty to the tower and moves only that one unit's own visual death timing up to the start of the fight; it never changes who wins, who dies, or the units' own combat rolls",
      "No change when no siege tower is present, or when the tower is aimed at a different battle -- the beam stays purely decorative in that case, as before"
    ]
  },
  {
    createdAt: 1789417055103, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.07",
    title: "Battles open with a blue-violet opening strike",
    why: "A squad's approach march used to lead straight into the firefight with no beat marking the transition, so combat felt like it just started rather than being kicked off by anything. A single lance now drops onto the tile right as the approach ends, giving the clash a clear opening shot before the marines' own empire-colored bolts take over.",
    changes: [
      "A blue-violet lance now strikes down onto a battle tile in the last moment before a squad's firefight begins, landing right as combat commences",
      "This opening strike is separate from the empire-colored bolts marines trade during the fight itself -- it's a one-time cosmetic beat, not a new combat mechanic"
    ]
  },
  {
    createdAt: 1789417055102, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.06",
    title: "Siege towers rise as towering aether artillery",
    why: "The upgraded siege variants (Siege Tower and its Dread Tower successor) shared the Siege Battery's compact carriage, so a max-tier siege engine looked like a planted cannon instead of the looming war machine its stats describe. They're now distinct towers: a heavy black-iron lattice braced on stabilizer legs, one enormous glowing aether lens in a brass gimbal, and a cyan-violet beam that swings down at the latest ongoing battle.",
    changes: [
      "Siege Tower and Dread Tower now render as tall black-iron towers with a huge glowing aether lens instead of the Siege Battery's low cannon carriage",
      "Each tower's lens swings to track the most recently started ongoing battle, firing a beam that fades in while the fight is live and dims the moment it ends",
      "New \"Siege Tower Aim\" setting in the Gameplay settings lets you choose between aiming just the aether lens or rotating the whole tower toward the battle"
    ]
  },
  {
    createdAt: 1789417055101, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.15.02",
    title: "Waystations now grant one random reward instead of all four at once",
    why: "Activating a Waystation granted every one of its four effects (map reveal, population burst, free tech, resource slot) simultaneously, every time -- a guaranteed grab-bag rather than a reward with any variance. Waystations are common enough (~1 per 400 tiles) that this made each activation feel like a checklist instead of a discovery.",
    changes: [
      "Expanding onto a Waystation now grants exactly ONE of the four rewards, chosen at random, instead of all four at once",
      "The map-reveal reward now centers on the nearest town within range (any owner) instead of the Waystation's own tile, so it points you at something worth knowing about -- falls back to revealing around the Waystation itself if no town is nearby",
      "The free-tech reward now grants a random tier-1 tech you don't already own, instead of always granting the same fixed tech",
      "The resource-slot reward now adds its +1 slot to whichever of Food/Titanium/Crystal/Umbrite your empire currently has the fewest slots of, instead of bumping all four at once",
      "A new popup now shows exactly which reward you received when you activate a Waystation"
    ]
  },
  {
    createdAt: 1789417055100, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.15.01",
    title: "Fixed a false-positive fatal-error screen on some map tile clicks",
    why: "Clicking between location tiles quickly could interrupt the location's one-shot sound effect mid-play, which browsers report as a harmless rejected play() promise. That rejection wasn't caught, so it tripped the app's global error guard and showed the full-screen \"Border Empires hit a problem loading\" reload overlay even though nothing was actually broken.",
    changes: [
      "A rapid location-tile theme change no longer triggers the fatal \"hit a problem loading\" reload screen"
    ]
  },
  {
    createdAt: 1789549757915, // frozen, 1ms after the "Fixed the server stall..." entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.15.01",
    title: "Barbarian tiles (\"The Bleed\") now show a Voidcrystal Colossus instead of a skull marker, with a real battle when it fights",
    why: "The 3D map's barbarian-territory marker was a plain procedural skull-on-a-pole icon, and a routine frontier capture popped instantly with no transition at all -- and when the Bleed fought over a settled tile (winning or losing), there was no visual for the fight itself. It's replaced with a sculpted Voidcrystal Colossus unit that reacts to territory changing tile-by-tile (there's no server-side \"barbarian unit\" to animate directly, so this is inferred client-side from tile-ownership changes and the real combat broadcast): every capture walks to the new tile first, then fights in place there only when it was actually a fight (a settled tile), with a defender marine squad firing back and dying one by one on a win. Player-facing text now calls this faction \"The Bleed\" instead of \"Barbarians\" -- internal identifiers (ownerId, code, file names) are unchanged.",
    changes: [
      "True-3D renderer: every Bleed-owned tile shows a Voidcrystal Colossus model. Capturing a settled (town/structure) tile walks to that tile first, then plays the model's real Attack animation in place while a defender marine squad fires laser bolts back and dies one at a time as the Bleed wins; capturing frontier/neutral land skips the fight and just walks there. A standing colossus holds a still pose -- no idle sway",
      "True-3D renderer: the Bleed can also LOSE a fight -- either attacking a defended tile and failing, or being the one defeated by a player -- in which case the colossus appears at the fought-over tile, its marine opponents hold the line, and it dissolves into a puff of blue smoke instead of surviving to stand there",
      "True-3D renderer: a Bleed tile eating neutral or frontier land (including another player's unsettled frontier tile, treated the same as bare wilderness) now fades its tile tint in over the capture instead of popping to the new color instantly",
      "2D canvas renderer (accessibility fallback): the barbarian skull icon is replaced with a matching crystalline-colossus glyph; this path does not animate captures, battles, or tile-tint transitions the way the 3D renderer does, since it has no per-frame state to track a marker's movement or a fight across tiles",
      "Player-facing text (tile owner labels, alerts, tech copy, the discovery tip) now says \"The Bleed\"/\"Bleed\" instead of \"Barbarians\"/\"barbarian\""
    ]
  },
  {
    createdAt: 1789375785264, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.14.02",
    title: "The main game HUD got a steampunk-futuristic visual pass -- brass, copper, riveted panels",
    why: "The core HUD chrome (login screen, panel frames, buttons, resource readouts, progress bars) used a generic dark sci-fi-dashboard palette that didn't feel distinct to this game or match Space View's existing steampunk redesign.",
    changes: [
      "New brass/copper/verdigris/aged-leather color palette and Cinzel (headers) + Spectral (body) + Space Mono (numeric readouts) fonts applied across the base HUD background, login/auth screen, side panels, and shared buttons",
      "The login screen's card is now a riveted brass-bordered panel with an engraved inner bevel instead of a soft rounded modern card",
      "Resource pills, the top strip, and side-panel frames now use brass borders and an aged-leather background instead of the old cold blue-gray",
      "Build/queue progress bars now read as analog brass pressure gauges -- tick-marked track, warm glowing brass fill -- instead of a flat modern progress bar",
      "Individual feature panels (fleet, senate, muster, tech tree, season lobby, etc.) still use their prior colors in this pass -- broader coverage is a follow-up"
    ]
  },
];
export const CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  ...RECENT_CLIENT_CHANGELOG_ENTRIES,
  ...CLIENT_CHANGELOG_ENTRIES_PARALLEL_MUSTER,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_2,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_3,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_4,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_5,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_7,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_10,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_11,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_14,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_16,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_17,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_18,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_20,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_27,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_29,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_33,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_34,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_36,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_37,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_52,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_55,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_56,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_58,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_61,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_62,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_63,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_64,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_67,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_68,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_69,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_72,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_77,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_79,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_83,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_84,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_85
];
