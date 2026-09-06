import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_24: ClientChangelogEntry[] = [
  {
    createdAt: 1788674153352, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.06.04",
    title: "Player profile now shows a player's Galactic Holdings (Planets and Outposts)",
    why: "A season's winner permanently keeps a galactic Planet or Outpost across resets, but there was nowhere to see whose Planet was whose besides the galaxy map itself -- the new player profile card had no way to show it.",
    changes: [
      "Opening any player's profile now shows their Galactic Holdings (Planet/Outpost, specialization, and which season they won it), fetched publicly so it works even for players you've never met this season"
    ]
  },
  {
    createdAt: 1788674154352, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.06.05",
    title: "Player profile now shows a career trophy case of wins by victory condition",
    why: "A player's win history was scattered across whatever seasons happened to still show up in the galaxy view, with no single place showing which victory conditions an account has actually won and how many times.",
    changes: [
      "Any player's profile now shows a Career Trophy Case: one badge per victory condition they've won, with a count -- counts a win permanently even if the Planet it earned is later lost via a Defense Campaign"
    ]
  },
  {
    createdAt: 1788674155352, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.06.06",
    title: "Player profile now shows Career Stats: seasons played, best rank, and peak score/tiles",
    why: "The galaxy layer's season archive only keeps each season's top-5 finishers, so a player's own profile had no way to show how many seasons they'd actually played or their best-ever finish unless they happened to place in the top 5 -- most players never would.",
    changes: [
      "Any player's profile now shows Career Stats: total seasons played, best rank finish, and peak score/tiles held across every season they've played, not just top-5 finishes"
    ]
  },
  {
    createdAt: 1788674156352, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.06.07",
    title: "Fixed the player profile card letting clicks through to the map behind it, and relabeled its Tiles stat",
    why: "The player profile overlay's container had no positioning/z-index rule of its own (every other overlay in the game -- Tech Detail, Empire Intel, etc. -- has one), so it sat inline in the page instead of covering the screen, and clicks meant for it could fall through to the game underneath. Its \"Tiles\" stat also used different wording from every other tiles count in the game (\"Settled Tiles\"), reading as a different metric.",
    changes: [
      "The player profile card now covers the screen and blocks clicks to the map behind it, like every other overlay",
      "Its tile-count stat is now labeled \"Settled Tiles\", matching the wording used everywhere else"
    ]
  },
  {
    createdAt: 1788674157352, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.06.08",
    title: "Login progress now shows what's actually happening, not a stuck 'world state loaded' message",
    why: "The login screen sent one 'Your world state loaded. Joining the simulation...' message right after the bootstrap fetch, then didn't update again until a 1-second heartbeat timer ticked, so on a fast login it visibly froze on that line for up to a second, and the later 'Finishing up...' stretch (resolving state, loading leaderboard profiles, assembling session data, picking colors, packaging the payload) was covered by one generic elapsed-time guess instead of saying which of those was actually running.",
    changes: [
      "The login progress modal now updates immediately when each stage starts instead of waiting on the next heartbeat tick",
      "The 'Finishing up...' stretch now labels each real sub-step as it runs (loading leaderboard profiles, assembling session data, picking empire colors, packaging the session) instead of one generic message"
    ]
  }
];
