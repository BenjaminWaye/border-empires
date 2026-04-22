import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { chooseBestStrategicSettlementTile } from "./ai-settlement-priority.js";

const tile = (x: number, y: number, partial: Partial<DomainTileState> = {}): DomainTileState => ({
  x,
  y,
  terrain: "LAND",
  ownerId: "player-1",
  ownershipState: "FRONTIER",
  ...partial
});

describe("chooseBestStrategicSettlementTile", () => {
  it("picks the highest-value strategic frontier candidate without sorting", () => {
    const candidates = [
      tile(5, 5),
      tile(3, 3, { resource: "WOOD" }),
      tile(4, 4, { town: { type: "FARMING", populationTier: "SETTLEMENT", name: "A" } })
    ];
    const tiles = new Map(candidates.map((candidate) => [`${candidate.x},${candidate.y}`, candidate]));

    const best = chooseBestStrategicSettlementTile("player-1", candidates, tiles);

    expect(best).toMatchObject({ x: 4, y: 4 });
  });

  it("ignores pending candidates and falls back to next best strategic tile", () => {
    const candidates = [
      tile(1, 1, { town: { type: "FARMING", populationTier: "SETTLEMENT", name: "Blocked" } }),
      tile(2, 2, { resource: "FARM" }),
      tile(3, 3)
    ];
    const tiles = new Map(candidates.map((candidate) => [`${candidate.x},${candidate.y}`, candidate]));

    const best = chooseBestStrategicSettlementTile(
      "player-1",
      candidates,
      tiles,
      (candidate) => candidate.x === 1 && candidate.y === 1
    );

    expect(best).toMatchObject({ x: 2, y: 2 });
  });
});
