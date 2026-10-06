import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { backfillMissingHouseModules, commissionModuleIfApplicable, type AfcModuleCommissioningContext } from "./afc-module-commissioning.js";
import { AFC_MODULE_CALL_DOWN_MS } from "@border-empires/shared";
import { createEmptyPlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { AfcModuleDeliveryContext } from "./afc-module-delivery/afc-module-delivery.js";

// Module commissioning, first slice (docs/manifest-full-plan.md §3-4):
// researching an AFC_MODULE-category tech auto-docks it onto the player's
// home AFC. "crystal-lattices" (Aether Resonance Core) is AFC_MODULE;
// "agriculture" (Hyperfeed Seedstock Consignment) is CREW_OFFICE_CONSIGNMENT.

const afcTile = (overrides: Partial<DomainTileState> = {}): DomainTileState => ({
  x: 10,
  y: 12,
  terrain: "LAND",
  ownerId: "player-1",
  ownershipState: "SETTLED",
  afc: { ownerId: "player-1", status: "active", activatedAt: 1000 },
  ...overrides
});

const buildContext = (tiles: Map<string, DomainTileState>, afcTileKeys: string[]): { ctx: AfcModuleCommissioningContext; events: SimulationEvent[] } => {
  const summary = createEmptyPlayerRuntimeSummary();
  for (const key of afcTileKeys) summary.ownedAfcTileKeys.add(key);
  const events: SimulationEvent[] = [];
  const ctx: AfcModuleCommissioningContext = {
    tiles,
    summaryForPlayer: () => summary,
    replaceTileState: (tileKey, tile) => tiles.set(tileKey, tile),
    tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }),
    emitEvent: (event) => { events.push(event); }
  };
  return { ctx, events };
};

describe("commissionModuleIfApplicable", () => {
  it("docks an AFC_MODULE tech onto the player's home AFC", () => {
    const tiles = new Map<string, DomainTileState>([["10,12", afcTile()]]);
    const { ctx, events } = buildContext(tiles, ["10,12"]);

    commissionModuleIfApplicable(ctx, "player-1", "crystal-lattices", "cmd-1");

    expect(tiles.get("10,12")?.afc?.modules).toEqual(["crystal-lattices"]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventType: "TILE_DELTA_BATCH", commandId: "cmd-1", playerId: "player-1" });
  });

  it("does not dock a non-AFC_MODULE tech (agriculture is CREW_OFFICE_CONSIGNMENT)", () => {
    const tiles = new Map<string, DomainTileState>([["10,12", afcTile()]]);
    const { ctx, events } = buildContext(tiles, ["10,12"]);

    commissionModuleIfApplicable(ctx, "player-1", "agriculture", "cmd-1");

    expect(tiles.get("10,12")?.afc?.modules).toBeUndefined();
    expect(events).toHaveLength(0);
  });

  it("appends to an already-populated modules list instead of overwriting it", () => {
    const tiles = new Map<string, DomainTileState>([
      ["10,12", afcTile({ afc: { ownerId: "player-1", status: "active", activatedAt: 1000, modules: ["masonry"] } })]
    ]);
    const { ctx } = buildContext(tiles, ["10,12"]);

    commissionModuleIfApplicable(ctx, "player-1", "crystal-lattices", "cmd-1");

    expect(tiles.get("10,12")?.afc?.modules).toEqual(["masonry", "crystal-lattices"]);
  });

  it("is a no-op when the player owns no AFC", () => {
    const tiles = new Map<string, DomainTileState>();
    const { ctx, events } = buildContext(tiles, []);

    expect(() => commissionModuleIfApplicable(ctx, "player-1", "crystal-lattices", "cmd-1")).not.toThrow();
    expect(events).toHaveLength(0);
  });

  it("picks the AFC with the earliest activatedAt as home when the player owns several", () => {
    const tiles = new Map<string, DomainTileState>([
      ["10,12", afcTile({ x: 10, y: 12, afc: { ownerId: "player-1", status: "active", activatedAt: 5000 } })],
      ["20,30", afcTile({ x: 20, y: 30, afc: { ownerId: "player-1", status: "active", activatedAt: 1000 } })]
    ]);
    const { ctx } = buildContext(tiles, ["10,12", "20,30"]);

    commissionModuleIfApplicable(ctx, "player-1", "crystal-lattices", "cmd-1");

    expect(tiles.get("20,30")?.afc?.modules).toEqual(["crystal-lattices"]);
    expect(tiles.get("10,12")?.afc?.modules).toBeUndefined();
  });

  it("does not double-dock the same tech twice", () => {
    const tiles = new Map<string, DomainTileState>([
      ["10,12", afcTile({ afc: { ownerId: "player-1", status: "active", activatedAt: 1000, modules: ["crystal-lattices"], houseModules: ["crystal-lattices"] } })]
    ]);
    const { ctx, events } = buildContext(tiles, ["10,12"]);

    commissionModuleIfApplicable(ctx, "player-1", "crystal-lattices", "cmd-1");

    expect(tiles.get("10,12")?.afc?.modules).toEqual(["crystal-lattices"]);
    expect(events).toHaveLength(0);
  });
});

describe("backfillMissingHouseModules", () => {
  const deliveryFor = (ctx: AfcModuleCommissioningContext, timers: Array<() => void>, now: { value: number }): AfcModuleDeliveryContext => ({
    ...ctx,
    now: () => now.value,
    ownedAfcTileKeys: (playerId) => ctx.summaryForPlayer(playerId).ownedAfcTileKeys,
    emitPlayerStateUpdate: () => {},
    scheduleAfter: (_delayMs, task) => { timers.push(task); }
  });

  it("calls down researched modules that were never docked, landing after the call-down delay", () => {
    const tiles = new Map<string, DomainTileState>([["10,12", afcTile()]]);
    const { ctx } = buildContext(tiles, ["10,12"]);
    const timers: Array<() => void> = [];
    const now = { value: 5_000 };

    const changed = backfillMissingHouseModules(ctx, deliveryFor(ctx, timers, now), "player-1", ["masonry", "agriculture", "crystal-lattices"], "cmd-1");

    expect(changed).toBe(true);
    expect(tiles.get("10,12")?.afc?.houseModules).toBeUndefined();
    expect(tiles.get("10,12")?.afc?.incomingModules).toEqual([
      { techId: "crystal-lattices", arrivesAt: 5_000 + AFC_MODULE_CALL_DOWN_MS },
      { techId: "masonry", arrivesAt: 5_000 + AFC_MODULE_CALL_DOWN_MS }
    ]);
    now.value += AFC_MODULE_CALL_DOWN_MS;
    timers.forEach((task) => task());
    expect(tiles.get("10,12")?.afc?.houseModules).toEqual(["crystal-lattices", "masonry"]);
    expect(tiles.get("10,12")?.afc?.incomingModules).toBeUndefined();
  });

  it("skips modules already docked or already incoming on any owned AFC", () => {
    const tiles = new Map<string, DomainTileState>([
      ["10,12", afcTile({ afc: { ownerId: "player-1", status: "active", activatedAt: 1000, incomingModules: [{ techId: "workshops", arrivesAt: 9_000 }] } })],
      ["20,30", afcTile({ x: 20, y: 30, afc: { ownerId: "player-1", status: "active", activatedAt: 5000, modules: ["masonry"], houseModules: ["masonry"] } })]
    ]);
    const { ctx } = buildContext(tiles, ["10,12", "20,30"]);

    backfillMissingHouseModules(ctx, deliveryFor(ctx, [], { value: 0 }), "player-1", ["masonry", "workshops", "crystal-lattices"], "cmd-1");

    expect(tiles.get("10,12")?.afc?.incomingModules?.map((entry) => entry.techId)).toEqual(["workshops", "crystal-lattices"]);
    expect(tiles.get("20,30")?.afc?.houseModules).toEqual(["masonry"]);
  });

  it("treats a docked copy without House provenance (legacy or captured) as held", () => {
    const tiles = new Map<string, DomainTileState>([
      ["10,12", afcTile({ afc: { ownerId: "player-1", status: "active", activatedAt: 1000, modules: ["masonry"] } })]
    ]);
    const { ctx, events } = buildContext(tiles, ["10,12"]);
    expect(backfillMissingHouseModules(ctx, deliveryFor(ctx, [], { value: 0 }), "player-1", ["masonry"], "cmd-1")).toBe(false);
    expect(events).toHaveLength(0);
  });

  it("is a no-op once everything is held, and when the player owns no AFC", () => {
    const tiles = new Map<string, DomainTileState>([
      ["10,12", afcTile({ afc: { ownerId: "player-1", status: "active", activatedAt: 1000, modules: ["masonry"], houseModules: ["masonry"] } })]
    ]);
    const { ctx, events } = buildContext(tiles, ["10,12"]);
    expect(backfillMissingHouseModules(ctx, deliveryFor(ctx, [], { value: 0 }), "player-1", ["masonry"], "cmd-1")).toBe(false);
    expect(events).toHaveLength(0);

    const empty = buildContext(new Map(), []);
    expect(backfillMissingHouseModules(empty.ctx, deliveryFor(empty.ctx, [], { value: 0 }), "player-1", ["masonry"], "cmd-1")).toBe(false);
  });
});
