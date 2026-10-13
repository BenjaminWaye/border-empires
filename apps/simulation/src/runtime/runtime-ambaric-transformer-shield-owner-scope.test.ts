import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

// An enemy Aether Tower (Observatory) shields only its OWNER's tiles, and the
// simulation enforces it against every tile-targeted Aether ability using
// full world state — a tower the caster can't see still blocks. Before this,
// only Aether Purge was checked server-side; Aether Bridge and terrain
// shaping went through regardless, and the client (which can only check
// towers it can see) was the only gate.
const P1_TOWER = { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" } };
// §5.4: CRYSTAL supply so neither player's tower is resource-slot dormant.
const P1_GEMS = { x: 30, y: 30, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" };
const P2_GEMS = { x: 31, y: 31, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", resource: "GEMS" };

const buildRuntime = (tiles: Array<Record<string, unknown>>, techIds: string[]) =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      ["player-1", buildPlayer("player-1", { points: 20_000, manpower: 10_000, techIds: new Set<string>(techIds), strategicResources: { CRYSTAL: 2_000 } })],
      ["player-2", buildPlayer("player-2", { points: 20_000, manpower: 10_000 })],
      ["player-3", buildPlayer("player-3", { points: 20_000, manpower: 10_000 })]
    ]),
    initialState: { tiles: tiles as never, activeLocks: [] }
  });

const submit = async (runtime: SimulationRuntime, type: string, x: number, y: number): Promise<void> => {
  runtime.submitCommand({ commandId: "cmd-1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000, type, payloadJson: JSON.stringify({ x, y }) } as never);
  await Promise.resolve();
};

describe("Aether Tower protection is owner-scoped and enforced server-side", () => {
  it("rejects an Aether Bridge landing on hostile land shielded by its owner's tower", async () => {
    const runtime = buildRuntime(
      [
        P1_TOWER,
        { x: 0, y: 1, terrain: "SEA" },
        { x: 0, y: 2, terrain: "SEA" },
        { x: 0, y: 3, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
        { x: 1, y: 4, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", observatory: { ownerId: "player-2", status: "active" } },
        P1_GEMS,
        P2_GEMS
      ],
      ["navigation"]
    );
    const events = collectEvents(runtime);
    await submit(runtime, "CAST_AETHER_BRIDGE", 0, 3);
    expect(events).toContainEqual(expect.objectContaining({ eventType: "COMMAND_REJECTED", code: "AETHER_BRIDGE_INVALID", message: "landing blocked by an Aether Tower" }));
  });

  it("lets an Aether Bridge land on unowned land even right next to an enemy tower", async () => {
    const runtime = buildRuntime(
      [
        P1_TOWER,
        { x: 0, y: 1, terrain: "SEA" },
        { x: 0, y: 2, terrain: "SEA" },
        { x: 0, y: 3, terrain: "LAND" },
        { x: 1, y: 4, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", observatory: { ownerId: "player-2", status: "active" } },
        P1_GEMS,
        P2_GEMS
      ],
      ["navigation"]
    );
    const events = collectEvents(runtime);
    await submit(runtime, "CAST_AETHER_BRIDGE", 0, 3);
    expect(events).toContainEqual(expect.objectContaining({ eventType: "COMMAND_RESOLVED", commandId: "cmd-1" }));
  });

  it("does not let one player's tower shield a third player's land from Aether Purge", async () => {
    const runtime = buildRuntime(
      [
        P1_TOWER,
        { x: 5, y: 0, terrain: "LAND", ownerId: "player-3", ownershipState: "SETTLED" },
        { x: 6, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", observatory: { ownerId: "player-2", status: "active" } },
        P1_GEMS,
        P2_GEMS
      ],
      ["crystal-lattices"]
    );
    const events = collectEvents(runtime);
    await submit(runtime, "AETHER_LANCE", 5, 0);
    expect(events).toContainEqual(expect.objectContaining({ eventType: "COMMAND_RESOLVED", commandId: "cmd-1" }));
  });

  it("rejects Create Mountain on hostile land shielded by its owner's tower", async () => {
    const runtime = buildRuntime(
      [
        P1_TOWER,
        { x: 1, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 2, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
        { x: 8, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", observatory: { ownerId: "player-2", status: "active" } },
        P1_GEMS,
        P2_GEMS
      ],
      ["terrain-engineering"]
    );
    const events = collectEvents(runtime);
    await submit(runtime, "CREATE_MOUNTAIN", 2, 0);
    expect(events).toContainEqual(expect.objectContaining({ eventType: "COMMAND_REJECTED", code: "CREATE_MOUNTAIN_INVALID", message: "blocked by an Aether Tower" }));
    expect(runtime.exportState().tiles.find((tile) => tile.x === 2 && tile.y === 0)?.terrain).toBe("LAND");
  });
});
