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
  biggestBattle24h: null,
  fiercestAttacker24h: null,
  toughestTarget24h: null,
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
        significance: 41, // normalizeSignificance(61, SIGNIFICANCE_SCALE.tileCount=150)
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
      significance: 95, // normalizeSignificance(95, SIGNIFICANCE_SCALE.flipCount=100)
      players: ["A", "B"]
    });
  });

  it("narrates the bloodiest battle", () => {
    const events = buildDailyStory(
      {
        ...emptyInput,
        biggestBattle24h: { attackerId: "p1", defenderId: "p2", attackerName: "Milo Ash", defenderName: "Barbarians", attackerWon: true, manpowerLoss: 40, x: 128, y: 44, at: 0 }
      },
      nameFor
    );
    expect(events).toEqual([
      {
        type: "BLOODIEST_BATTLE",
        headline: "Bloodiest Battle",
        text: "The bloodiest battle today was Milo Ash against Barbarians at (128, 44) — 40 manpower lost.",
        significance: 13, // normalizeSignificance(40, SIGNIFICANCE_SCALE.singleBattleManpower=300)
        players: ["Milo Ash", "Barbarians"],
        x: 128,
        y: 44
      }
    ]);
  });

  it("narrates an attack on unclaimed land without a defender", () => {
    const events = buildDailyStory(
      {
        ...emptyInput,
        biggestBattle24h: { attackerId: "p1", defenderId: undefined, attackerName: "Milo Ash", defenderName: undefined, attackerWon: true, manpowerLoss: 10, x: 5, y: 5, at: 0 }
      },
      nameFor
    );
    expect(events[0]!.text).toBe("The bloodiest battle today was Milo Ash against unclaimed land at (5, 5) — 10 manpower lost.");
    expect(events[0]!.players).toEqual(["Milo Ash"]);
  });

  it("narrates the fiercest attacker, spending manpower on attacks", () => {
    const events = buildDailyStory(
      { ...emptyInput, fiercestAttacker24h: { attackerId: "p1", attackerName: "Milo Ash", manpowerSpent: 400 } },
      nameFor
    );
    expect(events).toEqual([
      {
        type: "FIERCEST_ATTACKER",
        headline: "Fiercest Attacker",
        text: "Milo Ash pressed hardest today, spending 400 manpower on attacks.",
        significance: 40, // normalizeSignificance(400, SIGNIFICANCE_SCALE.aggregateManpower=1000)
        players: ["Milo Ash"]
      }
    ]);
  });

  it("returns nothing for fiercest attacker when manpower spent is zero", () => {
    expect(buildDailyStory({ ...emptyInput, fiercestAttacker24h: { attackerId: "p1", attackerName: "Milo Ash", manpowerSpent: 0 } }, nameFor)).toEqual([]);
  });

  it("narrates the toughest target as costing manpower but losing no ground", () => {
    const events = buildDailyStory(
      {
        ...emptyInput,
        toughestTarget24h: { defenderId: "p1", defenderName: "Wayepoint", manpowerSpentAgainst: 3400 },
        territoryMomentum: [{ playerId: "p1", playerName: "Wayepoint", tilesGained24h: 0, tilesLost24h: 0, net24h: 0 }]
      },
      nameFor
    );
    expect(events).toEqual([
      {
        type: "TOUGHEST_TARGET",
        headline: "Toughest Target",
        text: "Attacking Wayepoint cost 3400 manpower today — not a tile lost.",
        significance: 340, // normalizeSignificance(3400, aggregateManpower=1000)
        players: ["Wayepoint"]
      }
    ]);
  });

  it("narrates the toughest target's actual tile losses when it did lose ground", () => {
    const events = buildDailyStory(
      {
        ...emptyInput,
        toughestTarget24h: { defenderId: "p1", defenderName: "Milo Ash", manpowerSpentAgainst: 100 },
        territoryMomentum: [{ playerId: "p1", playerName: "Milo Ash", tilesGained24h: 0, tilesLost24h: 3, net24h: -3 }]
      },
      nameFor
    );
    expect(events[0]!.text).toBe("Attacking Milo Ash cost 100 manpower today — just 3 tiles lost.");
  });

  it("attributes zero tiles lost to a defender absent from territoryMomentum entirely", () => {
    const events = buildDailyStory(
      { ...emptyInput, toughestTarget24h: { defenderId: "unknown-player", defenderName: "Ghost", manpowerSpentAgainst: 50 } },
      nameFor
    );
    expect(events[0]!.text).toBe("Attacking Ghost cost 50 manpower today — not a tile lost.");
  });

  it("returns nothing for toughest target when manpower spent against them is zero", () => {
    expect(buildDailyStory({ ...emptyInput, toughestTarget24h: { defenderId: "p1", defenderName: "Milo Ash", manpowerSpentAgainst: 0 } }, nameFor)).toEqual([]);
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
        significance: 48, // normalizeSignificance(144, SIGNIFICANCE_SCALE.goldPerDay=300)
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
        significance: 7, // normalizeSignificance(330, SIGNIFICANCE_SCALE.manpowerCapDelta=5000)
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
        significance: 116, // normalizeSignificance(116, SIGNIFICANCE_SCALE.flipCount=100)
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
        significance: 33, // normalizeSignificance(50, SIGNIFICANCE_SCALE.tileCount=150)
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
  // already been filtered out upstream). Every event here deliberately
  // names a DIFFERENT player (or player pair) from every other one, so
  // dedupeByPlayerSet -- which is exactly what a real, varied digest day
  // relies on -- has nothing to collapse and this stays a pure test of
  // per-type text formatting.
  it("uses singular 'tile'/'flip' and 'involving' (not 'between') for a count of exactly one", () => {
    const events = buildDailyStory(
      {
        ...emptyInput,
        biggestSwing24h: { playerId: "p1", playerName: "Milo Ash", tilesLost: 1, windowStart: 0, windowEnd: 1000 },
        wars: [{ playerA: "p1", playerB: "p2", playerAName: "Milo Ash", playerBName: "Barbarians", tileFlips24h: 1, lastFlipAt: 0 }],
        frontlineHotspots: [
          { tileId: "434,154", x: 434, y: 154, flips24h: 1, contestedBy: ["p3"], contestedByNames: ["Sigrid"] }
        ],
        territoryMomentum: [{ playerId: "p5", playerName: "Racer", tilesGained24h: 1, tilesLost24h: 0, net24h: 1 }],
        powerScore: [{ id: "p6", name: "Champion", tiles: 1, incomePerMinute: 0.01, techs: 0, manpowerCap: 870, score: 7.9, rank: 1 }]
      },
      nameFor
    );
    const byType = new Map(events.map((e) => [e.type, e.text]));
    expect(byType.get("BIGGEST_DEFEAT")).toBe("Milo Ash lost 1 tile today — the worst losses of the day.");
    expect(byType.get("OPEN_WAR")).toBe("Milo Ash and Barbarians are at war — 1 tile changed hands today.");
    expect(byType.get("FIERCEST_FIGHTING")).toBe("The fiercest fighting today was at (434, 154) — 1 flip involving Sigrid.");
    expect(byType.get("FASTEST_EXPANSION")).toBe("Racer expanded fastest today, gaining 1 tile net.");
    expect(byType.get("STRONGEST_EMPIRE")).toBe("Champion holds the strongest empire in the realm — 1 tile, score 7.9.");
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

  // The concrete bug this whole normalization pass fixes: on real prod data
  // (2026-09-01), a routine 600-point manpower-cap tick outranked a
  // 121-tile barbarian land grab purely because manpower-cap numbers live on
  // a naturally larger raw scale than tile counts -- not because it was
  // actually more significant. Normalizing each event type against its own
  // "big day" reference (daily-story-significance.ts) fixes that.
  it("no longer lets a routine manpower-cap tick outrank a much bigger territorial swing", () => {
    const events = buildDailyStory(
      {
        ...emptyInput,
        territoryMomentum: [{ playerId: "p1", playerName: "Barbarians", tilesGained24h: 121, tilesLost24h: 0, net24h: 121 }],
        growth: [{ playerId: "p2", playerName: "Someone", incomePerMinute: 1, incomePerMinuteDelta: 0, manpowerCap: 1600, manpowerCapDelta: 600, baselineAt: 0 }]
      },
      nameFor
    );
    expect(events[0]!.type).toBe("FASTEST_EXPANSION");
    expect(events[1]!.type).toBe("MANPOWER_SURGE");
  });

  describe("dedupeByPlayerSet", () => {
    it("drops a lower-ranked event whose players are already fully covered by a higher-ranked one", () => {
      const events = buildDailyStory(
        {
          ...emptyInput,
          // ALLIANCE_BROKEN (fixed 80) outranks OPEN_WAR (flips=40 -> 40) and
          // BIGGEST_DEFEAT (tiles=30 -> 20); both are wholly about the same
          // pair the alliance break already named.
          allianceBreaks: [{ playerA: "p1", playerB: "p2", brokenBy: "p1", brokenAt: 900, noticeEndsAt: 1900 }],
          wars: [{ playerA: "p1", playerB: "p2", playerAName: "p1", playerBName: "p2", tileFlips24h: 40, lastFlipAt: 0 }],
          biggestSwing24h: { playerId: "p1", playerName: "p1", tilesLost: 30, windowStart: 0, windowEnd: 1000 }
        },
        (id) => id
      );
      expect(events.map((e) => e.type)).toEqual(["ALLIANCE_BROKEN"]);
    });

    it("keeps an event that introduces even one player not already covered", () => {
      const events = buildDailyStory(
        {
          ...emptyInput,
          allianceBreaks: [{ playerA: "p1", playerB: "p2", brokenBy: "p1", brokenAt: 900, noticeEndsAt: 1900 }],
          // Shares p1 with the alliance break above but also names p3 -- a
          // three-way situation the reader hasn't been told about yet.
          wars: [{ playerA: "p1", playerB: "p3", playerAName: "p1", playerBName: "p3", tileFlips24h: 40, lastFlipAt: 0 }]
        },
        (id) => id
      );
      expect(events.map((e) => e.type)).toEqual(["ALLIANCE_BROKEN", "OPEN_WAR"]);
    });

    it("does not drop unrelated events naming entirely different players", () => {
      const events = buildDailyStory(
        {
          ...emptyInput,
          allianceBreaks: [{ playerA: "p1", playerB: "p2", brokenBy: "p1", brokenAt: 900, noticeEndsAt: 1900 }],
          biggestSwing24h: { playerId: "p3", playerName: "p3", tilesLost: 30, windowStart: 0, windowEnd: 1000 }
        },
        (id) => id
      );
      expect(events.map((e) => e.type).sort()).toEqual(["ALLIANCE_BROKEN", "BIGGEST_DEFEAT"]);
    });

    // A located event (x/y set) is never dropped, even when every one of its
    // players is already covered: naming the specific tile is new
    // information (WHERE, not just THAT) about an already-known rivalry.
    it("keeps a located event even when its players are already fully covered", () => {
      const events = buildDailyStory(
        {
          ...emptyInput,
          wars: [{ playerA: "p1", playerB: "p2", playerAName: "p1", playerBName: "p2", tileFlips24h: 90, lastFlipAt: 0 }],
          frontlineHotspots: [
            { tileId: "5,5", x: 5, y: 5, flips24h: 10, contestedBy: ["p1", "p2"], contestedByNames: ["p1", "p2"] }
          ]
        },
        (id) => id
      );
      expect(events.map((e) => e.type)).toEqual(["OPEN_WAR", "FIERCEST_FIGHTING"]);
    });

    // Regression: real prod digest (2026-09-04) read as only 3 lines --
    // Heaviest Defeat, Open War, Fastest Expansion -- despite a genuinely
    // eventful day (a 60-manpower battle, a 21-flip hotspot, 4,424 manpower
    // spent attacking). Root cause was two compounding bugs: (1)
    // normalizeSignificance clamped every metric to 100, so several
    // completely different magnitudes (226 tiles, 301 flips, 4,424
    // manpower, all wildly past their calibration caps) tied at the
    // ceiling, and which ones "won" the tie came down to array-construction
    // order; (2) Bloodiest Battle and Fiercest Fighting -- both genuinely
    // new information (a specific tile) -- got dropped by dedup anyway
    // because they named the same two players Open War already had. Fixed
    // by removing the clamp (so 226/150 actually outranks 178/150 instead
    // of tying) and exempting located events from dedup.
    it("does not collapse a genuinely eventful day down to a handful of lines", () => {
      const events = buildDailyStory(
        {
          ...emptyInput,
          biggestSwing24h: { playerId: "p1", playerName: "SirExodus", tilesLost: 226, windowStart: 0, windowEnd: 1000 },
          wars: [{ playerA: "p2", playerB: "p1", playerAName: "Wayepoint", playerBName: "SirExodus", tileFlips24h: 301, lastFlipAt: 0 }],
          frontlineHotspots: [
            { tileId: "1,1", x: 1, y: 1, flips24h: 21, contestedBy: ["p2", "p1"], contestedByNames: ["Wayepoint", "SirExodus"] }
          ],
          biggestBattle24h: { attackerId: "p2", defenderId: "p1", attackerName: "Wayepoint", defenderName: "SirExodus", attackerWon: true, manpowerLoss: 60, x: 1, y: 1, at: 0 },
          fiercestAttacker24h: { attackerId: "p1", attackerName: "SirExodus", manpowerSpent: 4424 },
          toughestTarget24h: { defenderId: "p1", defenderName: "SirExodus", manpowerSpentAgainst: 4215 },
          territoryMomentum: [{ playerId: "p3", playerName: "Barbarians", tilesGained24h: 210, tilesLost24h: 32, net24h: 178 }],
          powerScore: [{ id: "p1", name: "SirExodus", tiles: 2000, incomePerMinute: 1, techs: 5, manpowerCap: 20000, score: 2412, rank: 1 }]
        },
        nameFor
      );
      // Every genuinely distinct fact from the day survives: the two
      // located events (place-specific) alongside the highest-signal
      // unlocated ones. True redundancy still collapses -- Toughest Target
      // (SirExodus alone) adds nothing Fiercest Attacker (SirExodus alone,
      // and ranked higher: 442 vs 422) hasn't already said, and Standing/
      // Heaviest Defeat (both SirExodus alone too) collapse the same way.
      expect(events.map((e) => e.type)).toEqual([
        "FIERCEST_ATTACKER",
        "OPEN_WAR",
        "FASTEST_EXPANSION",
        "FIERCEST_FIGHTING",
        "BLOODIEST_BATTLE"
      ]);
    });
  });
});
