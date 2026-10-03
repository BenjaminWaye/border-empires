import { describe, expect, it, vi } from "vitest";
import { repairPlayerInfrastructure } from "./repair-player-infrastructure.js";
import { SimulationRuntime } from "../runtime/runtime.js";
import type { DomainTileState } from "@border-empires/game-domain";

const identities = () => new Map([
  ["ai-1", { id: "ai-1", isAi: true }],
  ["human", { id: "human", isAi: false }]
]);

describe("AI AFC infrastructure repair", () => {
  it("grants an AFC without login even when income repair is skipped", () => {
    const tiles: DomainTileState[] = [];
    for (let x = 0; x < 40; x++) {
      for (let y = 0; y < 40; y++) tiles.push({ x, y, terrain: "LAND" });
    }
    tiles.push({ x: 15, y: 15, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" });
    const runtime = new SimulationRuntime({
      now: () => 1000,
      initialPlayers: new Map([["ai-1", {
        id: "ai-1", isAi: true, points: 1000, manpower: 1000,
        techIds: new Set<string>(), domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        techRootId: "rewrite-local", allies: new Set<string>()
      }]]),
      initialState: { tiles, activeLocks: [] }
    });
    repairPlayerInfrastructure(runtime, identities());
    const afcs = () => runtime.exportState().tiles.filter((tile) => tile.ownerId === "ai-1" && tile.afcJson);
    expect(afcs()).toHaveLength(1);
    repairPlayerInfrastructure(runtime, identities());
    expect(afcs()).toHaveLength(1);
  });

  it("also migrates AI identities recovered by income repair before autopilot starts", () => {
    const activePlayers = identities();
    const runtime = {
      repairZeroGrossIncomeSettlements: vi.fn(() => ({ repairedPlayerIds: [], aiPlayerIds: ["ai-6"] })),
      ensurePlayerHasAfc: vi.fn(() => true)
    };
    repairPlayerInfrastructure(runtime, activePlayers, ["ai-6"]);
    expect(activePlayers.get("ai-6")).toEqual({ id: "ai-6", isAi: true });
    expect(runtime.ensurePlayerHasAfc.mock.calls).toEqual([["ai-1"], ["ai-6"]]);
  });
});
