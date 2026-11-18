import { describe, expect, it } from "vitest";

import { buildFiercestAttacker, buildToughestTarget } from "./daily-story-combat.js";
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
      "Sigrid was the most attacked empire today — rivals hurled 18,730 manpower at them, and Sigrid lost 405 tiles, 40% of their realm."
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
    expect(held?.text).toBe("Rivals hurled 9,000 manpower at Wall today, yet Wall lost only 40 tiles.");
  });

  it("says whether the bloodiest assault broke through or was thrown back", () => {
    const events = buildDailyStory(
      {
        ...emptyInput,
        biggestBattle24h: { attackerId: "p1", defenderId: "p2", attackerName: "Edvin", defenderName: "Elin", attackerWon: false, manpowerLoss: 300, x: 3, y: 4, at: 0 }
      },
      nameFor
    );
    expect(events[0]!.text).toBe("Edvin lost 300 manpower in a single assault on Elin at (3, 4) — and was thrown back.");
    expect(events[0]!.dashboardText).toBe("Edvin lost 300 manpower in a single assault on Elin — and was thrown back.");
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
      "Ivar spent 11,755 manpower on attacks today — more than anyone — yet still ended the day 88 tiles down."
    );
    const noGains = buildDailyStory(
      {
        ...emptyInput,
        fiercestAttacker24h: { attackerId: "ivar", attackerName: "Ivar", manpowerSpent: 500 },
        territoryMomentum: [{ playerId: "ivar", playerName: "Ivar", tilesGained24h: 0, tilesLost24h: 3, net24h: -3 }]
      },
      nameFor
    );
    expect(noGains[0]!.text).toBe("Ivar spent 500 manpower on attacks today — more than anyone — yet still ended the day 3 tiles down.");
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

  it("reports a net gain when the fiercest attacker came out ahead", () => {
    const event = buildFiercestAttacker(
      { attackerId: "ivar", attackerName: "Ivar", manpowerSpent: 900 },
      [{ playerId: "ivar", playerName: "Ivar", tilesGained24h: 60, tilesLost24h: 10, net24h: 50 }]
    );
    expect(event?.text).toBe(
      "Ivar spent 900 manpower on attacks today — more than anyone — and came out 50 tiles ahead."
    );
  });

  // The staging day the PR set out to fix, end to end: territory news must
  // lead, and Sigrid/Alden must each be told once.
  it("ranks the staging day's territory news above its manpower totals", () => {
    const events = buildDailyStory(
      {
        ...emptyInput,
        biggestSwing24h: { playerId: "alden", playerName: "Alden", tilesLost: 475, windowStart: 0, windowEnd: 1000 },
        wars: [{ playerA: "alden", playerB: "freja", playerAName: "Alden", playerBName: "Freja", tileFlips24h: 600, tilesContested24h: 476, lastFlipAt: 0 }],
        toughestTarget24h: { defenderId: "sigrid", defenderName: "Sigrid", manpowerSpentAgainst: 18730 },
        fiercestAttacker24h: { attackerId: "ivar", attackerName: "Ivar", manpowerSpent: 11755 },
        territoryMomentum: [{ playerId: "sigrid", playerName: "Sigrid", tilesGained24h: 0, tilesLost24h: 405, net24h: -405 }],
        powerScore: [{ id: "sigrid", name: "Sigrid", tiles: 600, incomePerMinute: 1, techs: 5, manpowerCap: 9000, score: 500, rank: 4 }]
      },
      nameFor
    );
    expect(events.map((e) => e.type)).toEqual(["OPEN_WAR", "TOUGHEST_TARGET", "FIERCEST_ATTACKER"]);
  });

  // Reviewer-found: when the most attacked empire is also the day's heaviest
  // loser, Under Siege and the folded war line both narrated the same loss.
  it("tells the heaviest loser's losses once when they are also under siege", () => {
    const events = buildDailyStory(
      {
        ...emptyInput,
        biggestSwing24h: { playerId: "alden", playerName: "Alden", tilesLost: 475, windowStart: 0, windowEnd: 1000 },
        wars: [{ playerA: "alden", playerB: "freja", playerAName: "Alden", playerBName: "Freja", tileFlips24h: 600, tilesContested24h: 476, lastFlipAt: 0 }],
        toughestTarget24h: { defenderId: "alden", defenderName: "Alden", manpowerSpentAgainst: 18730 },
        territoryMomentum: [{ playerId: "alden", playerName: "Alden", tilesGained24h: 0, tilesLost24h: 475, net24h: -475 }],
        powerScore: [{ id: "alden", name: "Alden", tiles: 525, incomePerMinute: 1, techs: 5, manpowerCap: 9000, score: 500, rank: 6 }]
      },
      nameFor
    );
    expect(events.filter((e) => e.text.includes("475 tiles lost") || e.text.includes("lost 475 tiles"))).toHaveLength(1);
    expect(events.map((e) => e.type)).toEqual(["OPEN_WAR"]);
  });

  it("never says the day's heaviest loser held the line, however large their realm", () => {
    const momentum = [{ playerId: "big", playerName: "Big", tilesGained24h: 0, tilesLost24h: 450, net24h: -450 }];
    const powers = [{ id: "big", name: "Big", tiles: 5000, incomePerMinute: 1, techs: 5, manpowerCap: 9000, score: 500, rank: 1 }];
    const target = { defenderId: "big", defenderName: "Big", manpowerSpentAgainst: 9000 };
    // 450 of 5,450 tiles is under the 10% "held" share on its own...
    expect(buildToughestTarget(target, momentum, powers, undefined)?.headline).toBe("Held the Line");
    // ...but not when it is also the worst losses of the day.
    expect(buildToughestTarget(target, momentum, powers, "big")?.headline).toBe("Under Siege");
  });

  // Reviewer-found: tilesLost is the total from every front, so a 3-tile
  // skirmish must not be blamed for 470 tiles lost elsewhere.
  it("does not fold a defeat into a war too small to explain it", () => {
    const events = buildDailyStory(
      {
        ...emptyInput,
        biggestSwing24h: { playerId: "alden", playerName: "Alden", tilesLost: 470, windowStart: 0, windowEnd: 1000 },
        wars: [{ playerA: "alden", playerB: "freja", playerAName: "Alden", playerBName: "Freja", tileFlips24h: 3, tilesContested24h: 3, lastFlipAt: 0 }]
      },
      nameFor
    );
    expect(events.map((e) => e.type)).toEqual(["BIGGEST_DEFEAT", "OPEN_WAR"]);
    expect(events[1]!.text).toBe("Alden and Freja are locked in open war — 3 tiles changed hands today.");
  });

  it("skips Fiercest Fighting when no contestant names survived upstream filtering", () => {
    const events = buildDailyStory(
      {
        ...emptyInput,
        frontlineHotspots: [{ tileId: "1,1", x: 1, y: 1, flips24h: 4, contestedBy: [], contestedByNames: [], manpowerLost24h: 0 }]
      },
      nameFor
    );
    expect(events).toEqual([]);
  });
});
