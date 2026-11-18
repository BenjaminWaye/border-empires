import { describe, expect, it } from "vitest";

import { buildActivityDashboardSnapshot } from "./activity-dashboard-snapshot.js";

describe("buildActivityDashboardSnapshot", () => {
  // The daily story's "% of their realm" share must divide tiles lost (any
  // owned tile, frontier included) by the same kind of count -- not the
  // leaderboard's settled-only figure.
  it("reports every owned tile, frontier and settled, on each territory momentum entry", () => {
    const tile = (id: string, ownerId: string | undefined, ownershipState: string) => [id, { ownerId, ownershipState }] as const;
    const tiles = new Map([
      tile("1,1", "p1", "SETTLED"),
      tile("1,2", "p1", "FRONTIER"),
      tile("1,3", "p1", "FRONTIER"),
      tile("2,1", "p2", "SETTLED"),
      tile("3,1", undefined, "NEUTRAL")
    ]) as unknown as Parameters<typeof buildActivityDashboardSnapshot>[0]["tiles"];
    const snapshot = buildActivityDashboardSnapshot({
      tiles,
      players: new Map(),
      flipLogEntries: [{ tileId: "2,1", fromOwner: "p1", toOwner: "p2", at: 0 }] as unknown as Parameters<typeof buildActivityDashboardSnapshot>[0]["flipLogEntries"],
      combatManpowerLogEntries: [],
      now: 1_000
    });
    const byPlayer = new Map(snapshot.territoryMomentum.map((entry) => [entry.playerId, entry.tilesOwned]));
    expect(byPlayer.get("p1")).toBe(3);
    expect(byPlayer.get("p2")).toBe(1);
  });

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
