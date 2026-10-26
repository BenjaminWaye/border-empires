import { describe, expect, it } from "vitest";

import type { SeasonVictoryPathId } from "@border-empires/shared";
import { topContenders } from "./season-victory-contenders.js";
import { buildEconomicHegemonyObjective, computeSeasonVictory } from "./season-victory-objectives.js";

type WorldTileFixture = Parameters<typeof computeSeasonVictory>[0][number];
type LeaderboardFixture = Parameters<typeof computeSeasonVictory>[1];
type PlayersFixture = Parameters<typeof computeSeasonVictory>[2];

const entry = (id: string, incomePerMinute: number, rank: number): LeaderboardFixture[number] =>
  ({ id, name: id.toUpperCase(), tiles: 1, incomePerMinute, techs: 0, score: 0, rank });

describe("season victory contenders", () => {
  it("keeps the best two non-leaders, best first, and drops zero progress", () => {
    const progress = new Map<string, Map<SeasonVictoryPathId, number>>([
      ["lead", new Map([["TOWN_CONTROL", 0.9]])],
      ["a", new Map([["TOWN_CONTROL", 0.2]])],
      ["b", new Map([["TOWN_CONTROL", 0.6]])],
      ["c", new Map([["TOWN_CONTROL", 0.4]])],
      ["d", new Map([["TOWN_CONTROL", 0]])]
    ]);
    const result = topContenders({ id: "TOWN_CONTROL", leaderPlayerId: "lead" }, progress, (id) => id.toUpperCase());
    expect(result).toEqual([
      { playerId: "b", name: "B", progress: 0.6 },
      { playerId: "c", name: "C", progress: 0.4 }
    ]);
  });

  it("gives every tile-scanned path its runners-up (race tracks showed only the leader)", () => {
    const worldTiles = [
      { x: 0, y: 0, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED", townType: "MARKET" },
      { x: 2, y: 0, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED", townType: "MARKET" },
      { x: 4, y: 0, terrain: "LAND", ownerId: "p2", ownershipState: "SETTLED", townType: "MARKET" },
      { x: 6, y: 0, terrain: "LAND", ownerId: "p3", ownershipState: "SETTLED" }
    ] as WorldTileFixture[];
    const players = [{ id: "p1", allies: [] }, { id: "p2", allies: [] }, { id: "p3", allies: [] }] as PlayersFixture;
    const { objectives } = computeSeasonVictory(worldTiles, [entry("p1", 10, 1), entry("p2", 5, 2), entry("p3", 1, 3)], players);
    const towns = objectives.find((o) => o.id === "TOWN_CONTROL");
    expect(towns?.leaderPlayerId).toBe("p1");
    expect(towns?.contenders?.map((c) => c.playerId)).toEqual(["p2"]);
    expect(towns?.contenders?.[0]?.name).toBe("P2");
  });

  it("ranks Economic Hegemony runners-up by income against the leader", () => {
    const objective = buildEconomicHegemonyObjective([entry("p1", 2000 / 1440, 1), entry("p2", 1000 / 1440, 2), entry("p3", 500 / 1440, 3), entry("p4", 100 / 1440, 4)]);
    expect(objective.contenders?.map((c) => c.playerId)).toEqual(["p2", "p3"]);
    expect(objective.contenders?.[0]?.progress).toBeCloseTo(0.5);
  });
});
