import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const DIPLOMACY_DEAL_TABLE_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793444863444, // Date.now() captured once for this entry.
    introducedIn: "2026.10.31",
    title: "Diplomacy is laid out as a deal table",
    why: "The deal screen mixed offer types, goods, sliders and a resource table in one long column, so it was hard to see what you were actually offering.",
    changes: [
      "Your Coin, Shards and spare resource supply slots are listed on the left with Truce 12h, Truce 24h and Alliance; the other empire's goods are on the right",
      "Press any good to open a slider and set the amount; the middle column shows only what is in the deal, with ✕ to take an item out and a tap on it to change the amount",
      "Without a truce or alliance, a deal with resource supply is a resource trade, and only giving an AI Coin or Shards is a gift"
    ]
  }
];
