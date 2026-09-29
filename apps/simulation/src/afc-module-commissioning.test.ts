import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { commissionModuleIfApplicable, type AfcModuleCommissioningContext } from "./afc-module-commissioning.js";
import { createEmptyPlayerRuntimeSummary } from "./player-runtime-summary.js";

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
      ["10,12", afcTile({ afc: { ownerId: "player-1", status: "active", activatedAt: 1000, modules: ["crystal-lattices"] } })]
    ]);
    const { ctx, events } = buildContext(tiles, ["10,12"]);

    commissionModuleIfApplicable(ctx, "player-1", "crystal-lattices", "cmd-1");

    expect(tiles.get("10,12")?.afc?.modules).toEqual(["crystal-lattices"]);
    expect(events).toHaveLength(0);
  });
});
