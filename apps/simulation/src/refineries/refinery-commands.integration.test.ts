import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";
import { afcModuleFixtureTile, buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";
import { applySimulationEventsToRecoveredState } from "../event-recovery/event-recovery.js";
import { createTilesFromInitialState } from "../runtime-hydration.js";

// Town at (30,30). Row 30 is the player's land: Titanium field A at
// (34,30)-(35,30) (4 land steps), field B at (38,30) (8 steps) and field D at
// (45,30) (15 steps, out of reach). Ten farms elsewhere cover the FOOD slots.
const NOW = 5_000;
const land = (x: number, y: number, extra: Partial<DomainTileState> = {}): DomainTileState =>
  ({ x, y, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED", ...extra });

const fixtureTiles = (): DomainTileState[] => {
  const tiles: DomainTileState[] = [afcModuleFixtureTile("p1"), land(30, 30, { town: { name: "Ore", type: "MARKET", populationTier: "TOWN" } })];
  for (let x = 31; x <= 45; x += 1) tiles.push(land(x, 30, [34, 35, 38, 45].includes(x) ? { resource: "TITANIUM" } : {}));
  for (const [x, y] of [[29, 29], [30, 29], [31, 29], [29, 30], [29, 31], [30, 31], [31, 31]] as const) tiles.push(land(x, y));
  for (let x = 40; x < 50; x += 1) tiles.push(land(x, 50, { resource: "FARM" }));
  return tiles;
};

type InitialLock = { commandId: string; playerId: string; actionType: "ATTACK"; originX: number; originY: number; targetX: number; targetY: number; originKey: string; targetKey: string; resolvesAt: number };

const setup = (techIds = ["mining"], tiles = fixtureTiles(), activeLocks: InitialLock[] = []) => {
  const runtime = new SimulationRuntime({
    now: () => NOW,
    seedTiles: new Map(),
    initialState: { tiles, activeLocks },
    initialPlayers: new Map([
      ["p1", buildPlayer("p1", { points: 1_000, manpower: 5_000, manpowerUpdatedAt: NOW, techIds: new Set(techIds) })],
      ["p2", buildPlayer("p2", { points: 1_000, manpower: 5_000, manpowerUpdatedAt: NOW, techIds: new Set(techIds) })]
    ])
  });
  const events = collectEvents(runtime);
  let seq = 0;
  const send = async (commandId: string, type: "BUILD_ECONOMIC_STRUCTURE" | "ASSIGN_REFINERY_FIELD", payload: Record<string, unknown>, playerId = "p1") => {
    seq += 1;
    await runtime.submitCommand({ commandId, sessionId: "s", playerId, clientSeq: seq, issuedAt: NOW, type, payloadJson: JSON.stringify(payload) });
  };
  const build = (commandId: string, x: number, y: number, extra: Record<string, unknown> = {}) =>
    send(commandId, "BUILD_ECONOMIC_STRUCTURE", { x, y, structureType: "TITANIUM_REFINERY", ...extra });
  const record = (x: number, y: number) => {
    const json = runtime.exportState().tiles.find((tile) => tile.x === x && tile.y === y)?.economicStructureJson;
    return json ? JSON.parse(json) as { type: string; refineryField?: { x: number; y: number; assignedAt: number } } : undefined;
  };
  const rejection = (commandId: string) =>
    events.find((event): event is Extract<SimulationEvent, { eventType: "COMMAND_REJECTED" }> => event.eventType === "COMMAND_REJECTED" && event.commandId === commandId);
  return { runtime, events, send, build, record, rejection };
};

describe("refinery field commands", () => {
  it("auto-picks the nearest free linked field, then the next one", async () => {
    const f = setup();
    await f.build("first", 31, 31);
    expect(f.rejection("first")).toBeUndefined();
    expect(f.record(31, 31)).toMatchObject({ type: "TITANIUM_REFINERY", refineryField: { x: 34, y: 30, assignedAt: NOW } });
    await f.build("second", 29, 29);
    expect(f.record(29, 29)?.refineryField).toMatchObject({ x: 38, y: 30 });
  });

  it("rejects the build when no free field is linked", async () => {
    const f = setup();
    await f.build("a", 31, 31);
    await f.build("b", 29, 29);
    await f.build("c", 29, 31);
    expect(f.rejection("c")?.code).toBe("REFINERY_NO_FIELD");
    expect(f.record(29, 31)).toBeUndefined();
  });

  it("accepts any tile of an explicit field and rejects an invalid, unlinked or taken one", async () => {
    const f = setup();
    await f.build("explicit", 31, 31, { fieldX: 35, fieldY: 30 });
    expect(f.record(31, 31)?.refineryField).toMatchObject({ x: 35, y: 30 });
    await f.build("plain", 29, 29, { fieldX: 33, fieldY: 30 });
    expect(f.rejection("plain")?.code).toBe("REFINERY_FIELD_INVALID");
    await f.build("far", 29, 29, { fieldX: 45, fieldY: 30 });
    expect(f.rejection("far")?.code).toBe("REFINERY_FIELD_UNLINKED");
    await f.build("taken", 29, 29, { fieldX: 34, fieldY: 30 });
    expect(f.rejection("taken")?.code).toBe("REFINERY_FIELD_TAKEN");
    expect(f.record(29, 29)).toBeUndefined();
  });

  it("is gated on the tech that used to unlock the Mine", async () => {
    const f = setup([]);
    await f.build("locked", 31, 31);
    expect(f.rejection("locked")?.message).toMatch(/unlock titanium refinery first/);
  });

  it("ASSIGN_REFINERY_FIELD moves the refinery to a free field and restamps assignedAt; owner only", async () => {
    const tiles = fixtureTiles().map((tile) => tile.x === 31 && tile.y === 31
      ? { ...tile, economicStructure: { ownerId: "p1", type: "TITANIUM_REFINERY" as const, status: "active" as const, refineryField: { x: 34, y: 30, assignedAt: 1 } } }
      : tile);
    const f = setup(["mining"], tiles);
    await f.send("stranger", "ASSIGN_REFINERY_FIELD", { x: 31, y: 31, fieldX: 38, fieldY: 30 }, "p2");
    expect(f.rejection("stranger")?.code).toBe("REFINERY_INVALID");
    await f.send("bad", "ASSIGN_REFINERY_FIELD", { x: 31, y: 31, fieldX: 45, fieldY: 30 });
    expect(f.rejection("bad")?.code).toBe("REFINERY_FIELD_UNLINKED");
    await f.send("move", "ASSIGN_REFINERY_FIELD", { x: 31, y: 31, fieldX: 38, fieldY: 30 });
    expect(f.rejection("move")).toBeUndefined();
    expect(f.record(31, 31)?.refineryField).toEqual({ x: 38, y: 30, assignedAt: NOW });
    // Reassigning to the field it already holds is refused and changes nothing.
    await f.send("same", "ASSIGN_REFINERY_FIELD", { x: 31, y: 31, fieldX: 38, fieldY: 30 });
    expect(f.rejection("same")?.code).toBe("REFINERY_FIELD_UNCHANGED");
    await f.send("none", "ASSIGN_REFINERY_FIELD", { x: 33, y: 30, fieldX: 38, fieldY: 30 });
    expect(f.rejection("none")?.code).toBe("REFINERY_INVALID");
  });

  it("refuses every field tile the player does not hold with one code, revealing no hidden deposit", async () => {
    // (32,32) is an unowned titanium tile, (33,32) unowned plain land, (90,90) off the known map.
    const tiles: DomainTileState[] = fixtureTiles().map((tile) => tile.x === 31 && tile.y === 31
      ? { ...tile, economicStructure: { ownerId: "p1", type: "TITANIUM_REFINERY" as const, status: "active" as const, refineryField: { x: 34, y: 30, assignedAt: 1 } } }
      : tile);
    tiles.push({ x: 32, y: 32, terrain: "LAND", resource: "TITANIUM" }, { x: 33, y: 32, terrain: "LAND" });
    const f = setup(["mining"], tiles);
    const probes = [[32, 32], [33, 32], [90, 90]] as const;
    for (const [x, y] of probes) {
      await f.build(`build-${x}`, 29, 29, { fieldX: x, fieldY: y });
      await f.send(`assign-${x}`, "ASSIGN_REFINERY_FIELD", { x: 31, y: 31, fieldX: x, fieldY: y });
    }
    for (const [x] of probes) {
      expect([f.rejection(`build-${x}`)?.code, f.rejection(`build-${x}`)?.message]).toEqual(["REFINERY_FIELD_INVALID", "choose a deposit tile you hold"]);
      expect([f.rejection(`assign-${x}`)?.code, f.rejection(`assign-${x}`)?.message]).toEqual(["REFINERY_FIELD_INVALID", "choose a deposit tile you hold"]);
    }
  });

  it("does not let an old refinery that cannot work (off its town's ring) reserve the field", async () => {
    // (33,30) is the player's land but on no town's ring: a refinery there can never work.
    const tiles = fixtureTiles().map((tile) => tile.x === 33 && tile.y === 30
      ? { ...tile, economicStructure: { ownerId: "p1", type: "TITANIUM_REFINERY" as const, status: "active" as const, refineryField: { x: 34, y: 30, assignedAt: 1 } } }
      : tile);
    const f = setup(["mining"], tiles);
    await f.build("free", 31, 31, { fieldX: 34, fieldY: 30 });
    expect(f.rejection("free")).toBeUndefined();
    expect(f.record(31, 31)?.refineryField).toMatchObject({ x: 34, y: 30 });
  });

  it("ASSIGN_REFINERY_FIELD is frozen while an attack on the refinery tile is unresolved, and a no-op assign changes nothing", async () => {
    const tiles = fixtureTiles().map((tile) => tile.x === 31 && tile.y === 31
      ? { ...tile, economicStructure: { ownerId: "p1", type: "TITANIUM_REFINERY" as const, status: "active" as const, refineryField: { x: 34, y: 30, assignedAt: 1 } } }
      : tile);
    const lock: InitialLock = { commandId: "siege", playerId: "p2", actionType: "ATTACK", originX: 32, originY: 32, targetX: 31, targetY: 31, originKey: "32,32", targetKey: "31,31", resolvesAt: NOW + 60_000 };
    const held = setup(["mining"], tiles, [lock]);
    await held.send("held", "ASSIGN_REFINERY_FIELD", { x: 31, y: 31, fieldX: 38, fieldY: 30 });
    expect(held.rejection("held")).toMatchObject({ code: "REFINERY_INVALID", message: "tile is under attack" });
    expect(held.record(31, 31)?.refineryField).toEqual({ x: 34, y: 30, assignedAt: 1 });
    const f = setup(["mining"], tiles);
    await f.send("noop", "ASSIGN_REFINERY_FIELD", { x: 31, y: 31, fieldX: 35, fieldY: 30 });
    expect(f.rejection("noop")?.code).toBe("REFINERY_FIELD_UNCHANGED");
    expect(f.record(31, 31)?.refineryField).toEqual({ x: 34, y: 30, assignedAt: 1 });
    expect(f.events.some((event) => event.eventType === "TILE_DELTA_BATCH" && event.commandId === "noop")).toBe(false);
  });

  it("keeps refineryField through the event journal and snapshot recovery", async () => {
    const f = setup();
    await f.build("first", 31, 31);
    const persisted = f.events.map((event) => JSON.parse(JSON.stringify(event)) as SimulationEvent);
    const recovered = applySimulationEventsToRecoveredState({ tiles: fixtureTiles(), activeLocks: [] }, persisted);
    const site = recovered.tiles.find((tile) => tile.x === 31 && tile.y === 31);
    expect(site?.economicStructure?.refineryField).toEqual({ x: 34, y: 30, assignedAt: NOW });
    const hydrated = createTilesFromInitialState(recovered, new Map(), false);
    expect(hydrated.get("31,31")?.economicStructure?.refineryField).toEqual({ x: 34, y: 30, assignedAt: NOW });
  });

  it("adds refinery slots to the owner's supply once working", () => {
    const tiles = fixtureTiles().map((tile) => tile.x === 31 && tile.y === 31
      ? { ...tile, economicStructure: { ownerId: "p1", type: "TITANIUM_REFINERY" as const, status: "active" as const, refineryField: { x: 34, y: 30, assignedAt: 1 } } }
      : tile);
    const f = setup(["mining"], tiles);
    const supply = (f.runtime as unknown as { resourceSlotSupplyForPlayer: (id: string, fresh: boolean) => { TITANIUM: number } }).resourceSlotSupplyForPlayer("p1", true);
    // Four bare deposits (1 each) plus field A's two garrisoned tiles at +2.
    expect(supply.TITANIUM).toBe(4 + 2 * 2);
  });
});
