import { describe, expect, it } from "vitest";
import type { ActivityApiResponse } from "@border-empires/game-domain";

import { buildWorldPulse } from "./world-pulse.js";

const activity = (): ActivityApiResponse => ({
  generatedAt: "2026-09-26T12:00:00.000Z",
  alliances: [], allianceBreaks: [], truceWatch: [], fortification: [],
  wars: [
    { playerA: "barbarian-1", playerB: "me", playerAName: "Barbarians", playerBName: "Me", tileFlips24h: 999, lastFlipAt: 1 },
    { playerA: "a", playerB: "b", playerAName: "Aria", playerBName: "Bram", tileFlips24h: 5, lastFlipAt: 1 }
  ],
  territoryMomentum: [
    { playerId: "barbarian-1", playerName: "Barbarians", tilesGained24h: 999, tilesLost24h: 0, net24h: 999 },
    { playerId: "a", playerName: "Aria", tilesGained24h: 5, tilesLost24h: 0, net24h: 5 }
  ],
  biggestSwing24h: null, frontlineHotspots: [], manpowerLost24h: 0,
  biggestBattle24h: null, fiercestAttacker24h: null, toughestTarget24h: null,
  growth: [],
  powerScore: [
    { id: "barbarian-1", name: "Barbarians", tiles: 999, incomePerMinute: 0, techs: 0, manpowerCap: 0, score: 999, rank: 1 },
    { id: "a", name: "Aria", tiles: 20, incomePerMinute: 1, techs: 1, manpowerCap: 10, score: 20, rank: 2 },
    { id: "me", name: "Me", tiles: 10, incomePerMinute: 1, techs: 1, manpowerCap: 10, score: 10, rank: 3 },
    { id: "b", name: "Bram", tiles: 5, incomePerMinute: 1, techs: 1, manpowerCap: 10, score: 5, rank: 4 }
  ],
  dailyStory: []
});

describe("buildWorldPulse", () => {
  it("filters barbarians before story selection and reranks leading powers", () => {
    const pulse = buildWorldPulse({ activity: activity(), playerId: "me", seasonId: "season-3", previousRank: 4, previousRankSeasonId: "season-3" });
    expect(pulse.leadingPowers.map((power) => power.playerId)).toEqual(["a", "me", "b"]);
    expect(pulse.rank).toBe(2);
    expect(pulse.rankChange).toBe(2);
    expect(pulse.stories[0]).toMatchObject({ type: "OPEN_WAR", participantIds: ["a", "b"] });
    expect(pulse.stories.every((story) => !story.participantIds.includes("barbarian-1"))).toBe(true);
  });

  it("suppresses the requester's own stories and removes coordinate-bearing copy", () => {
    const source = activity();
    source.frontlineHotspots = [{ tileId: "8,9", x: 8, y: 9, flips24h: 50, contestedBy: ["a", "b"], contestedByNames: ["Aria", "Bram"], manpowerLost24h: 20 }];
    const pulse = buildWorldPulse({ activity: source, playerId: "me", seasonId: "season-3" });
    expect(JSON.stringify(pulse)).not.toContain('"x"');
    expect(JSON.stringify(pulse)).not.toContain("(8, 9)");
  });
});
