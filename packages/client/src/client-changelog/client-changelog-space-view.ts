import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_SPACE_VIEW: ClientChangelogEntry[] = [
  {
    createdAt: 1789933799382,
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
  }
];
