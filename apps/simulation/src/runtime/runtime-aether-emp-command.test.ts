import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildAiOpponent, buildPlayer, collectEvents } from "./runtime.test-helpers.js";

// AETHER_EMP (Manifest plan §7 item 6): disables a hostile empire's Ambaric
// Transformers (AETHER_TOWER) within AETHER_EMP_RADIUS of the target tile,
// which knocks out power to anything that depends on that Tower too.
describe("AETHER_EMP", () => {
  const baseState = (): Array<Record<string, unknown>> => [
    { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" } },
    // §5.4: CRYSTAL supply so player-1's Observatory isn't dormant.
    { x: 1, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
    // Target: an enemy tile within the caster's observatory range.
    { x: 3, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
    // The enemy's Ambaric Transformer, close enough to the target to be struck.
    { x: 4, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", economicStructure: { ownerId: "player-2", type: "AETHER_TOWER", status: "active" } },
    // An enemy Airport that only works because that Transformer powers it.
    { x: 4, y: 1, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", economicStructure: { ownerId: "player-2", type: "AIRPORT", status: "active" } }
  ];

  it("disables the target empire's Ambaric Transformer in range and cascades to what it powers", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set<string>(["cryptography"]), strategicResources: { CRYSTAL: 500 } })],
        ["player-2", buildAiOpponent()]
      ]),
      initialState: { tiles: baseState() as never, activeLocks: [] }
    });
    const events = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "emp-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "AETHER_EMP",
      payloadJson: JSON.stringify({ x: 3, y: 0 })
    });
    await Promise.resolve();

    expect(events.some((event) => event.eventType === "COMMAND_REJECTED")).toBe(false);
    expect(events.some((event) => event.eventType === "COMMAND_RESOLVED" && event.commandId === "emp-1")).toBe(true);

    const state = runtime.exportState();
    const towerTile = state.tiles.find((tile) => tile.x === 4 && tile.y === 0);
    const tower = JSON.parse(towerTile!.economicStructureJson!) as { disabledUntil?: number };
    expect(tower.disabledUntil).toBe(1_000 + 15 * 60_000);
  });

  it("rejects without the Counterphase Core Module", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: 5_000, manpower: 10_000, strategicResources: { CRYSTAL: 500 } })],
        ["player-2", buildAiOpponent()]
      ]),
      initialState: { tiles: baseState() as never, activeLocks: [] }
    });
    const events = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "emp-2",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "AETHER_EMP",
      payloadJson: JSON.stringify({ x: 3, y: 0 })
    });
    await Promise.resolve();

    expect(events).toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "emp-2",
      code: "AETHER_EMP_INVALID",
      message: "requires Counterphase Core Module"
    }));
  });
});
