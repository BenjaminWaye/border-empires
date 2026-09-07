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
