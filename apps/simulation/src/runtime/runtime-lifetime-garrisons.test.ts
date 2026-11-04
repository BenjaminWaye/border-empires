import { describe, expect, it } from "vitest";
import { DEFAULT_AUTO_SETTLE_PREFS } from "@border-empires/shared";

import { applySimulationEventsToRecoveredState } from "../event-recovery/event-recovery.js";
import { SimulationRuntime } from "./runtime.js";

// DomainPlayer.lifetimeGarrisons drives "first 10 garrisons are instant"; it
// must survive every way a player record is saved and restored.
describe("lifetime garrison counter persistence", () => {
  it("round-trips through a snapshot restore and export", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      seedTiles: new Map(),
      initialState: {
        tiles: [],
        activeLocks: [],
        players: [
          { id: "veteran", isAi: false, points: 0, manpower: 100, techIds: [], domainIds: [], allies: [], autoSettle: { ...DEFAULT_AUTO_SETTLE_PREFS }, lifetimeGarrisons: 7 },
          { id: "legacy", isAi: false, points: 0, manpower: 100, techIds: [], domainIds: [], allies: [], autoSettle: { ...DEFAULT_AUTO_SETTLE_PREFS } }
        ]
      }
    });
    const exported = runtime.exportState().players;
    expect(exported.find((player) => player.id === "veteran")?.lifetimeGarrisons).toBe(7);
    // A record saved before the counter existed reads as 0 (no garrisons yet).
    expect(exported.find((player) => player.id === "legacy")?.lifetimeGarrisons).toBeUndefined();
  });

  it("replays SETTLEMENT_STARTED events onto the checkpointed counter", () => {
    const settlementStarted = (n: number) => ({
      eventType: "SETTLEMENT_STARTED" as const,
      commandId: `settle-${n}`,
      playerId: "player-1",
      tileKey: `${n},0`,
      startedAt: 1_000,
      resolvesAt: 1_000,
      goldCost: 0
    });
    const recovered = applySimulationEventsToRecoveredState(
      {
        tiles: [],
        activeLocks: [],
        players: [{ id: "player-1", lifetimeGarrisons: 3 }, { id: "fresh" }],
        pendingSettlements: [],
        playerYieldCollectionEpochByPlayer: []
      },
      [settlementStarted(1), settlementStarted(2), { ...settlementStarted(3), playerId: "fresh" }]
    );
    expect(recovered.players?.find((player) => player.id === "player-1")?.lifetimeGarrisons).toBe(5);
    expect(recovered.players?.find((player) => player.id === "fresh")?.lifetimeGarrisons).toBe(1);
  });
});
