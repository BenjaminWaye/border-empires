import { describe, expect, it } from "vitest";

import { buildDailyStory } from "./daily-story.js";

// Every headline pairs what was spent with what it bought. These pin the
// outcome wording, from the staging Chronicle of 2026-11-16.

const nameFor = (id: string): string => (id === "barbarian-1" ? "Barbarians" : id);

const emptyInput = {
  wars: [],
  territoryMomentum: [],
  biggestSwing24h: null,
  frontlineHotspots: [],
  alliances: [],
  allianceBreaks: [],
  powerScore: [],
  biggestBattle24h: null,
  fiercestAttacker24h: null,
  toughestTarget24h: null,
  growth: []
};

describe("buildDailyStory outcomes", () => {
  // Regression: staging Chronicle, 2026-11-16. Sigrid had 18,730 manpower
  // thrown at them and lost 405 tiles -- nearly the day's heaviest defeat --
  // yet the headline read "Toughest Target ... just 405 tiles lost", framing
  // a rout as a heroic defence.
  it("reports a target that lost a big share of its realm as under siege, not as holding", () => {
    const events = buildDailyStory(
      {
        ...emptyInput,
        toughestTarget24h: { defenderId: "sigrid", defenderName: "Sigrid", manpowerSpentAgainst: 18730 },
        territoryMomentum: [{ playerId: "sigrid", playerName: "Sigrid", tilesGained24h: 20, tilesLost24h: 405, net24h: -385 }],
        powerScore: [{ id: "sigrid", name: "Sigrid", tiles: 600, incomePerMinute: 1, techs: 5, manpowerCap: 9000, score: 500, rank: 4 }]
      },
      nameFor
    );
    const siege = events.find((e) => e.type === "TOUGHEST_TARGET");
    expect(siege?.headline).toBe("Under Siege");
    expect(siege?.text).toBe(
      "Sigrid was the most attacked empire today — rivals hurled 18,730 manpower at them and carved off 405 tiles, 40% of their realm."
    );
    expect(siege?.text).not.toContain("just");
  });

  it("still calls it holding the line when the target lost only a sliver of a large realm", () => {
    const events = buildDailyStory(
      {
        ...emptyInput,
        toughestTarget24h: { defenderId: "p1", defenderName: "Wall", manpowerSpentAgainst: 9000 },
        territoryMomentum: [{ playerId: "p1", playerName: "Wall", tilesGained24h: 0, tilesLost24h: 40, net24h: -40 }],
        powerScore: [{ id: "p1", name: "Wall", tiles: 2000, incomePerMinute: 1, techs: 5, manpowerCap: 9000, score: 500, rank: 1 }]
      },
      nameFor
    );
    const held = events.find((e) => e.type === "TOUGHEST_TARGET");
    expect(held?.headline).toBe("Held the Line");
    expect(held?.text).toBe("Rivals hurled 9,000 manpower at Wall today and took only 40 tiles.");
  });

  it("says whether the bloodiest assault broke through or was thrown back", () => {
    const events = buildDailyStory(
      {
        ...emptyInput,
        biggestBattle24h: { attackerId: "p1", defenderId: "p2", attackerName: "Edvin", defenderName: "Elin", attackerWon: false, manpowerLoss: 300, x: 3, y: 4, at: 0 }
      },
      nameFor
    );
    expect(events[0]!.text).toBe("Edvin threw 300 manpower into a single assault on Elin at (3, 4) — and was thrown back.");
    expect(events[0]!.dashboardText).toBe("Edvin threw 300 manpower into a single assault on Elin — and was thrown back.");
  });

  it("says what the fiercest attacker's spending actually won", () => {
    const withGains = buildDailyStory(
      {
        ...emptyInput,
        fiercestAttacker24h: { attackerId: "ivar", attackerName: "Ivar", manpowerSpent: 11755 },
        territoryMomentum: [{ playerId: "ivar", playerName: "Ivar", tilesGained24h: 312, tilesLost24h: 400, net24h: -88 }]
      },
      nameFor
    );
    expect(withGains.find((e) => e.type === "FIERCEST_ATTACKER")?.text).toBe(
      "Ivar spent 11,755 manpower on attacks today — more than anyone — and took 312 tiles."
    );
    const noGains = buildDailyStory(
      {
        ...emptyInput,
        fiercestAttacker24h: { attackerId: "ivar", attackerName: "Ivar", manpowerSpent: 500 },
        territoryMomentum: [{ playerId: "ivar", playerName: "Ivar", tilesGained24h: 0, tilesLost24h: 3, net24h: -3 }]
      },
      nameFor
    );
    expect(noGains[0]!.text).toBe("Ivar spent 500 manpower on attacks today — more than anyone — but gained no ground.");
  });

  // Regression: the same staging Chronicle showed "Heaviest Defeat: Alden
  // lost 475 tiles" and, two rows down, "Open War: Alden and Freja ... 476
  // tiles changed hands" -- one story told twice.
  it("folds the heaviest defeat into the war it happened in instead of telling it twice", () => {
    const events = buildDailyStory(
      {
        ...emptyInput,
        biggestSwing24h: { playerId: "alden", playerName: "Alden", tilesLost: 475, windowStart: 0, windowEnd: 1000 },
        wars: [{ playerA: "alden", playerB: "freja", playerAName: "Alden", playerBName: "Freja", tileFlips24h: 600, tilesContested24h: 476, lastFlipAt: 0 }],
        powerScore: [{ id: "alden", name: "Alden", tiles: 525, incomePerMinute: 1, techs: 5, manpowerCap: 9000, score: 500, rank: 6 }]
      },
      nameFor
    );
    expect(events.map((e) => e.type)).toEqual(["OPEN_WAR"]);
    expect(events[0]!.text).toBe(
      "Alden and Freja are locked in open war — 476 tiles changed hands today. Alden is bleeding worst: 475 tiles lost, 48% of their realm, more than any empire."
    );
    expect(events[0]!.participantIds).toEqual(["alden", "freja"]);
  });
});
