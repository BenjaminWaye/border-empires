import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer } from "../runtime/runtime.test-helpers.js";
import { computeSeasonVictory } from "./season-victory-objectives.js";

function diplomaticObjective(upgraded: boolean, tied = false) {
  const players = new Map([
    ["large", buildPlayer("large", { allies: new Set(["small"]), domainIds: new Set() })],
    ["small", buildPlayer("small", { allies: new Set(["large"]), domainIds: new Set(upgraded ? ["afc-chancery-5"] : []) })]
  ]);
  const tiles = Array.from({ length: 10 }, (_, x) => ({ x, y: 0, terrain: "LAND" as const,
    ...(x < 3 ? { ownerId: "large", ownershipState: "SETTLED" as const } : x < (tied ? 6 : 5) ? { ownerId: "small", ownershipState: "SETTLED" as const } : {}) }));
  const runtime = new SimulationRuntime({ seedTiles: new Map(), initialPlayers: players, initialState: { tiles, activeLocks: [] } });
  const state = runtime.exportState();
  const board = ["large", "small"].map((id, index) => ({ id, name: id, tiles: index === 0 || tied ? 3 : 2, incomePerMinute: 0, techs: 0, score: 0, rank: index + 1 }));
  const result = computeSeasonVictory(state.tiles, board, state.players);
  return { objective: result.objectives.find(item => item.id === "DIPLOMATIC_DOMINANCE"), result };
}

describe("Suzerainty Recognition diplomatic victory", () => {
  it("doubles only the installing member's contribution and gives the actual largest member the win", () => {
    expect(diplomaticObjective(false).objective).toMatchObject({ leaderPlayerId: "large", conditionMet: false, progress: 5 / 7 });
    expect(diplomaticObjective(true).objective).toMatchObject({ leaderPlayerId: "large", conditionMet: true, progress: 1 });
  });
  it("does not give a tied member leadership even when only one has the upgrade", () => {
    expect(diplomaticObjective(true, true).objective).toMatchObject({ conditionMet: false });
    expect(diplomaticObjective(true, true).objective?.leaderPlayerId).toBeUndefined();
  });
});
