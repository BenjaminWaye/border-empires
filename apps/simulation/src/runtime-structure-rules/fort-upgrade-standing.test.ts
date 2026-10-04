import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defendingFortVariant, structureBuildDurationMs } from "@border-empires/shared";
import { SimulationRuntime } from "../runtime/runtime.js";
import { requiredMusterForTarget } from "../runtime-combat-resolution.js";
import { afcModuleFixtureTile } from "../afc-test-fixture/afc-test-fixture.js";

type SeedFort = { ownerId: string; status: "active"; variant: "WOODEN_FORT" | "FORT" };

const makeRuntime = (fort: SeedFort | undefined, techIds: string[], extra: Record<string, unknown> = {}) =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([["player-1", {
      id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
      techIds: new Set<string>(techIds), domainIds: new Set<string>(),
      mods: { attack: 1, defense: 1, income: 1, vision: 1 },
      techRootId: "rewrite-local", allies: new Set<string>(),
      strategicResources: { FOOD: 0, TITANIUM: 500, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
    }]]),
    initialState: {
      tiles: [afcModuleFixtureTile("player-1"), 
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "MARKET", populationTier: "CITY" }, ...(fort ? { fort } : {}), ...extra },
        { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" },
        { x: 12, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" },
        { x: 13, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        { x: 14, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        { x: 15, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
      ],
      activeLocks: [],
    },
  });

let clientSeq = 0;
const send = (runtime: SimulationRuntime, commandId: string, type: string, payload: Record<string, unknown>) =>
  runtime.submitCommand({
    commandId, sessionId: "session-1", playerId: "player-1", clientSeq: ++clientSeq, issuedAt: 1_000,
    type: type as never, payloadJson: JSON.stringify(payload),
  });

const fortAt = (runtime: SimulationRuntime) => {
  const json = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10)?.fortJson;
  return json ? JSON.parse(json) : undefined;
};

describe("fort upgrades keep the current fort standing", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("a Fort -> Titanium Bastion upgrade keeps defending as a Fort until it completes", async () => {
    const runtime = makeRuntime({ ownerId: "player-1", status: "active", variant: "FORT" }, ["masonry", "fortified-walls"]);
    send(runtime, "u1", "BUILD_STRUCTURE", { x: 10, y: 10, structureType: "FORT" });
    await Promise.resolve();

    expect(fortAt(runtime)).toMatchObject({ status: "under_construction", variant: "TITANIUM_BASTION", upgradingFrom: "FORT" });
    // An attacker still has to muster against a Fort (300), not an undefended tile.
    const target = { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", fort: fortAt(runtime) };
    expect(requiredMusterForTarget(target as Parameters<typeof requiredMusterForTarget>[0])).toBe(300);
  });

  it("a Palisade keeps defending until its Fort upgrade completes, then the Fort takes over", async () => {
    const runtime = makeRuntime({ ownerId: "player-1", status: "active", variant: "WOODEN_FORT" }, ["masonry"]);
    send(runtime, "u1", "BUILD_FORT", { x: 10, y: 10 });
    await Promise.resolve();

    const building = fortAt(runtime);
    expect(building).toMatchObject({ status: "under_construction", variant: "FORT", upgradingFrom: "WOODEN_FORT" });
    expect(defendingFortVariant(building)).toBe("WOODEN_FORT");

    vi.advanceTimersByTime(structureBuildDurationMs("FORT"));
    const completed = fortAt(runtime);
    expect(completed).toMatchObject({ status: "active", variant: "FORT" });
    expect(completed.upgradingFrom).toBeUndefined();
    expect(defendingFortVariant(completed)).toBe("FORT");
  });

  it("cancelling an upgrade restores the fort that was standing instead of deleting it", async () => {
    const runtime = makeRuntime({ ownerId: "player-1", status: "active", variant: "FORT" }, ["masonry", "fortified-walls"]);
    send(runtime, "u1", "BUILD_STRUCTURE", { x: 10, y: 10, structureType: "FORT" });
    await Promise.resolve();
    send(runtime, "c1", "CANCEL_FORT_BUILD", { x: 10, y: 10 });
    await Promise.resolve();

    expect(fortAt(runtime)).toEqual({ ownerId: "player-1", status: "active", variant: "FORT" });
  });

  it("cancelling a fresh fort build still clears the tile", async () => {
    const runtime = makeRuntime(undefined, ["masonry"]);
    send(runtime, "b1", "BUILD_STRUCTURE", { x: 10, y: 10, structureType: "FORT" });
    await Promise.resolve();
    send(runtime, "c1", "CANCEL_STRUCTURE_BUILD", { x: 10, y: 10 });
    await Promise.resolve();

    expect(fortAt(runtime)).toBeUndefined();
  });

  it("rejects a Palisade on a tile that already has a fortification", async () => {
    const runtime = makeRuntime({ ownerId: "player-1", status: "active", variant: "FORT" }, ["masonry"]);
    const rejections: string[] = [];
    runtime.onEvent((event) => { if (event.eventType === "COMMAND_REJECTED") rejections.push(event.message); });
    send(runtime, "p1", "BUILD_STRUCTURE", { x: 10, y: 10, structureType: "WOODEN_FORT" });
    await Promise.resolve();

    expect(rejections).toEqual(["tile already has a fortification"]);
    expect(fortAt(runtime)).toEqual({ ownerId: "player-1", status: "active", variant: "FORT" });
  });

  it("a Palisade stacks on a Harbor Exchange like a Fort does", async () => {
    // No town on this tile: a town's own ~4 FOOD slot demand would eat the fixture's FARM supply.
    const runtime = makeRuntime(undefined, [], { town: undefined, economicStructure: { ownerId: "player-1", type: "CUSTOMS_HOUSE", status: "active" } });
    const rejections: string[] = [];
    runtime.onEvent((event) => { if (event.eventType === "COMMAND_REJECTED") rejections.push(event.message); });
    send(runtime, "p1", "BUILD_STRUCTURE", { x: 10, y: 10, structureType: "WOODEN_FORT" });
    await Promise.resolve();

    expect(rejections).toEqual([]);
    const tile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
    expect(tile?.economicStructureJson).toContain('"type":"CUSTOMS_HOUSE"');
    expect(fortAt(runtime)).toMatchObject({ status: "under_construction", variant: "WOODEN_FORT" });
  });
});
