import { describe, expect, it, vi } from "vitest";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import { WORLD_WIDTH, WORLD_HEIGHT } from "@border-empires/shared";
import { SimulationRuntime } from "../runtime/runtime.js";
import { makePlayer, waystationTile, townTile, RANDOM_FOR, createInput } from "../runtime-waystation-activation.test-helpers.js";
import { activateWaystationAt } from "../runtime-waystation-activation.js";
import { handleActivateWaystationCommand } from "./waystation-activation-command.js";

const command = (id: string, playerId = "player-1", payload: unknown = { x: 10, y: 10 }): CommandEnvelope => ({
  commandId: id, sessionId: "session-1", playerId, clientSeq: 1, issuedAt: 1000,
  type: "ACTIVATE_WAYSTATION", payloadJson: JSON.stringify(payload)
});

describe("explicit waystation collection", () => {
  it("routes a client command through the runtime, grants once, and retains the result after restart", async () => {
    const runtime = new SimulationRuntime({ now: () => 1000,
      initialPlayers: new Map([["player-1", makePlayer()]]),
      seedTiles: new Map([["10,10", waystationTile()], ["9,10", townTile(9, 10, "player-1")]]), seedDocks: [] });
    const events: Array<{ eventType: string; commandId: string }> = [];
    runtime.onEvent(event => events.push(event));
    const random = vi.spyOn(Math, "random").mockReturnValue(RANDOM_FOR.MANPOWER);
    try {
      runtime.submitCommand(command("collect"));
      await Promise.resolve();
      const first = runtime.exportState();
      const tile = first.tiles.find(t => t.x === 10 && t.y === 10)!;
      expect(JSON.parse(tile.waystationJson!)).toMatchObject({ activated: true, activatedByPlayerId: "player-1", grantedEffect: "MANPOWER" });
      expect(events).toContainEqual(expect.objectContaining({ eventType: "COMMAND_RESOLVED", commandId: "collect" }));
      runtime.submitCommand({ ...command("double-click"), clientSeq: 2 });
      await Promise.resolve();
      expect(events).toContainEqual(expect.objectContaining({ eventType: "COMMAND_REJECTED", commandId: "double-click" }));
      expect(runtime.exportState().players[0]?.manpower).toBe(first.players[0]?.manpower);
      const restarted = new SimulationRuntime({ now: () => 1000, initialState: runtime.exportSnapshotSections().initialState });
      expect(restarted.exportState().tiles.find(t => t.x === 10 && t.y === 10)?.waystationJson).toBe(tile.waystationJson);
    } finally { random.mockRestore(); }
  });

  it.each(["GOLD", "MANPOWER"] as const)("publishes the new %s balance immediately after collection", async effect => {
    const runtime = new SimulationRuntime({ now: () => 1000,
      initialPlayers: new Map([["player-1", makePlayer()]]),
      seedTiles: new Map([["10,10", waystationTile()], ["9,10", townTile(9, 10, "player-1")]]), seedDocks: [] });
    const events: SimulationEvent[] = [];
    runtime.onEvent(event => events.push(event));
    const random = vi.spyOn(Math, "random").mockReturnValue(RANDOM_FOR[effect]);
    try {
      runtime.submitCommand(command("collect-balance"));
      await Promise.resolve();
      const player = runtime.exportState().players.find(player => player.id === "player-1")!;
      const updates = events.filter(event => event.eventType === "PLAYER_MESSAGE" && event.commandId === "collect-balance")
        .map(event => JSON.parse(event.payloadJson ?? "{}"));
      expect(updates).toContainEqual(expect.objectContaining({ type: "PLAYER_UPDATE", gold: player.points, manpower: player.manpower }));
    } finally { random.mockRestore(); }
  });

  it.each([
    ["neutral", undefined, true], ["rival", "other", true], ["fogged", "player-1", false]
  ])("rejects collection of a %s site without touching its reward", (_label, ownerId, visible) => {
    const tiles = new Map([["10,10", waystationTile({ ownerId })]]);
    const emitEvent = vi.fn();
    const activate = vi.fn();
    handleActivateWaystationCommand({ tiles, visibilityCoverage: { isVisible: () => visible }, emitEvent, emitPlayerStateUpdate: vi.fn() }, command("blocked"), activate);
    expect(activate).not.toHaveBeenCalled();
    expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "COMMAND_REJECTED" }));
    expect(tiles.get("10,10")?.waystation?.activated).toBe(false);
  });

  it.each([{ x: -1, y: 10 }, { x: WORLD_WIDTH, y: 10 }, { x: 10, y: WORLD_HEIGHT }, { x: 1.5, y: 10 }, { x: null, y: 10 }])("rejects invalid coordinates %j", payload => {
    const emitEvent = vi.fn();
    const activate = vi.fn();
    handleActivateWaystationCommand({ tiles: new Map(), visibilityCoverage: { isVisible: () => true }, emitEvent, emitPlayerStateUpdate: vi.fn() }, command("invalid", "player-1", payload), activate);
    expect(activate).not.toHaveBeenCalled();
    expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "COMMAND_REJECTED" }));
  });

  it("keeps AI capture rewards automatic while human capture waits", () => {
    for (const isAi of [false, true]) {
      const tiles = new Map([["10,10", waystationTile()]]);
      const { input } = createInput(tiles, new Map([["player-1", makePlayer({ isAi })]]), () => RANDOM_FOR.MANPOWER);
      activateWaystationAt(input, "10,10", 10, 10, "player-1", "capture", true);
      expect(tiles.get("10,10")?.waystation?.activated).toBe(isAi);
    }
  });
});
