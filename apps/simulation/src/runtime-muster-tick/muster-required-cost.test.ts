import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import { SimulationRuntime } from "../runtime/runtime.js";
import { FRONTIER_ATTACK_MUSTER_COST, MUSTER_ATTACK_COST, requiredMusterForFort } from "@border-empires/shared";
import { simulationTileKey } from "../seed-state/seed-state.js";

const FORT_ATTACK_MUSTER_COST = requiredMusterForFort("FORT");

const makePlayer = (id: string, manpower: number, defenseMod = 1) => ({
  id,
  isAi: false,
  points: 10_000,
  manpower,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: defenseMod, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

describe("required muster for fort targets", () => {
  it("required muster is a flat per-fort-tier floor (SETTLED target only — forts on FRONTIER targets never raise the cost)", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1", 999)]]),
      initialState: {
        tiles: [
          {
            x: 10, y: 11,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            fort: { ownerId: "player-1", status: "active", variant: "FORT" }
          }
        ],
        activeLocks: []
      }
    });

    const internalTile = (tile: SimulationRuntime) =>
      (tile as unknown as { state: { tiles: Map<string, unknown> } }).state.tiles.get(simulationTileKey(10, 11));

    const required = (rt: SimulationRuntime): number =>
      (rt as unknown as { requiredMusterForTarget(t: unknown): number })
        .requiredMusterForTarget(internalTile(rt));

    expect(required(runtime)).toBe(FORT_ATTACK_MUSTER_COST);
  });

  it("a fort built on a FRONTIER (un-settled) target never raises required muster above FRONTIER_ATTACK_MUSTER_COST — forts only defend once SETTLED", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1", 999)]]),
      initialState: {
        tiles: [
          {
            x: 10, y: 11,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "FRONTIER",
            fort: { ownerId: "player-1", status: "active", variant: "FORT" }
          }
        ],
        activeLocks: []
      }
    });
    const internalTile = (tile: SimulationRuntime) =>
      (tile as unknown as { state: { tiles: Map<string, unknown> } }).state.tiles.get(simulationTileKey(10, 11));
    const required = (rt: SimulationRuntime): number =>
      (rt as unknown as { requiredMusterForTarget(t: unknown): number })
        .requiredMusterForTarget(internalTile(rt));
    expect(required(runtime)).toBe(FRONTIER_ATTACK_MUSTER_COST);
  });

  it("consumeOriginMuster spends the attack cost from the origin tile's staged muster and floors at zero", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1", 999)]]),
      initialState: {
        tiles: [
          {
            x: 5, y: 5,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            muster: { ownerId: "player-1", amount: 100, mode: "HOLD", updatedAt: 1_000 }
          }
        ],
        activeLocks: []
      }
    });

    const musterAmount = (): number | undefined => {
      const tile = runtime.exportState().tiles.find((t) => t.x === 5 && t.y === 5);
      if (!tile?.musterJson) return undefined;
      const m = JSON.parse(tile.musterJson) as { amount?: number };
      return m.amount;
    };

    const consume = (originKey: string, playerId: string, amount: number) =>
      (runtime as unknown as { consumeOriginMuster(originKey: string, playerId: string, amount: number): void })
        .consumeOriginMuster(originKey, playerId, amount);

    expect(musterAmount()).toBe(100);

    // Spending less than the staged amount reduces it by exactly that amount.
    consume(simulationTileKey(5, 5), "player-1", MUSTER_ATTACK_COST);
    expect(musterAmount()).toBe(100 - MUSTER_ATTACK_COST);

    // Over-spending floors at zero rather than going negative.
    consume(simulationTileKey(5, 5), "player-1", 100_000);
    expect(musterAmount()).toBe(0);

    // A mismatched owner is a no-op (guards against cross-player muster theft).
    consume(simulationTileKey(5, 5), "player-2", 10);
    expect(musterAmount()).toBe(0);
  });
});
