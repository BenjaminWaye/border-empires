import { describe, expect, it } from "vitest";
import { frontierClaimDurationMsAt } from "@border-empires/shared";
import { SimulationRuntime } from "./runtime.js";
import { garrisonVeteranSeedPlayers } from "./runtime.test-helpers.js";
import { afcModuleFixtureTile } from "../afc-test-fixture/afc-test-fixture.js";

// Regression: cancelling a garrison used to leave the "garrison + build" claim
// continuation registered, so the next time the tile was garrisoned the build
// the player had abandoned went up anyway.
describe("CANCEL_SETTLE with a queued build", () => {
  it("cancels the build queued behind the garrison, so a later garrison builds nothing", async () => {
    const scheduledTasks: Array<{ delayMs: number; task: () => void }> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (delayMs, task) => { scheduledTasks.push({ delayMs, task }); },
      initialPlayers: garrisonVeteranSeedPlayers(),
      initialState: {
        tiles: [afcModuleFixtureTile("player-1"),
          { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });
    const submit = (commandId: string, clientSeq: number, type: string, payload: object): void => runtime.submitCommand({
      commandId, sessionId: "session-1", playerId: "player-1", clientSeq, issuedAt: 1_000, type: type as never, payloadJson: JSON.stringify(payload)
    });

    submit("continuation", 1, "CLAIM_CONTINUATION_SET", { x: 10, y: 10, structureType: "RELAY_BEACON" });
    await Promise.resolve();
    expect(runtime.exportState().pendingSettlements).toHaveLength(1);

    submit("cancel", 2, "CANCEL_SETTLE", { x: 10, y: 10 });
    await Promise.resolve();
    expect(runtime.exportState().pendingSettlements).toHaveLength(0);

    submit("settle-again", 3, "SETTLE", { x: 10, y: 10 });
    await Promise.resolve();
    const settleDelay = frontierClaimDurationMsAt(10, 10);
    const resolutions = scheduledTasks.filter((t) => t.delayMs === settleDelay);
    expect(resolutions.length).toBeGreaterThan(0);
    resolutions[resolutions.length - 1]!.task();
    await Promise.resolve();

    const tile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
    expect(tile?.ownershipState).toBe("SETTLED");
    expect(tile?.economicStructureJson).toBeFalsy();
  });
});
