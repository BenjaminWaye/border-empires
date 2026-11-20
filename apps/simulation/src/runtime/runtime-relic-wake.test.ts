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

  it("notifies once per burst of changes, when a relic starts, changes hands or stops operating", async () => {
    let calls = 0;
    const index = new RelicMapHintIndex(() => { calls += 1; });
    index.refresh("40,40", relic({ ownershipState: "FRONTIER" }));
    await Promise.resolve();
    expect(calls).toBe(0);
    index.refresh("40,40", relic());
    index.refresh("40,40", relic());
    await Promise.resolve();
    expect(calls).toBe(1);
    index.refresh("40,40", relic({ ownerId: "rival" }));
    index.refresh("40,40", relic({ ownerId: "rival", ownershipState: "FRONTIER" }));
    await Promise.resolve();
    expect(calls).toBe(2);
    index.refresh("40,40", relic({ ownerId: "rival", ownershipState: "FRONTIER" }));
    await Promise.resolve();
    expect(calls).toBe(2);
  });
});

describe("relic aether wake in the runtime", () => {
  it("pushes the wake to another human House when a rival garrisons a relic", async () => {
    const runtime = new SimulationRuntime({ now: () => 1000, scheduleAfter: () => {}, initialPlayers: new Map([
      ["p", buildPlayer("p", { points: 1000, manpower: 1000 })],
      ["far", buildPlayer("far")]
    ]), initialState: {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "p", ownershipState: "FRONTIER", naturalWonder: createRelicState("QUICKFORGE") },
        { x: 10, y: 9, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } }
      ],
      activeLocks: []
    } });
    const events = collectEvents(runtime);
    const command = { sessionId: "s", playerId: "p", issuedAt: 1000, payloadJson: JSON.stringify({ x: 10, y: 10 }) };
    runtime.submitCommand({ ...command, commandId: "settle", clientSeq: 1, type: "SETTLE" }); await Promise.resolve();
    runtime.submitCommand({ ...command, commandId: "rush", clientSeq: 2, type: "RUSH_BUY" }); await Promise.resolve();
    await Promise.resolve();
    expect(events.filter((event) => event.eventType === "COMMAND_REJECTED")).toEqual([]);
    const farHints = events
      .filter((event): event is Extract<SimulationEvent, { eventType: "PLAYER_MESSAGE" }> => event.eventType === "PLAYER_MESSAGE" && event.messageType === "PLAYER_UPDATE" && event.playerId === "far")
      .map((event) => (JSON.parse(event.payloadJson) as { relicMapHints?: unknown[] }).relicMapHints);
    expect(farHints.at(-1)).toEqual([{ x: 10, y: 10, kind: "WAKE", ownerId: "p" }]);
  });
});
