import { describe, expect, it } from "vitest";
import { NO_AUTO_IMPROVE, NEW_PLAYER_AUTO_SETTLE_PREFS, type AutoImproveResource, type AutoSettlePrefs, type Tile } from "@border-empires/shared";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";
import { afcModuleFixtureTile, buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";

// Server-side auto-improve (runtime-auto-improve.ts): a garrisoned tile of a
// resource whose switch is on gets that resource's improvement on the next
// territory-automation tick; switched-off resources are left alone.

const improveOnly = (...on: AutoImproveResource[]): AutoSettlePrefs => ({
  ...NEW_PLAYER_AUTO_SETTLE_PREFS,
  answered: true,
  improve: { ...NO_AUTO_IMPROVE, ...Object.fromEntries(on.map((resource) => [resource, true])) }
});

const TITANIUM_KEY = "20,20";
const SALVAGE_KEY = "20,21";

const buildRuntime = (autoSettle: AutoSettlePrefs, techIds: string[] = ["mining", "trade"], withFood = true, extraFirst: Tile[] = []) => {
  const allTiles: Tile[] = [
    ...extraFirst,
    afcModuleFixtureTile("player-1"),
    { x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" },
    { x: 20, y: 21, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "PRECURSOR_SALVAGE" },
    // A Mine takes a FOOD slot.
    { x: 21, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
    { x: 21, y: 21, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" }
  ];
  const tiles = withFood ? allTiles : allTiles.filter((tile) => tile.resource !== "FARM");
  const runtime = new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      ["player-1", buildPlayer("player-1", { points: 10_000, manpower: 10_000, manpowerUpdatedAt: 1_000, techIds: new Set(techIds), autoSettle })]
    ]),
    seedTiles: new Map(),
    initialState: { tiles, activeLocks: [] }
  });
  return { runtime, seen: collectEvents(runtime) };
};

const structureOn = (runtime: SimulationRuntime, key: string): string | undefined => {
  const [x, y] = key.split(",").map(Number);
  const json = runtime.exportState().tiles.find((tile) => tile.x === x && tile.y === y)?.economicStructureJson;
  return json ? (JSON.parse(json) as { type: string }).type : undefined;
};

const rejections = (seen: SimulationEvent[]) => seen.filter((event) => event.eventType === "COMMAND_REJECTED");

describe("auto-improve", () => {
  it("builds a Mine on a garrisoned titanium tile when only titanium is on", async () => {
    const { runtime, seen } = buildRuntime(improveOnly("TITANIUM"));
    await runtime.tickTerritoryAutomation(1_000);
    expect(structureOn(runtime, TITANIUM_KEY)).toBe("MINE");
    expect(structureOn(runtime, SALVAGE_KEY)).toBeUndefined();
    expect(rejections(seen)).toEqual([]);
  });

  it("builds Reclamation Works on salvage sites when only salvage is on", async () => {
    const { runtime } = buildRuntime(improveOnly("PRECURSOR_SALVAGE"));
    await runtime.tickTerritoryAutomation(1_000);
    expect(structureOn(runtime, SALVAGE_KEY)).toBe("RECLAMATION_WORKS");
    expect(structureOn(runtime, TITANIUM_KEY)).toBeUndefined();
  });

  it("builds nothing with every switch off", async () => {
    const { runtime } = buildRuntime(improveOnly());
    await runtime.tickTerritoryAutomation(1_000);
    expect(structureOn(runtime, TITANIUM_KEY)).toBeUndefined();
    expect(structureOn(runtime, SALVAGE_KEY)).toBeUndefined();
  });

  it("waits quietly for a free FOOD slot instead of sending a build that gets rejected", async () => {
    const { runtime, seen } = buildRuntime(improveOnly("TITANIUM"), ["mining"], false);
    await runtime.tickTerritoryAutomation(1_000);
    expect(structureOn(runtime, TITANIUM_KEY)).toBeUndefined();
    expect(rejections(seen)).toEqual([]);
  });

  it("waits quietly for the tech instead of sending builds that get rejected", async () => {
    const { runtime, seen } = buildRuntime(improveOnly("TITANIUM"), []);
    await runtime.tickTerritoryAutomation(1_000);
    expect(structureOn(runtime, TITANIUM_KEY)).toBeUndefined();
    expect(rejections(seen)).toEqual([]);
  });

  it("a titanium tile it can't build on (an AFC footprint) doesn't hold back the other titanium tiles", async () => {
    const inAfcFootprint: Tile = { x: 1, y: 2, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" };
    const { runtime, seen } = buildRuntime(improveOnly("TITANIUM"), ["mining"], true, [inAfcFootprint]);
    await runtime.tickTerritoryAutomation(1_000);
    expect(structureOn(runtime, "1,2")).toBeUndefined();
    expect(structureOn(runtime, TITANIUM_KEY)).toBe("MINE");
    expect(rejections(seen)).toEqual([]);
  });

  it("leaves the resource slots the player's own queued builds hold alone", async () => {
    const { runtime, seen } = buildRuntime(improveOnly("TITANIUM"), ["mining"]);
    const summary = (runtime as unknown as { summaryForPlayer: (id: string) => { devQueue: unknown[] } }).summaryForPlayer("player-1");
    // Another Mine already queued (but not yet started) holds both FOOD slots.
    summary.devQueue = [{ x: 30, y: 30, tileKey: "30,30", kind: "BUILD", structureType: "MINE", queuedAt: 1_000, reservedSlotRequirements: [{ resource: "FOOD", count: 2 }] }];
    await runtime.tickTerritoryAutomation(1_000);
    expect(structureOn(runtime, TITANIUM_KEY)).toBeUndefined();
    expect(rejections(seen)).toEqual([]);
  });

  it("leaves a town tile's resource to the town build rules", async () => {
    const townTile: Tile = { x: 25, y: 25, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM", town: { name: "Ore", type: "MARKET", populationTier: "SETTLEMENT" } };
    const { runtime, seen } = buildRuntime(improveOnly("TITANIUM"), ["mining"], true, [townTile]);
    await runtime.tickTerritoryAutomation(1_000);
    expect(structureOn(runtime, "25,25")).toBeUndefined();
    expect(structureOn(runtime, TITANIUM_KEY)).toBe("MINE");
    expect(rejections(seen)).toEqual([]);
  });

  it("SET_AUTO_SETTLE_PREFS stores the improve switches and keeps them when a later update leaves them out", async () => {
    const { runtime } = buildRuntime({ ...NEW_PLAYER_AUTO_SETTLE_PREFS });
    let seq = 0;
    const send = (commandId: string, payload: unknown) =>
      runtime.submitCommand({ commandId, sessionId: "s", playerId: "player-1", clientSeq: ++seq, issuedAt: 1_000, type: "SET_AUTO_SETTLE_PREFS", payloadJson: JSON.stringify(payload) });
    const categories = { towns: false, food: false, strategic: false, luxury: false };
    send("prefs-1", { ...categories, improve: { TITANIUM: true } });
    await Promise.resolve();
    send("prefs-2", { ...categories, towns: true });
    await Promise.resolve();
    expect(runtime.exportState().players.find((p) => p.id === "player-1")?.autoSettle?.improve).toEqual({ ...NO_AUTO_IMPROVE, TITANIUM: true });
    // A partial improve object changes only the switches it names.
    send("prefs-3", { ...categories, improve: { GEMS: true } });
    await Promise.resolve();
    expect(runtime.exportState().players.find((p) => p.id === "player-1")?.autoSettle?.improve).toEqual({ ...NO_AUTO_IMPROVE, TITANIUM: true, GEMS: true });
    await runtime.tickTerritoryAutomation(1_000);
    expect(structureOn(runtime, TITANIUM_KEY)).toBe("MINE");
  });
});
