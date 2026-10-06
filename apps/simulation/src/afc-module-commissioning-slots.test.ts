// AFC_MODULE_SLOTS (8 per AFC) coverage for commissioning, backfill and the
// rebalance of AFCs that were over the cap before it existed.
import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { AFC_MODULE_CALL_DOWN_MS, AFC_MODULE_SLOTS } from "@border-empires/shared";
import { backfillMissingHouseModules, commissionModuleIfApplicable, rebalanceOverfullAfcs, type AfcModuleCommissioningContext } from "./afc-module-commissioning.js";
import { createEmptyPlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { AfcModuleDeliveryContext } from "./afc-module-delivery/afc-module-delivery.js";

// Eight real AFC_MODULE tech ids, enough to fill one AFC.
const EIGHT_MODULES = ["leatherworking", "fortified-walls", "siegecraft", "muster-discipline", "steelworking", "muster-command", "cryptography", "logistics"];

const afcTile = (x: number, activatedAt: number, modules: string[] = []): DomainTileState => ({
  x,
  y: 0,
  terrain: "LAND",
  ownerId: "player-1",
  ownershipState: "SETTLED",
  afc: { ownerId: "player-1", status: "active", activatedAt, ...(modules.length > 0 ? { modules, houseModules: modules } : {}) }
});

const setup = (afcs: DomainTileState[], now = 5_000) => {
  const tiles = new Map(afcs.map((tile) => [`${tile.x},${tile.y}`, tile]));
  const summary = createEmptyPlayerRuntimeSummary();
  for (const key of tiles.keys()) summary.ownedAfcTileKeys.add(key);
  const ctx: AfcModuleCommissioningContext = {
    tiles,
    summaryForPlayer: () => summary,
    replaceTileState: (tileKey, tile) => tiles.set(tileKey, tile),
    tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }),
    emitEvent: () => {}
  };
  const delivery: AfcModuleDeliveryContext = {
    ...ctx,
    now: () => now,
    ownedAfcTileKeys: () => summary.ownedAfcTileKeys,
    emitPlayerStateUpdate: () => {},
    scheduleAfter: () => {}
  };
  return { tiles, ctx, delivery };
};

describe("AFC module slots", () => {
  it("commissions onto the next AFC with a free slot when the home AFC is full", () => {
    const { tiles, ctx } = setup([afcTile(0, 1_000, EIGHT_MODULES), afcTile(5, 2_000)]);
    commissionModuleIfApplicable(ctx, "player-1", "masonry", "cmd-1");
    expect(tiles.get("0,0")?.afc?.modules).toHaveLength(AFC_MODULE_SLOTS);
    expect(tiles.get("5,0")?.afc?.houseModules).toEqual(["masonry"]);
  });

  it("leaves a researched module waiting when every AFC is full", () => {
    const { tiles, ctx } = setup([afcTile(0, 1_000, EIGHT_MODULES)]);
    commissionModuleIfApplicable(ctx, "player-1", "masonry", "cmd-1");
    expect(tiles.get("0,0")?.afc?.modules).toEqual(EIGHT_MODULES);
  });

  it("backfills only into free slots, Economy modules first", () => {
    const { tiles, ctx, delivery } = setup([afcTile(0, 1_000, EIGHT_MODULES.slice(0, 6))]);
    // masonry (war), workshops (economy), crystal-lattices (aether): 2 free slots.
    backfillMissingHouseModules(ctx, delivery, "player-1", ["masonry", "workshops", "crystal-lattices"], "cmd-1");
    expect(tiles.get("0,0")?.afc?.incomingModules).toEqual([
      { techId: "workshops", arrivesAt: 5_000 + AFC_MODULE_CALL_DOWN_MS },
      { techId: "masonry", arrivesAt: 5_000 + 2 * AFC_MODULE_CALL_DOWN_MS }
    ]);
  });

  it("moves the newest House copies off an over-full AFC onto another AFC with room", () => {
    const tenModules = [...EIGHT_MODULES, "masonry", "workshops"];
    const { tiles, ctx, delivery } = setup([afcTile(0, 1_000, tenModules), afcTile(5, 2_000)]);
    expect(rebalanceOverfullAfcs(ctx, delivery, "player-1", "cmd-1")).toBe(true);
    expect(tiles.get("0,0")?.afc?.modules).toEqual(EIGHT_MODULES);
    expect(tiles.get("5,0")?.afc?.incomingModules?.map((entry) => entry.techId)).toEqual(["workshops", "masonry"]);
  });

  it("keeps an over-full AFC as-is when no other AFC has room", () => {
    const tenModules = [...EIGHT_MODULES, "masonry", "workshops"];
    const { tiles, ctx, delivery } = setup([afcTile(0, 1_000, tenModules)]);
    expect(rebalanceOverfullAfcs(ctx, delivery, "player-1", "cmd-1")).toBe(false);
    expect(tiles.get("0,0")?.afc?.modules).toEqual(tenModules);
  });
});
