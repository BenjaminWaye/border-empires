import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer } from "./runtime.test-helpers.js";

// The Iron Levy monument: converts 50% of banked manpower into an instant
// muster at the anchor tile, then freezes empire-wide manpower regen for 2
// hours. Same test-harness shape as runtime-imperial-exchange-levy.test.ts
// (split out for the same 500-line soft-cap reason).
describe("The Iron Levy muster ability", () => {
  const buildLevyRuntime = (options: { omitTower?: boolean; manpower?: number } = {}): SimulationRuntime => {
    const tiles: Array<Record<string, unknown>> = [
      {
        x: 0,
        y: 0,
        terrain: "LAND",
        ownerId: "player-1",
        ownershipState: "SETTLED",
        economicStructure: { ownerId: "player-1", type: "IRON_LEVY", status: "active" }
      },
      { x: 3, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
      { x: 4, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" }
    ];
    if (!options.omitTower) {
      tiles.push({
        x: 1,
        y: 0,
        terrain: "LAND",
        ownerId: "player-1",
        ownershipState: "SETTLED",
        economicStructure: { ownerId: "player-1", type: "AETHER_TOWER", status: "active" }
      });
    }
    const players = new Map<string, Record<string, unknown>>();
    players.set(
      "player-1",
      buildPlayer("player-1", {
        points: 10_000,
        manpower: options.manpower ?? 10_000,
        techIds: new Set<string>()
      })
    );
    return new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: players as never,
      initialState: { tiles: tiles as never, activeLocks: [] }
    });
  };

  it("converts 50% of banked manpower into a muster at the anchor tile and freezes regen", async () => {
    const runtime = buildLevyRuntime({ manpower: 10_000 });
    const beforeManpower = runtime.exportState().players.find((p) => p.id === "player-1")?.manpower ?? 0;
    expect(beforeManpower).toBeGreaterThan(0);
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "levy-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "IRON_LEVY_MUSTER",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0 })
    });
    await Promise.resolve();

    expect(events).not.toContainEqual(expect.objectContaining({ eventType: "COMMAND_REJECTED" }));
    const player = runtime.exportState().players.find((p) => p.id === "player-1");
    const expectedConverted = Math.floor(beforeManpower * 0.5);
    expect(player?.manpower).toBe(beforeManpower - expectedConverted);
    const tile = runtime.exportState().tiles.find((t) => t.x === 0 && t.y === 0);
    expect(tile?.musterJson).toContain(`"amount":${expectedConverted}`);
    // Manpower regen is frozen -- a second levy attempt right away should
    // reject rather than converting an already-zeroed-out pool again.
    runtime.submitCommand({
      commandId: "levy-2",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "IRON_LEVY_MUSTER",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0 })
    });
    await Promise.resolve();
    expect(events).toContainEqual(expect.objectContaining({ eventType: "COMMAND_REJECTED", commandId: "levy-2" }));
  });

  it("rejects without a powering Aether Tower", async () => {
    const runtime = buildLevyRuntime({ omitTower: true });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "levy-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "IRON_LEVY_MUSTER",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0 })
    });
    await Promise.resolve();
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "levy-1",
      code: "IRON_LEVY_MUSTER_INVALID",
      message: "Iron Levy requires a nearby Aether Tower"
    }));
  });

  it("rejects when there is no banked manpower to levy", async () => {
    const runtime = buildLevyRuntime({ manpower: 0 });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "levy-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "IRON_LEVY_MUSTER",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0 })
    });
    await Promise.resolve();
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "levy-1",
      code: "IRON_LEVY_MUSTER_INVALID",
      message: "not enough banked manpower to levy"
    }));
  });
});
