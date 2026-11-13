import { describe, expect, it } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { HOUSE_CHARGES_CHOICE_WINDOW_MS } from "@border-empires/shared";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildChargeWorld } from "./house-charges.test-helpers.js";

// End-to-end through the real runtime: the side ticker deals charges to a
// landed House, and they survive a snapshot -> cold boot round trip.
const humanPlayer = (id: string) => ({
  id,
  isAi: false,
  points: 1_000,
  manpower: 1_000,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

describe("House Charges in the runtime", () => {
  it("deals charges from the side ticker and keeps them across a snapshot round trip", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["p1", humanPlayer("p1")]]),
      seedTiles: new Map(),
      initialState: { tiles: [...buildChargeWorld().values()], activeLocks: [] }
    });
    runtime.tickSideTickers(1_000);
    const dealt = runtime.exportState().players.find((player) => player.id === "p1")?.houseCharges;
    expect(dealt?.offered.length).toBe(3);
    expect(dealt?.keptIds).toHaveLength(2);

    const sections = runtime.exportSnapshotSections();
    const restarted = new SimulationRuntime({ now: () => 2_000, seedTiles: new Map(), initialState: sections.initialState });
    expect(restarted.exportState().players.find((player) => player.id === "p1")?.houseCharges).toEqual(dealt);
  });

  it("keeps the chosen charges and pushes the updated list, until the choice window closes", async () => {
    let now = 1_000;
    const seen: SimulationEvent[] = [];
    const runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([["p1", humanPlayer("p1")]]),
      seedTiles: new Map(),
      initialState: { tiles: [...buildChargeWorld().values()], activeLocks: [] }
    });
    runtime.onEvent((event) => seen.push(event));
    runtime.tickSideTickers(now);
    const offered = runtime.exportState().players.find((player) => player.id === "p1")!.houseCharges!.offered;
    const choice = [offered[2]!.id, offered[0]!.id];
    let clientSeq = 0;
    const choose = (commandId: string, keptIds: string[]) =>
      runtime.submitCommand({ commandId, sessionId: "s1", playerId: "p1", clientSeq: (clientSeq += 1), issuedAt: now, type: "CHOOSE_HOUSE_CHARGES", payloadJson: JSON.stringify({ keptIds }) });

    choose("choose-1", choice);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen.find((event) => event.eventType === "COMMAND_REJECTED")).toBeUndefined();
    expect(runtime.exportState().players.find((player) => player.id === "p1")!.houseCharges!.keptIds).toEqual([offered[0]!.id, offered[2]!.id]);
    expect(seen.some((event) => event.eventType === "PLAYER_MESSAGE" && event.messageType === "HOUSE_CHARGES")).toBe(true);

    choose("choose-2", [offered[0]!.id]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen.filter((event) => event.eventType === "COMMAND_REJECTED")).toHaveLength(1);

    now = 1_000 + HOUSE_CHARGES_CHOICE_WINDOW_MS + 1;
    choose("choose-3", [offered[0]!.id, offered[1]!.id]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen.filter((event) => event.eventType === "COMMAND_REJECTED")).toHaveLength(2);
  });
});
