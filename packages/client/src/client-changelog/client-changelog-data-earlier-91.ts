// Split out of client-changelog-data.ts (approaching the 500-line cap) --
// see that file's header comment for the "move old entries out" convention.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_91: ClientChangelogEntry[] = [
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
    createdAt: 1789926100453, // frozen, 1ms after the "Frontier tiles outside your reach..." entry (the previous newest at the time this was written)
    introducedIn: "2026.09.21.1",
    title: "New Activity dashboard shows your real combat and territory history from the last 24 hours",
    why: "The old Activity Feed only ever showed whatever happened while you had the client open, plus a lossy backfill of a handful of recent notices -- it couldn't tell you what actually happened to your empire while you were away: how much territory you gained or lost, how much gold was plundered from you or that you plundered, or how much manpower you spent attacking. The new Yours dashboard is sourced from the same durable 24h logs the server itself uses, so it's accurate even after a long time away.",
    changes: [
      "New Activity button in the HUD (next to Alerts) opens the Yours dashboard: a summary line of tiles claimed/lost, gold plundered/raided, and other counts, followed by a chronological timeline of your combat and territory events with a Center button to jump the map to each one",
      "Opens automatically, once per session, when you return to a game with new activity since you last checked",
      "If you were away more than 24 hours, the dashboard says so explicitly instead of implying the timeline covers your whole time away",
      "The existing Alerts panel (formerly \"Activity Feed\") is unchanged -- it still backfills your last 24 hours of history on login, since the new dashboard only covers combat and territory so far"
    ]
  },
  {
    createdAt: 1789933799382, // frozen, 1ms after the newest existing entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.24.1",
    title: "Space View: press your planet to build, defend it from Wardens, and work against the Court",
    why: "Space View was a map with no clear reason to open it. Dukes now have planets to develop, ships to send, something hunting them at the start, and a shared goal: the fall of the Court.",
    changes: [
      "Press one of your planets to open its panel: its Stability, its ships, and everything it can build. Each planet has its own build slot, so a Duke with two planets builds two things at once",
      "Ships are how you give orders: press a Fighter to send it raiding a system you have surveyed, or a Probe to survey one. Probes are used up, then stay in orbit and keep you updated on that system (up to 3 at once)",
      "Every planet has 2 to 4 bodies in orbit, coloured by kind. Build a Gas Harvester on a gas giant or a Mining Station on an asteroid belt for more Production, or a Cryo Refinery on an ice moon to heal that planet. The first development in each system is free; each extra one costs 1 Influence a Cycle",
      "Wardens are hardest at the start: a fixed number of attacks a Cycle is shared between every planet in the galaxy, so a lone planet takes them all and each new planet eases everyone's share. A Fighter stationed at a planet repels an attack for 20 hull damage; with none, that planet loses a flat 20 Stability and takes five hits to be contested. Each attack is announced first",
      "New Dukes get a one-time offer from the Court: 30 days of protection from Wardens in return for 90 days without Move Against the Court",
      "A list at the top of Space View says what needs you right now, and three meters under it show your Stability, your Domain Weight (your score for the throne) and Court Strength (the shared countdown to the Court falling). Hover any of them for a plain explanation",
      "The Court tab holds Move Against the Court: wager Influence to weaken the Court and raise your Domain Weight, once per Cycle. A Log tab lists what happened while you were away",
      "A raid that gets through now always costs a flat 20 Stability, whatever size the fleet. The Contest vote is gone from the Senate: a Sector is contested when its Stability reaches 0",
      "Influence income and upkeep were rebalanced so a single planet no longer runs at a loss, and Stability heals whenever your Influence is zero or above. Production is now a daily rate per planet instead of a weekly wallet",
      "The Manage Planet button is gone from Space View, since you now press your planet to manage it. Planet naming still happens in the welcome letter",
      "Every Space View panel (Duke, Senate, Settings) now has a close button and also closes when you press outside it or hit Escape. On phones the panels slide up as a bottom sheet so the map stays visible, the top bar scrolls sideways instead of wrapping, and the attention list shrinks to fit"
    ]
  },
  {
    createdAt: 1789933799388, // frozen, 1ms after the newest existing entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.26.1",
    title: "Older towns now show their real terrain type instead of always reading Fertile Town",
    why: "Towns founded before terrain profiles shipped have no stored terrain type, and the client fell back to Fertile Town even on sand or tundra, which contradicted the income the server actually paid them.",
    changes: [
      "Town cards, tile titles and capture popups now work out the terrain type of older towns from the map (Trade Town on sand, Tundra Town on tundra)",
      "The town debug download no longer reports a stale base gold of 2 per minute for towns whose server record lacks one"
    ]
  }
];
