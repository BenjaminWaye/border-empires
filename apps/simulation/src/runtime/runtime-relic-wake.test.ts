import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { createRelicState } from "@border-empires/shared";
import { RelicMapHintIndex, relicWakeOwner } from "../runtime-relic-map-hints.js";
import { createEmptyPlayerRuntimeSummary } from "../player-runtime-summary.js";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

// Owner request 2026-11-20: a captured and operating relic shows on every other House's map (the aether wake).
const relic = (patch: Partial<DomainTileState> = {}): DomainTileState => ({
  x: 40, y: 40, terrain: "LAND", ownerId: "holder", ownershipState: "SETTLED", naturalWonder: createRelicState("QUICKFORGE"), ...patch
});
const hintsFor = (tile: DomainTileState, viewer: string) => {
  const index = new RelicMapHintIndex();
  index.refresh("40,40", tile);
  const tiles = new Map([["40,40", tile]]);
  return index.hintsFor({ tiles, summaryForPlayer: () => createEmptyPlayerRuntimeSummary() }, buildPlayer(viewer));
};

describe("relic aether wake", () => {
  it("shows a garrisoned, operating relic to a far House with its operator, and nothing else about it", () => {
    expect(hintsFor(relic(), "far")).toEqual([{ x: 40, y: 40, kind: "WAKE", ownerId: "holder" }]);
  });

  it("gives no wake to the operator itself (it keeps its own transponder beam)", () => {
    expect(hintsFor(relic(), "holder").some((hint) => hint.kind === "WAKE")).toBe(false);
  });

  it("is silent while the relic is unowned, only held as frontier, or depleted", () => {
    expect(hintsFor(relic({ ownerId: undefined, ownershipState: undefined }), "far")).toEqual([]);
    expect(hintsFor(relic({ ownershipState: "FRONTIER" }), "far")).toEqual([]);
    expect(hintsFor(relic({ naturalWonder: { ...createRelicState("QUICKFORGE"), remainingUses: 0 } }), "far")).toEqual([]);
    expect(relicWakeOwner(relic({ ownershipState: "FRONTIER" }))).toBeUndefined();
  });

  it("notifies on each start, change of hands or stop, but not while seeding at boot", () => {
    let calls = 0;
    const index = new RelicMapHintIndex(() => { calls += 1; });
    index.refresh("40,40", relic(), false);
    expect(calls).toBe(0);
    index.refresh("40,40", relic());
    expect(calls).toBe(0);
    index.refresh("40,40", relic({ ownerId: "rival" }));
    index.refresh("40,40", relic({ ownerId: "rival", ownershipState: "FRONTIER" }));
    index.refresh("40,40", relic({ ownerId: "rival", ownershipState: "FRONTIER" }));
    expect(calls).toBe(2);
  });
});

describe("relic aether wake in the runtime", () => {
  it("pushes the wake to another human House when a rival garrisons a relic", async () => {
    const scheduled: Array<() => void> = [];
    const runtime = new SimulationRuntime({ now: () => 1000, scheduleAfter: (_delay, task) => { scheduled.push(task); }, isPlayerSubscribed: (id) => id !== "offline", initialPlayers: new Map([
      ["p", buildPlayer("p", { points: 1000, manpower: 1000 })],
      ["far", buildPlayer("far")],
      ["offline", buildPlayer("offline")],
      ["bot", buildPlayer("bot", { isAi: true })]
    ]), initialState: {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "p", ownershipState: "FRONTIER", naturalWonder: createRelicState("QUICKFORGE") },
        { x: 10, y: 9, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } }
      ],
      activeLocks: []
    } });
    const events = collectEvents(runtime);
    const wakeUpdatesFor = (playerId: string) => events
      .filter((event): event is Extract<SimulationEvent, { eventType: "PLAYER_MESSAGE" }> => event.eventType === "PLAYER_MESSAGE" && event.messageType === "PLAYER_UPDATE" && event.playerId === playerId)
      .map((event) => (JSON.parse(event.payloadJson) as { relicMapHints?: unknown[] }).relicMapHints);
    const command = { sessionId: "s", playerId: "p", issuedAt: 1000, payloadJson: JSON.stringify({ x: 10, y: 10 }) };
    runtime.submitCommand({ ...command, commandId: "settle", clientSeq: 1, type: "SETTLE" }); await Promise.resolve();
    runtime.submitCommand({ ...command, commandId: "rush", clientSeq: 2, type: "RUSH_BUY" }); await Promise.resolve();
    // Nothing reaches the far House inside the command turn: the broadcast waits for the scheduler.
    expect(wakeUpdatesFor("far")).toEqual([]);
    for (const task of scheduled.splice(0)) task();
    expect(events.filter((event) => event.eventType === "COMMAND_REJECTED")).toEqual([]);
    expect(wakeUpdatesFor("far")).toEqual([[{ x: 10, y: 10, kind: "WAKE", ownerId: "p" }]]);
    expect(wakeUpdatesFor("offline")).toEqual([]);
    expect(wakeUpdatesFor("bot")).toEqual([]);
  });

  it("sends nothing on restart for a relic that was already operating", () => {
    const scheduled: Array<() => void> = [];
    new SimulationRuntime({ now: () => 1000, scheduleAfter: (_delay, task) => { scheduled.push(task); }, isPlayerSubscribed: () => true, initialPlayers: new Map([["p", buildPlayer("p")], ["far", buildPlayer("far")]]), initialState: {
      tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED", naturalWonder: createRelicState("QUICKFORGE") }],
      activeLocks: []
    } });
    const wakeTasks = scheduled.length;
    expect(wakeTasks).toBe(0);
  });
});
