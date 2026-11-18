// End-to-end Farm Plot behaviour through a real SimulationRuntime
// (docs/farm-plot-plan.md): placement legality, FOOD supply, the Hydrogarden
// Plot upgrade (and its cancel), and a snapshot round-trip.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { structureBuildDurationMs } from "@border-empires/shared";
import type { RecoveredSimulationState } from "../event-recovery/event-recovery.js";
import { SimulationRuntime } from "../runtime/runtime.js";
import { afcModuleFixtureTile, buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";

const PLAYER = "player-1";
const TOWN = { x: 16, y: 16 };
const PLAIN_SUPPORT = { x: 16, y: 17 };
const FARM_SUPPORT = { x: 17, y: 16 };
const OUTSIDE_RING = { x: 22, y: 22 };

const world = (): RecoveredSimulationState => ({
  tiles: [
    afcModuleFixtureTile(PLAYER),
    { ...TOWN, terrain: "LAND", ownerId: PLAYER, ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "TOWN" } },
    { ...PLAIN_SUPPORT, terrain: "LAND", ownerId: PLAYER, ownershipState: "SETTLED" },
    { ...FARM_SUPPORT, terrain: "LAND", ownerId: PLAYER, ownershipState: "SETTLED", resource: "FARM" },
    { ...OUTSIDE_RING, terrain: "LAND", ownerId: PLAYER, ownershipState: "SETTLED" }
  ],
  activeLocks: []
});

const boot = (techIds: string[], initialState: RecoveredSimulationState = world()): SimulationRuntime => {
  const runtime = new SimulationRuntime({
    now: () => Date.now(),
    initialPlayers: new Map([[PLAYER, buildPlayer(PLAYER, { points: 5_000, manpower: 10_000, techIds: new Set(techIds) })]]),
    initialState
  });
  runtime.exportPlayerDebugSnapshot(); // settle the one-time cap-grant quirk
  (runtime as unknown as { state: { players: Map<string, { manpower: number }> } }).state.players.get(PLAYER)!.manpower = 1_000;
  return runtime;
};

let seq = 0;
const send = (runtime: SimulationRuntime, type: string, payload: Record<string, unknown>): void => {
  seq += 1;
  runtime.submitCommand({ commandId: `farm-plot-${seq}`, sessionId: "s", playerId: PLAYER, clientSeq: seq, issuedAt: Date.now(), type, payloadJson: JSON.stringify(payload) });
};
const build = (runtime: SimulationRuntime, at: { x: number; y: number }, structureType: string): void =>
  send(runtime, "BUILD_ECONOMIC_STRUCTURE", { ...at, structureType });

const foodSupply = (runtime: SimulationRuntime): number =>
  runtime.exportPlayerDebugSnapshot().find((p) => p.id === PLAYER)!.resourceSlotSupply.FOOD;
const manpower = (runtime: SimulationRuntime): number => runtime.exportState().players.find((p) => p.id === PLAYER)!.manpower;
const structureAt = (runtime: SimulationRuntime, at: { x: number; y: number }): { type: string; status: string } | undefined => {
  const json = runtime.exportState().tiles.find((t) => t.x === at.x && t.y === at.y)?.economicStructureJson;
  return json ? JSON.parse(json) : undefined;
};
const rejection = (events: ReturnType<typeof collectEvents>): unknown => events.find((e) => e.eventType === "COMMAND_REJECTED");

const buildCompletedPlot = async (runtime: SimulationRuntime): Promise<void> => {
  build(runtime, PLAIN_SUPPORT, "FARM_PLOT");
  await Promise.resolve();
  vi.advanceTimersByTime(structureBuildDurationMs("FARM_PLOT"));
};

beforeEach(() => vi.useFakeTimers({ now: 1_000 }));
afterEach(() => vi.useRealTimers());

describe("Farm Plot", () => {
  it("builds on a plain support tile with no tech, costs 150 manpower and supplies 1 FOOD once complete", async () => {
    const runtime = boot([]);
    const before = foodSupply(runtime);
    build(runtime, PLAIN_SUPPORT, "FARM_PLOT");
    await Promise.resolve();
    expect(manpower(runtime)).toBe(1_000 - 150);
    expect(structureAt(runtime, PLAIN_SUPPORT)).toMatchObject({ type: "FARM_PLOT", status: "under_construction" });
    expect(foodSupply(runtime)).toBe(before);

    vi.advanceTimersByTime(structureBuildDurationMs("FARM_PLOT"));
    expect(structureAt(runtime, PLAIN_SUPPORT)).toMatchObject({ type: "FARM_PLOT", status: "active" });
    expect(foodSupply(runtime)).toBe(before + 1);
  });

  it("redirects a build clicked on the town tile to the open plain support tile, never the FARM tile", async () => {
    const runtime = boot([]);
    build(runtime, TOWN, "FARM_PLOT");
    await Promise.resolve();
    expect(structureAt(runtime, PLAIN_SUPPORT)).toMatchObject({ type: "FARM_PLOT" });
    expect(structureAt(runtime, FARM_SUPPORT)).toBeUndefined();
  });

  it("rejects a resource tile and a tile outside every town's support ring", async () => {
    const runtime = boot([]);
    const events = collectEvents(runtime);
    build(runtime, FARM_SUPPORT, "FARM_PLOT");
    await Promise.resolve();
    expect(rejection(events)).toMatchObject({ code: "BUILD_INVALID", message: "farm plot cannot be built on this tile" });

    events.length = 0;
    build(runtime, OUTSIDE_RING, "FARM_PLOT");
    await Promise.resolve();
    expect(rejection(events)).toMatchObject({ code: "BUILD_INVALID", message: "farm plot cannot be built on this tile" });
    expect(manpower(runtime)).toBe(1_000);
  });

  it("never builds a Hydrogarden Plot fresh, even with Hyperfeed Seedstock", async () => {
    const runtime = boot(["agriculture"]);
    const events = collectEvents(runtime);
    build(runtime, PLAIN_SUPPORT, "HYDROGARDEN_PLOT");
    await Promise.resolve();
    expect(rejection(events)).toMatchObject({ code: "BUILD_INVALID", message: "a Hydrogarden Plot upgrades a Farm Plot" });
    expect(structureAt(runtime, PLAIN_SUPPORT)).toBeUndefined();
  });

  it("upgrades in place for the full 80 manpower, keeps the plot's FOOD while building, then supplies 3", async () => {
    const runtime = boot(["agriculture"]);
    const base = foodSupply(runtime);
    await buildCompletedPlot(runtime);
    expect(foodSupply(runtime)).toBe(base + 1);

    build(runtime, PLAIN_SUPPORT, "HYDROGARDEN_PLOT");
    await Promise.resolve();
    expect(manpower(runtime)).toBe(1_000 - 150 - 80);
    expect(structureAt(runtime, PLAIN_SUPPORT)).toMatchObject({ type: "HYDROGARDEN_PLOT", status: "under_construction" });
    expect(foodSupply(runtime)).toBe(base + 1);

    vi.advanceTimersByTime(structureBuildDurationMs("HYDROGARDEN_PLOT"));
    expect(structureAt(runtime, PLAIN_SUPPORT)).toMatchObject({ type: "HYDROGARDEN_PLOT", status: "active" });
    expect(foodSupply(runtime)).toBe(base + 3);
  });

  it("needs Hyperfeed Seedstock to upgrade", async () => {
    const runtime = boot([]);
    await buildCompletedPlot(runtime);
    const events = collectEvents(runtime);
    build(runtime, PLAIN_SUPPORT, "HYDROGARDEN_PLOT");
    await Promise.resolve();
    expect(rejection(events)).toMatchObject({ code: "BUILD_INVALID" });
    expect(structureAt(runtime, PLAIN_SUPPORT)).toMatchObject({ type: "FARM_PLOT", status: "active" });
  });

  it("cancelling the upgrade leaves the Farm Plot standing", async () => {
    const runtime = boot(["agriculture"]);
    const base = foodSupply(runtime);
    await buildCompletedPlot(runtime);
    build(runtime, PLAIN_SUPPORT, "HYDROGARDEN_PLOT");
    await Promise.resolve();
    send(runtime, "CANCEL_STRUCTURE_BUILD", PLAIN_SUPPORT);
    await Promise.resolve();
    expect(structureAt(runtime, PLAIN_SUPPORT)).toMatchObject({ type: "FARM_PLOT", status: "active" });
    expect(foodSupply(runtime)).toBe(base + 1);
  });

  it("survives a snapshot round-trip as the same structure with the same FOOD", async () => {
    const runtime = boot(["agriculture"]);
    await buildCompletedPlot(runtime);
    const supply = foodSupply(runtime);

    const restored = boot(["agriculture"], runtime.exportSnapshotSections().initialState);
    expect(structureAt(restored, PLAIN_SUPPORT)).toMatchObject({ type: "FARM_PLOT", status: "active" });
    expect(foodSupply(restored)).toBe(supply);
  });
});
