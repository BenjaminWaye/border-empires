import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FASTER_ATTACKS_FRONTIER_COST_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792750843406, // Date.now() captured once for this entry.
    introducedIn: "2026.10.23.1",
    title: "Attacks resolve twice as fast, and wide frontiers cost more to extend",
    why: "Battles were mostly 30 seconds of watching a timer, and a huge empire could keep spreading thin, ungarrisoned frontier for the same price as a new player.",
    changes: [
      "Every attack now resolves in 15 seconds instead of 30, so fronts move faster and a strike on a weak flank lands before the defender can react",
      "Attack-speed bonuses are halved to match: Steam Vanguard now cuts 2.5 seconds and Assault Command Lattice cuts 5 seconds",
      "Claiming a frontier tile still costs 10 manpower until you hold 100 frontier tiles, then the price rises with the frontier you hold: 11 at 100, 15 at 200, 50 at 1,000 and 100 at 2,000",
      "Garrisoning frontier brings the price back down; the Expand menu shows your price, refreshed with your manpower updates",
      "Town auto-claims around your settled towns still cost the flat 10 manpower",
      "Barbarian tiles fight on the same faster clock, so they attack about every 30 seconds instead of every 45"
    ]
  }
];
