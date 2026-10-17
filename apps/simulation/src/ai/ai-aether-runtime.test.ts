import { describe, expect, it, vi } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";
import { createAiPlannerWorkerCore } from "./ai-planner-worker-core.js";
import type { CommandEnvelope } from "@border-empires/sim-protocol";

const own = (x: number, y: number, rest: Partial<DomainTileState> = {}): DomainTileState => ({ x, y, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED", ...rest });
const baseTiles = (): DomainTileState[] => [
  own(10, 10, { afc: { ownerId: "ai-1", status: "active" } }),
  own(11, 10, { observatory: { ownerId: "ai-1", status: "active" } }),
  own(10, 11, { resource: "GEMS" }), own(11, 11, { resource: "FISH" }),
  own(10, 12, { resource: "FISH" }), own(11, 12, { resource: "FISH" }),
  { x: 12, y: 10, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN" } },
  { x: 13, y: 10, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED", resource: "FARM" },
  { x: 14, y: 10, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED", afc: { ownerId: "enemy", status: "active" } }
];
function runtimeFor(tiles: DomainTileState[], techIds: string[], now = () => 1000, manpower = 2000) {
  for (const tile of tiles) if (tile.afc?.ownerId === "ai-1") tile.afc.modules = [...techIds];
  return new SimulationRuntime({ now,
    initialPlayers: new Map([
      ["ai-1", buildPlayer("ai-1", { isAi: true, points: 5000, manpower, techIds: new Set(techIds) })],
      ["enemy", buildPlayer("enemy", { points: 5000, manpower: 1000 })]
    ]), initialState: { tiles, activeLocks: [] } });
}
async function applyPlan(runtime: SimulationRuntime, expectedType: CommandEnvelope["type"], worker = false) {
  let command: CommandEnvelope | undefined;
  if (worker) {
    const core = createAiPlannerWorkerCore(message => {
      if (message.type === "command" && message.command) command = message.command as CommandEnvelope;
    });
    core.handleMessage({ type: "init", worldView: runtime.exportPlannerWorldView(["ai-1"]) });
    core.handleMessage({ type: "plan", playerId: "ai-1", clientSeq: 1, issuedAt: 1000, skipPreplan: true });
    await core.shutdown();
  } else command = runtime.explainNextAutomationCommand("ai-1", 1, 1000, "ai-runtime", { skipPreplan: true }).command;
  expect(command?.type).toBe(expectedType);
  if (!command) throw new Error("AI produced no command");
  const events = collectEvents(runtime);
  runtime.submitCommand(command);
  await vi.waitFor(() => expect(events.some(event => event.commandId === command!.commandId && (event.eventType === "COMMAND_REJECTED" || event.eventType === "COMMAND_RESOLVED" || event.eventType === "TILE_DELTA_BATCH"))).toBe(true), { timeout: 2000, interval: 5 });
  expect(events.filter(event => event.commandId === command.commandId && event.eventType === "COMMAND_REJECTED")).toEqual([]);
  return { command, events };
}

describe("AI aether commands obey the real simulation rules", () => {
  it.each([false, true])("purges hostile land through the %s worker path", async worker => {
    const runtime = runtimeFor(baseTiles(), ["crystal-lattices"]);
    const { command, events } = await applyPlan(runtime, "AETHER_LANCE", worker);
    expect(events).toContainEqual(expect.objectContaining({ eventType: "COMMAND_RESOLVED", commandId: command.commandId }));
    const target = JSON.parse(command.payloadJson) as { x: number; y: number };
    expect(runtime.exportState().tiles.find(t => t.x === target.x && t.y === target.y)?.ownerId).toBeUndefined();
  });
  it("siphons FOOD and increases the caster's real slot supply", async () => {
    const tiles = baseTiles();
    delete tiles[4]!.resource;
    delete tiles[5]!.resource;
    tiles[0]!.town = { type: "MARKET", populationTier: "TOWN", population: 50_000 };
    let now = 1000;
    const runtime = runtimeFor(tiles, ["crystal-lattices", "logistics", "agriculture"], () => now);
    const before = runtime.exportPlannerPlayerViews(["ai-1"])[0]!.slotSupplyByResource!.FOOD!;
    await applyPlan(runtime, "SIPHON_TILE", true);
    now += 6000; // Let the bounded AI derived-cache coalescing window elapse.
    const after = runtime.exportPlannerPlayerViews(["ai-1"])[0]!.slotSupplyByResource!.FOOD!;
    expect(after).toBeGreaterThan(before);
  });
  it("EMP stamps an actual enemy power-source outage", async () => {
    const tiles = baseTiles();
    tiles.push({ x: 13, y: 9, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED",
      economicStructure: { ownerId: "enemy", type: "AMBARIC_TRANSFORMER", status: "active" } });
    const runtime = runtimeFor(tiles, ["crystal-lattices", "cryptography"]);
    await applyPlan(runtime, "AETHER_EMP", true);
    expect(runtime.exportState().tiles.find(t => t.x === 13 && t.y === 9)?.economicStructureJson).toContain("disabledUntil");
  });
  it("turns an exposed hostile muster beside a capital into a mountain", async () => {
    const tiles = baseTiles();
    tiles[0]!.town = { type: "MARKET", populationTier: "TOWN" };
    tiles.push({ x: 9, y: 10, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED", muster: { ownerId: "enemy", amount: 100 } });
    const runtime = runtimeFor(tiles, ["terrain-engineering", "crystal-lattices"], () => 1000, 0);
    await applyPlan(runtime, "CREATE_MOUNTAIN", true);
    expect(runtime.exportState().tiles.find(tile => tile.x === 9 && tile.y === 10)).toMatchObject({ terrain: "MOUNTAIN" });
  });
  it("creates a real bridge to its known valuable landing", async () => {
    const tiles = [own(10, 10, { afc: { ownerId: "ai-1", status: "active" } }),
      own(11, 10, { observatory: { ownerId: "ai-1", status: "active" } }),
      own(10, 11, { resource: "GEMS" }), own(11, 11, { resource: "FISH" }),
      { x: 12, y: 10, terrain: "SEA" as const }, { x: 13, y: 10, terrain: "LAND" as const, resource: "FARM" }];
    const runtime = runtimeFor(tiles, ["crystal-lattices", "navigation"]);
    const { events } = await applyPlan(runtime, "CAST_AETHER_BRIDGE", true);
    const update = events.find(event => event.eventType === "PLAYER_MESSAGE" && event.messageType === "AETHER_BRIDGE_UPDATE");
    if (update?.eventType !== "PLAYER_MESSAGE") throw new Error("No bridge update");
    expect(JSON.parse(update.payloadJson)).toMatchObject({ bridges: [{ from: { x: 11, y: 10 }, to: { x: 13, y: 10 } }] });
  });
  it("creates a real wall against an adjacent hostile muster", async () => {
    const tiles = baseTiles();
    tiles[0]!.town = { type: "MARKET", populationTier: "TOWN" };
    tiles.push({ x: 9, y: 10, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED", muster: { ownerId: "enemy", amount: 100 } });
    const runtime = runtimeFor(tiles, ["harborcraft", "crystal-lattices"], () => 1000, 0);
    const { events } = await applyPlan(runtime, "CAST_AETHER_WALL", true);
    expect(events).toContainEqual(expect.objectContaining({ eventType: "PLAYER_MESSAGE", messageType: "AETHER_WALL_UPDATE" }));
  });
  it("builds a valid tower when the border needs one", async () => {
    const tiles = baseTiles();
    delete tiles[1]!.observatory;
    const runtime = runtimeFor(tiles, ["crystal-lattices"]);
    const { command } = await applyPlan(runtime, "BUILD_OBSERVATORY", true);
    const target = JSON.parse(command.payloadJson) as { x: number; y: number };
    expect(runtime.exportState().tiles.find(t => t.x === target.x && t.y === target.y)?.observatoryJson).toContain("under_construction");
  });
});
