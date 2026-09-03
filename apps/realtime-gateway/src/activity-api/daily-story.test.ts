import { describe, expect, it } from "vitest";

import { buildDailyStory } from "./daily-story.js";

const nameFor = (id: string): string => (id === "barbarian-1" ? "Barbarians" : id);

const emptyInput = {
  wars: [],
  territoryMomentum: [],
  biggestSwing24h: null,
  frontlineHotspots: [],
  alliances: [],
  allianceBreaks: [],
  powerScore: [],
  manpowerLost24h: 0,
  biggestBattle24h: null,
  growth: []
};

describe("buildDailyStory", () => {
  it("returns nothing for a quiet day with no data at all", () => {
    expect(buildDailyStory(emptyInput, nameFor)).toEqual([]);
  });

  it("narrates the biggest defeat in the game's own voice", () => {
    const events = buildDailyStory(
      { ...emptyInput, biggestSwing24h: { playerId: "p1", playerName: "Milo Ash", tilesLost: 61, windowStart: 0, windowEnd: 1000 } },
      nameFor
    );
    expect(events).toEqual([
      {
        type: "BIGGEST_DEFEAT",
        headline: "Heaviest Defeat",
        text: "Milo Ash lost 61 tiles today — the worst losses of the day.",
        significance: 61,
        players: ["Milo Ash"]
      }
    ]);
  });

  it("narrates an open war between the two most active combatants", () => {
    const events = buildDailyStory(
      {
        ...emptyInput,
        wars: [
          { playerA: "p1", playerB: "p2", playerAName: "Milo Ash", playerBName: "Barbarians", tileFlips24h: 40, lastFlipAt: 0 },
          { playerA: "p3", playerB: "p4", playerAName: "A", playerBName: "B", tileFlips24h: 95, lastFlipAt: 0 }
        ]
      },
      nameFor
    );
    expect(events[0]).toEqual({
      type: "OPEN_WAR",
      headline: "Open War",
      text: "A and B are at war — 95 tiles changed hands today.",
      significance: 95,
      players: ["A", "B"]
    });
  });

  it("narrates the bloodiest battle, folding in the realm-wide total when it exceeds the single battle", () => {
    const events = buildDailyStory(
      {
        ...emptyInput,
        biggestBattle24h: { attackerId: "p1", defenderId: "p2", attackerName: "Milo Ash", defenderName: "Barbarians", attackerWon: true, manpowerLoss: 40, x: 128, y: 44, at: 0 },
        manpowerLost24h: 120
      },
      nameFor
    );
    expect(events).toEqual([
      {
        type: "BLOODIEST_BATTLE",
        headline: "Bloodiest Battle",
        text: "The bloodiest battle today was Milo Ash against Barbarians at (128, 44) — 40 manpower lost. 120 manpower lost to combat across the realm today.",
        significance: 40,
        players: ["Milo Ash", "Barbarians"],
        x: 128,
        y: 44
      }
    ]);
  });

  it("narrates an attack on unclaimed land without a defender, and omits the realm-wide clause when it wouldn't add anything", () => {
    const events = buildDailyStory(
      {
        ...emptyInput,
        biggestBattle24h: { attackerId: "p1", defenderId: undefined, attackerName: "Milo Ash", defenderName: undefined, attackerWon: true, manpowerLoss: 10, x: 5, y: 5, at: 0 },
        manpowerLost24h: 10
      },
      nameFor
    );
    expect(events[0]!.text).toBe("The bloodiest battle today was Milo Ash against unclaimed land at (5, 5) — 10 manpower lost.");
    expect(events[0]!.players).toEqual(["Milo Ash"]);
  });

  it("narrates an economy boom for the player whose income grew most since the stored baseline", () => {
    const events = buildDailyStory(
      {
        ...emptyInput,
        growth: [
          { playerId: "p1", playerName: "Loser", incomePerMinute: 1, incomePerMinuteDelta: -0.5, manpowerCap: 900, manpowerCapDelta: 0, baselineAt: 0 },
          { playerId: "p2", playerName: "Winner", incomePerMinute: 2, incomePerMinuteDelta: 0.1, manpowerCap: 900, manpowerCapDelta: 0, baselineAt: 0 }
        ]
      },
      nameFor
    );
    expect(events).toEqual([
      {
        type: "ECONOMY_BOOM",
        headline: "Economy Boom",
        text: "Winner's economy is booming — gold income is up 144 per day since yesterday.",
        significance: 144,
        players: ["Winner"]
      }
    ]);
  });

  it("narrates a manpower surge for the player whose cap grew most since the stored baseline", () => {
    const events = buildDailyStory(
      {
        ...emptyInput,
        growth: [{ playerId: "p1", playerName: "Grower", incomePerMinute: 1, incomePerMinuteDelta: 0, manpowerCap: 1200, manpowerCapDelta: 330, baselineAt: 0 }]
      },
      nameFor
    );
    expect(events).toEqual([
      {
        type: "MANPOWER_SURGE",
        headline: "Manpower Surge",
        text: "Grower's manpower cap has grown by 330 since yesterday.",
        significance: 330,
        players: ["Grower"]
      }
    ]);
  });

  it("narrates the fiercest fighting at a specific tile", () => {
    const events = buildDailyStory(
      {
        ...emptyInput,
        frontlineHotspots: [
          { tileId: "128,44", x: 128, y: 44, flips24h: 116, contestedBy: ["p1", "p2"], contestedByNames: ["Milo Ash", "Barbarians"] }
        ]
      },
      nameFor
    );
    expect(events).toEqual([
      {
        type: "FIERCEST_FIGHTING",
        headline: "Fiercest Fighting",
        text: "The fiercest fighting today was at (128, 44) — 116 flips between Milo Ash and Barbarians.",
        significance: 116,
        players: ["Milo Ash", "Barbarians"],
        x: 128,
        y: 44
      }
    ]);
  });

  it("resolves raw player ids on alliance events, since alliances/allianceBreaks carry ids not names", () => {
    const events = buildDailyStory(
      {
        ...emptyInput,
        alliances: [{ playerA: "p1", playerB: "p2", since: 500 }],
        allianceBreaks: [{ playerA: "p3", playerB: "p4", brokenBy: "p3", brokenAt: 900, noticeEndsAt: 1900 }]
      },
      (id) => `Name(${id})`
    );
    const formed = events.find((e) => e.type === "ALLIANCE_FORMED");
    const broken = events.find((e) => e.type === "ALLIANCE_BROKEN");
    expect(formed?.text).toBe("Name(p1) and Name(p2) have formed an alliance.");
    expect(broken?.text).toBe("Name(p3) and Name(p4)'s alliance was broken by Name(p3).");
  });

  it("narrates the fastest expander, but only when net territory is actually positive", () => {
    const events = buildDailyStory(
      {
        ...emptyInput,
        territoryMomentum: [
          { playerId: "p1", playerName: "Loser", tilesGained24h: 2, tilesLost24h: 10, net24h: -8 },
          { playerId: "p2", playerName: "Winner", tilesGained24h: 50, tilesLost24h: 0, net24h: 50 }
        ]
      },
      nameFor
    );
    expect(events).toEqual([
      {
        type: "FASTEST_EXPANSION",
        headline: "Fastest Expansion",
        text: "Winner expanded fastest today, gaining 50 tiles net.",
        significance: 50,
        players: ["Winner"]
      }
    ]);
  });

  it("narrates the standing power leader as low-significance context, not news", () => {
    const events = buildDailyStory(
      {
        ...emptyInput,
        powerScore: [
          { id: "p1", name: "Empire ZOE10T", tiles: 1016, incomePerMinute: 0.68, techs: 11, manpowerCap: 14070, score: 1693.2, rank: 1 }
        ]
      },
      nameFor
    );
    expect(events).toEqual([
      {
        type: "STRONGEST_EMPIRE",
        headline: "Standing",
        text: "Empire ZOE10T holds the strongest empire in the realm — 1016 tiles, score 1693.2.",
        significance: 5,
        players: ["Empire ZOE10T"]
      }
    ]);
  });

  // Regression: caught against real staging data, where a quiet day
  // produced "1 flips between Sigrid." -- wrong plural, and "between" reads
  // broken with a single contestant (the other side of the fight had
  // already been filtered out upstream).
  it("uses singular 'tile'/'flip' and 'involving' (not 'between') for a count of exactly one", () => {
    const events = buildDailyStory(
      {
        ...emptyInput,
        biggestSwing24h: { playerId: "p1", playerName: "Milo Ash", tilesLost: 1, windowStart: 0, windowEnd: 1000 },
        wars: [{ playerA: "p1", playerB: "p2", playerAName: "Milo Ash", playerBName: "Barbarians", tileFlips24h: 1, lastFlipAt: 0 }],
        frontlineHotspots: [
          { tileId: "434,154", x: 434, y: 154, flips24h: 1, contestedBy: ["p3"], contestedByNames: ["Sigrid"] }
        ],
        territoryMomentum: [{ playerId: "p1", playerName: "Milo Ash", tilesGained24h: 1, tilesLost24h: 0, net24h: 1 }],
        powerScore: [{ id: "p1", name: "Milo Ash", tiles: 1, incomePerMinute: 0.01, techs: 0, manpowerCap: 870, score: 7.9, rank: 1 }]
      },
      nameFor
    );
    const byType = new Map(events.map((e) => [e.type, e.text]));
    expect(byType.get("BIGGEST_DEFEAT")).toBe("Milo Ash lost 1 tile today — the worst losses of the day.");
    expect(byType.get("OPEN_WAR")).toBe("Milo Ash and Barbarians are at war — 1 tile changed hands today.");
    expect(byType.get("FIERCEST_FIGHTING")).toBe("The fiercest fighting today was at (434, 154) — 1 flip involving Sigrid.");
    expect(byType.get("FASTEST_EXPANSION")).toBe("Milo Ash expanded fastest today, gaining 1 tile net.");
    expect(byType.get("STRONGEST_EMPIRE")).toBe("Milo Ash holds the strongest empire in the realm — 1 tile, score 7.9.");
  });

  it("ranks a real news event above the standing power leader", () => {
    const events = buildDailyStory(
      {
        ...emptyInput,
        biggestSwing24h: { playerId: "p1", playerName: "Milo Ash", tilesLost: 61, windowStart: 0, windowEnd: 1000 },
        powerScore: [{ id: "p2", name: "Empire ZOE10T", tiles: 1016, incomePerMinute: 0.68, techs: 11, manpowerCap: 14070, score: 1693.2, rank: 1 }]
      },
      nameFor
    );
    expect(events[0]!.type).toBe("BIGGEST_DEFEAT");
    expect(events[events.length - 1]!.type).toBe("STRONGEST_EMPIRE");
  });
});
