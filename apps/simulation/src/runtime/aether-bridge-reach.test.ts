import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

// Covers the Aether Bridge reach bonus: an active bridge grants a one-shot
// AETHER_BRIDGE_REACH_RADIUS (3) reach anchor around the tile it lands on,
// so players can EXPAND into the surrounding land and build a relay beacon
// there. See packages/shared/src/reach/reach.ts and
// SimulationRuntime.grantAetherBridgeReach. Asserts directly against
// reachTileKeysForPlayer rather than chaining EXPAND commands, since a
// claimed EXPAND target only becomes an owned, further-EXPAND-capable origin
// once its frontier-claim timer resolves (a separate concern from reach).
describe("aether bridge reach bonus", () => {
  it("grants reach in a radius around the bridge landing tile, not just the tile itself", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "player-1",
          buildPlayer("player-1", { points: 20_000, manpower: 10_000, techIds: new Set<string>(["navigation", "harborcraft"]), strategicResources: { CRYSTAL: 2_000 } })
        ]
      ]),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" }, town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 0, y: 1, terrain: "SEA" },
          { x: 0, y: 2, terrain: "SEA" },
          { x: 0, y: 3, terrain: "LAND" },
          // §5.4: CRYSTAL supply so the Observatory isn't dormant.
          { x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" }
        ],
        activeLocks: []
      }
    });
    const events = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "bridge-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "CAST_AETHER_BRIDGE",
      payloadJson: JSON.stringify({ x: 0, y: 3 })
    });

    await Promise.resolve();

    expect(events.some((e) => e.eventType === "COMMAND_RESOLVED" && e.commandId === "bridge-1")).toBe(true);

    const reach = new Set(runtime.reachTileKeysForPlayer("player-1"));
    // Landing tile itself, and land within the radius-3 bonus disk beyond
    // player-1's own TOWN_REACH_RADIUS (3 from (0,0), i.e. up to y=3).
    expect(reach.has("0,3")).toBe(true);
    expect(reach.has("0,6")).toBe(true);
    // Outside the radius-3 bonus disk (distance 4 from the landing tile).
    expect(reach.has("0,7")).toBe(false);
  });

  it("keeps the granted reach after the bridge itself expires", async () => {
    let clock = 1_000;
    const runtime = new SimulationRuntime({
      now: () => clock,
      initialPlayers: new Map([
        [
          "player-1",
          buildPlayer("player-1", { points: 20_000, manpower: 10_000, techIds: new Set<string>(["navigation", "harborcraft"]), strategicResources: { CRYSTAL: 2_000 } })
        ]
      ]),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" }, town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 0, y: 1, terrain: "SEA" },
          { x: 0, y: 2, terrain: "SEA" },
          { x: 0, y: 3, terrain: "LAND" },
          { x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" }
        ],
        activeLocks: []
      }
    });
    const events = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "bridge-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "CAST_AETHER_BRIDGE",
      payloadJson: JSON.stringify({ x: 0, y: 3 })
    });

    await Promise.resolve();

    expect(events.some((e) => e.eventType === "COMMAND_RESOLVED" && e.commandId === "bridge-1")).toBe(true);
    expect(runtime.reachTileKeysForPlayer("player-1")).toContain("0,6");

    clock = 1_000_000_000; // well past AETHER_BRIDGE_DURATION_MS -- bridge itself is now expired

    // The granted reach is sticky (one-shot land grab, not tied to the
    // bridge's active window) -- it does not retreat just because the
    // bridge expired.
    expect(runtime.reachTileKeysForPlayer("player-1")).toContain("0,6");
  });

  it("grants no reach bonus when the bridge lands inside another player's existing border", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "player-1",
          buildPlayer("player-1", { points: 20_000, manpower: 10_000, techIds: new Set<string>(["navigation", "harborcraft"]), strategicResources: { CRYSTAL: 2_000 } })
        ],
        [
          "player-2",
          buildPlayer("player-2", { points: 20_000, manpower: 10_000 })
        ]
      ]),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" }, town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 0, y: 1, terrain: "SEA" },
          { x: 0, y: 2, terrain: "SEA" },
          // Bridge lands on player-2's own settled coastal town, well inside
          // their border -- casting here should only open an attack lane,
          // not hand player-1 free reach into player-2's territory.
          { x: 0, y: 3, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { name: "Rival", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" }
        ],
        activeLocks: []
      }
    });
    const events = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "bridge-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "CAST_AETHER_BRIDGE",
      payloadJson: JSON.stringify({ x: 0, y: 3 })
    });

    await Promise.resolve();

    expect(events.some((e) => e.eventType === "COMMAND_RESOLVED" && e.commandId === "bridge-1")).toBe(true);

    // (0,4) is outside player-1's own TOWN_REACH_RADIUS (distance 4 from
    // (0,0)) and would only be reachable via the bridge bonus -- which must
    // NOT have been granted, since the bridge landed on player-2's ground.
    const reach = new Set(runtime.reachTileKeysForPlayer("player-1"));
    expect(reach.has("0,4")).toBe(false);
    expect(reach.has("0,6")).toBe(false);
  });
});
