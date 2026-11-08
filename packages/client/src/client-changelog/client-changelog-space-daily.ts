import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SPACE_DAILY_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794132578619, // Date.now() captured once for this entry.
    introducedIn: "2026.11.08",
    title: "Space: one order per system and one decree a day, as action cards",
    why: "The space layer had no rhythm: builds took weeks, and it was hard to tell what to do or what anything did for you.",
    changes: [
      "Each of your systems has one order a day: build, fortify, launch a Probe or a raid. Your empire has one decree a day: Hold Court (+1 Influence), weaken the Court, declare a grievance or lend a Fighter. Each comes back 24 hours after you use it",
      "Every build now finishes within a day. Production is how fast a system builds: an Industrial world makes a Fighter in 8 hours, a Capital world in a day. Gas Harvesters and Mining Stations add Production",
      "Fortify is instant: +15 Stability",
      "Space View shows your choices as action cards: decrees in the galaxy view, orders in each system's view. After you play one, the view moves on to the next system with an order ready, then back to the galaxy. Answering the Court or a Writ is free",
      "The cards follow the new HUD's look on desktop and phones. Add ?space=legacy to the address to go back to the old panels"
    ]
  }
];
