import { describe, expect, it } from "vitest";

import { buildActivityDashboardSnapshot } from "./activity-dashboard-snapshot.js";

describe("buildActivityDashboardSnapshot", () => {
  it("includes manpowerLost24h/biggestBattle24h computed from the combat manpower log", () => {
    const snapshot = buildActivityDashboardSnapshot({
      tiles: new Map(),
      players: new Map(),
      flipLogEntries: [],
      combatManpowerLogEntries: [
        { attackerId: "p1", defenderId: "p2", attackerWon: true, manpowerLoss: 10, x: 1, y: 1, at: 0 },
        { attackerId: "p3", defenderId: "p4", attackerWon: false, manpowerLoss: 50, x: 2, y: 2, at: 100 }
      ],
      now: 1_000
    });
    expect(snapshot.manpowerLost24h).toBe(60);
    expect(snapshot.biggestBattle24h).toEqual({
      attackerId: "p3",
      defenderId: "p4",
      attackerWon: false,
      manpowerLoss: 50,
      x: 2,
      y: 2,
      at: 100
    });
    expect(snapshot.fiercestAttacker24h).toEqual({ attackerId: "p3", manpowerSpent: 50 });
    expect(snapshot.toughestTarget24h).toEqual({ defenderId: "p4", manpowerSpentAgainst: 50 });
  });

  // Regression for the daily Slack digest narrating routine frontier
  // skirmishing against the permanent barbarian NPC faction as if it were a
  // rival empire ("X and Barbarians are at war") -- wars, frontlineHotspots,
  // biggestBattle24h, and toughestTarget24h must all exclude the barbarian
  // system player the same way fiercestAttacker24h already did.
  it("excludes the barbarian system player from wars, hotspots, biggestBattle24h, and toughestTarget24h", () => {
    const snapshot = buildActivityDashboardSnapshot({
      tiles: new Map(),
      players: new Map(),
      flipLogEntries: [
        { tileId: "frontier", x: 5, y: 5, fromOwner: "barbarian-1", toOwner: "p1", at: 1 },
        { tileId: "frontier", x: 5, y: 5, fromOwner: "p1", toOwner: "barbarian-1", at: 2 }
      ],
      combatManpowerLogEntries: [
        { attackerId: "p1", defenderId: "barbarian-1", attackerWon: true, manpowerLoss: 1000, x: 5, y: 5, at: 1 },
        { attackerId: "barbarian-1", defenderId: "p1", attackerWon: false, manpowerLoss: 900, x: 5, y: 5, at: 2 }
      ],
      now: 1_000
    });
    expect(snapshot.wars).toEqual([]);
    expect(snapshot.frontlineHotspots).toEqual([]);
    expect(snapshot.biggestBattle24h).toBeNull();
    expect(snapshot.toughestTarget24h).toBeNull();
    // fiercestAttacker24h only excludes the barbarian as attacker (see its
    // own doc comment) -- p1 attacking the barbarian still spent real
    // manpower and legitimately wins that one.
    expect(snapshot.fiercestAttacker24h).toEqual({ attackerId: "p1", manpowerSpent: 1000 });
  });

  it("reports a null biggestBattle24h and 0 manpowerLost24h on a quiet day", () => {
    const snapshot = buildActivityDashboardSnapshot({
      tiles: new Map(),
      players: new Map(),
      flipLogEntries: [],
      combatManpowerLogEntries: [],
      now: 1_000
    });
    expect(snapshot.manpowerLost24h).toBe(0);
    expect(snapshot.biggestBattle24h).toBeNull();
  });
});
