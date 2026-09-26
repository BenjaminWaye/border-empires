import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_90: ClientChangelogEntry[] = [
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
];
