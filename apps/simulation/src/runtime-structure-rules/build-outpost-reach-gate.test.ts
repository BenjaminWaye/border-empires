import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "../runtime/runtime.js";

/**
 * Fixed-border reach regression coverage (docs/agents pointer: reach only
 * gates SETTLE and outpost-family builds now, not EXPAND — see
 * runtime.ts's SETTLE gate and runtime-structure-command-handlers.ts's
 * OUT_OF_REACH build gate).
 */
describe("fixed-border reach — SETTLE and outpost builds stay gated", () => {
  const buildPlayer = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: "player-1",
    isAi: false,
    points: 50_000,
    manpower: 10_000,
    techIds: new Set<string>(["leatherworking"]),
    domainIds: new Set<string>(),
    mods: { attack: 1, defense: 1, income: 1, vision: 1 },
    techRootId: "rewrite-local",
    allies: new Set<string>(),
    strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 500, SHARD: 0 },
    ...overrides
  });

  it("still rejects SETTLE on an out-of-reach frontier tile", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", buildPlayer()]]),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "MARKET", populationTier: "CITY" } },
          // Far outside TOWN_REACH_RADIUS (3) — never granted to the reach border.
          { x: 20, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));

    runtime.submitCommand({
      commandId: "settle-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SETTLE",
      payloadJson: JSON.stringify({ x: 20, y: 10 })
    });
    await Promise.resolve();

    expect(events).toContainEqual(
      expect.objectContaining({ eventType: "COMMAND_REJECTED", commandId: "settle-1", code: "OUT_OF_REACH" })
    );
  });

  it("rejects building a siege outpost on an out-of-reach frontier tile", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", buildPlayer()]]),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "MARKET", populationTier: "CITY" } },
          // Far outside TOWN_REACH_RADIUS (3) — never granted to the reach
          // border. Outposts skip the SETTLED requirement, so without the
          // OUT_OF_REACH gate this FRONTIER tile would otherwise be
          // buildable directly, leapfrogging reach. A resource tile so
          // structureShowsOnTile's "resource" visibility rule is satisfied
          // on FRONTIER ground (SIEGE_OUTPOST otherwise only shows on
          // settled/town/support/dock tiles).
          { x: 20, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", resource: "IRON" }
        ],
        activeLocks: []
      }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));

    runtime.submitCommand({
      commandId: "build-outpost-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "BUILD_STRUCTURE" as any,
      payloadJson: JSON.stringify({ x: 20, y: 10, structureType: "SIEGE_OUTPOST" })
    });
    await Promise.resolve();

    expect(events).toContainEqual(
      expect.objectContaining({ eventType: "COMMAND_REJECTED", commandId: "build-outpost-1", code: "OUT_OF_REACH" })
    );
  });
});
