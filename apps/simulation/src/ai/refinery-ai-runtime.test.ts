import { describe, expect, it, vi } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";
import { afcModuleFixtureTile, buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";
import { createAiPlannerWorkerCore } from "./ai-planner-worker-core.js";

// AI-vs-runtime: the planner's refinery commands obey the real simulation
// rules and raise the AI's real TITANIUM slot supply. Town at (30,30); row 30
// is the AI's land with Titanium field A at (34,30)-(35,30) (4 land steps)
// and a lone deposit D at (45,30) (15 steps, out of reach). Ten farms cover
// the FOOD slots; nothing is left to expand into.
const own = (x: number, y: number, extra: Partial<DomainTileState> = {}): DomainTileState =>
  ({ x, y, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED", ...extra });

const fixtureTiles = (): DomainTileState[] => {
  const tiles: DomainTileState[] = [afcModuleFixtureTile("ai-1"), own(30, 30, { town: { name: "Ore", type: "MARKET", populationTier: "TOWN" } })];
  for (let x = 31; x <= 45; x += 1) tiles.push(own(x, 30, [34, 35, 45].includes(x) ? { resource: "TITANIUM" } : {}));
  for (const [x, y] of [[29, 29], [30, 29], [31, 29], [29, 30], [29, 31], [30, 31], [31, 31]] as const) tiles.push(own(x, y));
  for (let x = 40; x < 50; x += 1) tiles.push(own(x, 50, { resource: "FARM" }));
  return tiles;
};

const setup = (tiles: DomainTileState[]) => {
  let now = 5_000;
  const timers: Array<{ at: number; run: () => void }> = [];
  const runtime = new SimulationRuntime({
    now: () => now,
    scheduleAfter: (delayMs, run) => { if (delayMs <= 0) run(); else timers.push({ at: now + delayMs, run }); },
    initialPlayers: new Map([["ai-1", buildPlayer("ai-1", { isAi: true, points: 5_000, manpower: 5_000, manpowerUpdatedAt: now, techIds: new Set(["mining"]) })]]),
    initialState: { tiles, activeLocks: [] }
  });
  const advance = (ms: number): void => {
    now += ms;
    for (const timer of timers.splice(0).sort((a, b) => a.at - b.at)) {
      if (timer.at <= now) timer.run();
      else timers.push(timer);
    }
  };
  const titaniumSupply = (): number =>
    (runtime as unknown as { resourceSlotSupplyForPlayer: (id: string, fresh: boolean) => { TITANIUM: number } }).resourceSlotSupplyForPlayer("ai-1", true).TITANIUM;
  const record = (x: number, y: number) => {
    const json = runtime.exportState().tiles.find((tile) => tile.x === x && tile.y === y)?.economicStructureJson;
    return json ? JSON.parse(json) as { type: string; status: string; refineryField?: { x: number; y: number } } : undefined;
  };
  return { runtime, advance, titaniumSupply, record, now: () => now };
};

const planAndSubmit = async (runtime: SimulationRuntime, issuedAt: number, worker: boolean, clientSeq = 1): Promise<CommandEnvelope> => {
  let command: CommandEnvelope | undefined;
  if (worker) {
    const core = createAiPlannerWorkerCore((message) => {
      if (message.type === "command" && message.command) command = message.command as CommandEnvelope;
    });
    core.handleMessage({ type: "init", worldView: runtime.exportPlannerWorldView(["ai-1"]) });
    core.handleMessage({ type: "plan", playerId: "ai-1", clientSeq, issuedAt, skipPreplan: true });
    await core.shutdown();
  } else command = runtime.explainNextAutomationCommand("ai-1", clientSeq, issuedAt, "ai-runtime", { skipPreplan: true }).command;
  if (!command) throw new Error("AI produced no command");
  const events = collectEvents(runtime);
  await runtime.submitCommand(command);
  await vi.waitFor(() => expect(events.some((event) => event.commandId === command!.commandId &&
    (event.eventType === "COMMAND_REJECTED" || event.eventType === "COMMAND_RESOLVED" || event.eventType === "TILE_DELTA_BATCH"))).toBe(true), { timeout: 2000, interval: 5 });
  expect(events.filter((event) => event.commandId === command!.commandId && event.eventType === "COMMAND_REJECTED")).toEqual([]);
  return command;
};

describe("AI town refineries against the real runtime", () => {
  it.each([false, true])("builds a refinery for the in-reach field and gains its slots (worker path: %s)", async (worker) => {
    const f = setup(fixtureTiles());
    const before = f.titaniumSupply();
    expect(before).toBe(3); // three bare deposits, one slot each
    // The AI may first spend a plan or two on other moves (a relay beacon
    // over the fog); the refinery must follow within a few plans.
    let command = await planAndSubmit(f.runtime, f.now(), worker);
    for (let seq = 2; seq <= 6 && !command.payloadJson.includes("TITANIUM_REFINERY"); seq += 1) {
      f.advance(1_000);
      command = await planAndSubmit(f.runtime, f.now(), worker, seq);
    }
    expect(command.type).toBe("BUILD_ECONOMIC_STRUCTURE");
    const payload = JSON.parse(command.payloadJson) as { x: number; y: number; structureType: string; fieldX: number; fieldY: number };
    expect(payload).toMatchObject({ structureType: "TITANIUM_REFINERY", fieldX: 34, fieldY: 30 });
    f.advance(10 * 60_000);
    expect(f.record(payload.x, payload.y)).toMatchObject({ type: "TITANIUM_REFINERY", status: "active", refineryField: { x: 34, y: 30 } });
    // Field A's two garrisoned tiles at +2 each.
    expect(f.titaniumSupply()).toBe(before + 4);
  });

  it.each([false, true])("reassigns a refinery stuck on an unlinked field (worker path: %s)", async (worker) => {
    const tiles = fixtureTiles().map((tile) => tile.x === 31 && tile.y === 31
      ? { ...tile, economicStructure: { ownerId: "ai-1", type: "TITANIUM_REFINERY" as const, status: "active" as const, refineryField: { x: 45, y: 30, assignedAt: 1 } } }
      : tile);
    const f = setup(tiles);
    expect(f.titaniumSupply()).toBe(3);
    const command = await planAndSubmit(f.runtime, f.now(), worker);
    expect(command.type).toBe("ASSIGN_REFINERY_FIELD");
    expect(JSON.parse(command.payloadJson)).toEqual({ x: 31, y: 31, fieldX: 34, fieldY: 30 });
    expect(f.record(31, 31)?.refineryField).toMatchObject({ x: 34, y: 30 });
    expect(f.titaniumSupply()).toBe(3 + 4);
  });
});
