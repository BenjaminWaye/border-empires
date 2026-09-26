import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_90: ClientChangelogEntry[] = [
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
];
