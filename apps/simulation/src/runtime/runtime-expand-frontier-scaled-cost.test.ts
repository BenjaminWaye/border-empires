import { describe, expect, it } from "vitest";
import { EXPAND_MANPOWER_COST, expandManpowerCostForFrontierCount } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

// EXPAND's manpower price scales with the FRONTIER tiles the player already
// holds (expand-manpower-cost.ts). Before this, a 200-tile frontier paid the
// same flat EXPAND_MANPOWER_COST as a brand-new player.
describe("EXPAND frontier-scaled manpower cost", () => {
  const START_MANPOWER = 200; // below the manpower cap, so regen clamping can't hide the charge
  const TARGET = { x: 11, y: 10 };

  // A contiguous FRONTIER block touching the home town, with the target tile
  // carved out of it so it stays neutral and inside the town's reach.
  const frontierBlock = (): DomainTileState[] => {
    const tiles: DomainTileState[] = [];
    for (let y = 10; y <= 20; y += 1) {
      for (let x = 0; x < 20; x += 1) {
        if (x === TARGET.x && y === TARGET.y) continue;
        tiles.push({ x, y, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" });
      }
    }
    return tiles;
  };

  const buildRuntime = (frontierTiles: DomainTileState[]) =>
    new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: () => undefined,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: 10_000, manpower: START_MANPOWER, manpowerUpdatedAt: 1_000 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          ...frontierTiles,
          { x: 10, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: TARGET.x, y: TARGET.y, terrain: "LAND" }
        ],
        activeLocks: []
      }
    });

  const latestPlayerUpdate = (seen: SimulationEvent[]): { manpower: number; expandManpowerCost: number } =>
    JSON.parse(
      seen.findLast(
        (event): event is Extract<SimulationEvent, { eventType: "PLAYER_MESSAGE" }> =>
          event.eventType === "PLAYER_MESSAGE" && event.messageType === "PLAYER_UPDATE"
      )!.payloadJson
    ) as { manpower: number; expandManpowerCost: number };

  const submitExpand = (runtime: SimulationRuntime): void => {
    runtime.submitCommand({
      commandId: "expand-scaled-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: TARGET.x, toY: TARGET.y })
    });
  };

  it("charges the scaled price once the player holds 200+ frontier tiles", async () => {
    const block = frontierBlock();
    const expectedCost = expandManpowerCostForFrontierCount(block.length);
    expect(block.length).toBeGreaterThanOrEqual(200);
    expect(expectedCost).toBeGreaterThan(EXPAND_MANPOWER_COST);

    const runtime = buildRuntime(block);
    const seen = collectEvents(runtime);
    submitExpand(runtime);
    await Promise.resolve();

    expect(seen.map((event) => event.eventType)).toContain("COMMAND_ACCEPTED");
    const update = latestPlayerUpdate(seen);
    expect(update.manpower).toBe(START_MANPOWER - expectedCost);
    expect(update.expandManpowerCost).toBe(expectedCost);
  });

  it("rejects the claim when manpower covers the base price but not the scaled one", async () => {
    const block = frontierBlock();
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: () => undefined,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: 10_000, manpower: EXPAND_MANPOWER_COST, manpowerUpdatedAt: 1_000 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          ...block,
          { x: 10, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: TARGET.x, y: TARGET.y, terrain: "LAND" }
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);
    submitExpand(runtime);
    await Promise.resolve();

    const rejected = seen.find(
      (event): event is Extract<SimulationEvent, { eventType: "COMMAND_REJECTED" }> => event.eventType === "COMMAND_REJECTED"
    );
    expect(rejected?.code).toBe("INSUFFICIENT_MANPOWER");
  });
});
