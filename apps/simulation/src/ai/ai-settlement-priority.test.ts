import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { evaluateSettlementCandidate } from "./ai-settlement-priority.js";

const tile = (x: number, y: number, partial: Partial<DomainTileState> = {}): DomainTileState => ({
  x,
  y,
  terrain: "LAND",
  ownerId: "player-1",
  ownershipState: "FRONTIER",
  ...partial
});

describe("evaluateSettlementCandidate", () => {
  it("treats compact town-supporting frontier as an immediate settlement plan", () => {
    const candidates = [
      tile(10, 10),
      tile(10, 11, {
        ownerId: "player-1",
        ownershipState: "SETTLED",
        town: { type: "FARMING", populationTier: "TOWN", name: "Town", supportMax: 3, supportCurrent: 1 }
      }),
      tile(11, 10, { ownerId: "player-1", ownershipState: "SETTLED" }),
      tile(11, 11, { ownerId: "player-1", ownershipState: "FRONTIER" })
    ];
    const target = candidates[0]!;
    const tiles = new Map(candidates.map((candidate) => [`${candidate.x},${candidate.y}`, candidate]));

    const evaluation = evaluateSettlementCandidate("player-1", target, tiles);

    expect(evaluation.townSupportNeed).toBeGreaterThan(0);
    expect(evaluation.strategic).toBe(true);
    expect(evaluation.supportsImmediatePlan).toBe(true);
  });
});
