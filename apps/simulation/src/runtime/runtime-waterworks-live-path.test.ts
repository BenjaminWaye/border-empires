import { describe, expect, it } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";

// Regression coverage for the live tile-collect / tile-delta path: the
// Waterworks +100% radius boost is correctly modeled in buildTileYieldView
// (see tile-yield-view.test.ts) and wired through periodic upkeep accrual,
// but SimulationRuntime.collectTileYield() and tileDeltaFromState() build
// their own `resolvedContext` and used to forget to forward
// `resolvedContext.waterworksKeys` into buildTileYieldView's options,
// silently dropping the boost for real player collection/broadcast.

const makePlayer = (id: string) => ({
  id,
  isAi: false,
  points: 0,
  manpower: 0,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

const buildRuntime = (includeWaterworks: boolean, now: () => number) =>
  new SimulationRuntime({
    now,
    initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
    initialState: {
      tiles: [
        {
          x: 5,
          y: 5,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          resource: "FARM",
          economicStructure: { type: "FARMSTEAD", status: "active", ownerId: "player-1" }
        },
        ...(includeWaterworks
          ? [
              {
                x: 10,
                y: 5,
                terrain: "LAND" as const,
                ownerId: "player-1",
                ownershipState: "SETTLED" as const,
                economicStructure: { type: "WATERWORKS" as const, status: "active" as const, ownerId: "player-1" }
              }
            ]
          : [])
      ],
      activeLocks: [],
      tileYieldCollectedAtByTile: [{ tileKey: "5,5", collectedAt: 0 }]
    }
  });

describe("waterworks live path (collectTileYield / tileDeltaFromState)", () => {
  it("collecting a farmstead FARM tile credits no FOOD regardless of Waterworks radius (§5.4: slot-based, not yield-based)", async () => {
    const oneHourMs = 60 * 60_000;
    const withoutWaterworks = buildRuntime(false, () => oneHourMs);
    const withWaterworks = buildRuntime(true, () => oneHourMs);

    const collect = async (runtime: SimulationRuntime, commandId: string): Promise<number> => {
      const seen: SimulationEvent[] = [];
      runtime.onEvent((event) => seen.push(event));
      runtime.submitCommand({
        commandId,
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: oneHourMs,
        type: "COLLECT_TILE",
        payloadJson: JSON.stringify({ x: 5, y: 5 })
      });
      await Promise.resolve();
      const result = seen.find(
        (event): event is Extract<SimulationEvent, { eventType: "COLLECT_RESULT" }> => event.eventType === "COLLECT_RESULT"
      );
      return result?.strategic.FOOD ?? 0;
    };

    const baseFood = await collect(withoutWaterworks, "collect-base");
    const boostedFood = await collect(withWaterworks, "collect-boosted");

    expect(baseFood).toBe(0);
    expect(boostedFood).toBe(0);
  });

  it("tileDeltaFromState (the live tile-delta broadcast path) reports no FOOD rate regardless of Waterworks (§5.4: slot-based, not yield-based)", () => {
    const oneHourMs = 60 * 60_000;
    const withoutWaterworks = buildRuntime(false, () => oneHourMs);
    const withWaterworks = buildRuntime(true, () => oneHourMs);

    const deltaYieldStrategicFood = (runtime: SimulationRuntime): number | undefined => {
      const internal = runtime as unknown as {
        state: { tiles: Map<string, { x: number; y: number }> };
        tileDeltaFromState(tile: { x: number; y: number }): { yield?: { strategic?: Partial<Record<string, number>> } };
      };
      const tile = internal.state.tiles.get("5,5")!;
      return internal.tileDeltaFromState(tile).yield?.strategic?.FOOD;
    };

    const baseFood = deltaYieldStrategicFood(withoutWaterworks);
    const boostedFood = deltaYieldStrategicFood(withWaterworks);
    expect(baseFood).toBeUndefined();
    expect(boostedFood).toBeUndefined();
  });
});
