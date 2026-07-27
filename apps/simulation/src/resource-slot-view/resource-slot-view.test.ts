import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import {
  currentTileFieldSlotRequirements,
  resourceSlotDemandForPlayer,
  resourceSlotSupplyForPlayer,
  totalsFromSlotRequirements
} from "./resource-slot-view.js";

type PartialTile = Partial<DomainTileState> & Pick<DomainTileState, "x" | "y">;

const tile = (overrides: Partial<DomainTileState> & Pick<DomainTileState, "x" | "y">): DomainTileState =>
  ({ terrain: "LAND", ...overrides }) as DomainTileState;

describe("resourceSlotSupplyForPlayer", () => {
  it("gives a bare FARM tile 1 FOOD slot and a bare FISH tile 2, no boosts", () => {
    const totals = resourceSlotSupplyForPlayer([
      tile({ x: 0, y: 0, resource: "FARM" }),
      tile({ x: 1, y: 0, resource: "FISH" })
    ]);
    expect(totals.FOOD).toBe(3);
  });

  it("maps IRON/GEMS/WOOD/FUR to IRON/CRYSTAL/SUPPLY/SUPPLY at 1 base slot each", () => {
    const totals = resourceSlotSupplyForPlayer([
      tile({ x: 0, y: 0, resource: "IRON" }),
      tile({ x: 1, y: 0, resource: "GEMS" }),
      tile({ x: 2, y: 0, resource: "WOOD" }),
      tile({ x: 3, y: 0, resource: "FUR" })
    ]);
    expect(totals).toEqual({ FOOD: 0, IRON: 1, CRYSTAL: 1, SUPPLY: 2 });
  });

  it("an active Farmstead adds +1 FOOD slot to its own FARM tile", () => {
    const totals = resourceSlotSupplyForPlayer([
      tile({ x: 0, y: 0, resource: "FARM", economicStructure: { ownerId: "p1", type: "FARMSTEAD", status: "active" } })
    ]);
    expect(totals.FOOD).toBe(2);
  });

  it("a Farmstead still under construction does not yet boost its tile", () => {
    const totals = resourceSlotSupplyForPlayer([
      tile({ x: 0, y: 0, resource: "FARM", economicStructure: { ownerId: "p1", type: "FARMSTEAD", status: "under_construction" } })
    ]);
    expect(totals.FOOD).toBe(1);
  });

  it("an active Mine adds +1 IRON slot, an active Camp adds +1 SUPPLY slot", () => {
    const totals = resourceSlotSupplyForPlayer([
      tile({ x: 0, y: 0, resource: "IRON", economicStructure: { ownerId: "p1", type: "MINE", status: "active" } }),
      tile({ x: 1, y: 0, resource: "WOOD", economicStructure: { ownerId: "p1", type: "CAMP", status: "active" } })
    ]);
    expect(totals.IRON).toBe(2);
    expect(totals.SUPPLY).toBe(2);
  });

  it("an active Farmstead within Waterworks radius jumps from 2 to 4 FOOD slots", () => {
    const farmstead = tile({ x: 5, y: 5, resource: "FARM", economicStructure: { ownerId: "p1", type: "FARMSTEAD", status: "active" } });
    const totals = resourceSlotSupplyForPlayer([farmstead], new Set(["5,6"]));
    expect(totals.FOOD).toBe(4);
  });

  it("Waterworks radius bonus does not apply outside WATERWORKS_RADIUS", () => {
    const farmstead = tile({ x: 5, y: 5, resource: "FARM", economicStructure: { ownerId: "p1", type: "FARMSTEAD", status: "active" } });
    const totals = resourceSlotSupplyForPlayer([farmstead], new Set(["5,100"]));
    expect(totals.FOOD).toBe(2);
  });

  it("FISH gets no Farmstead or Waterworks bonus (fixed 2 slots forever)", () => {
    const fish = tile({ x: 5, y: 5, resource: "FISH" });
    const totals = resourceSlotSupplyForPlayer([fish], new Set(["5,6"]));
    expect(totals.FOOD).toBe(2);
  });

  it("a tile with no resource contributes nothing", () => {
    const totals = resourceSlotSupplyForPlayer([tile({ x: 0, y: 0 })]);
    expect(totals).toEqual({ FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0 });
  });

  it("§5.3: an active Farmstead built on a FISH tile (placement-legal per structure-placement-metadata.json) does NOT boost it past the fixed 2", () => {
    const totals = resourceSlotSupplyForPlayer([
      tile({ x: 5, y: 5, resource: "FISH", economicStructure: { ownerId: "p1", type: "FARMSTEAD", status: "active" } })
    ]);
    expect(totals.FOOD).toBe(2);
  });

  it("an active Mine on a GEMS tile (placement-legal alongside IRON) boosts CRYSTAL, not IRON", () => {
    const totals = resourceSlotSupplyForPlayer([
      tile({ x: 5, y: 5, resource: "GEMS", economicStructure: { ownerId: "p1", type: "MINE", status: "active" } })
    ]);
    expect(totals).toEqual({ FOOD: 0, IRON: 0, CRYSTAL: 2, SUPPLY: 0 });
  });

  it("an active Camp on a FUR tile boosts SUPPLY same as on WOOD", () => {
    const totals = resourceSlotSupplyForPlayer([
      tile({ x: 5, y: 5, resource: "FUR", economicStructure: { ownerId: "p1", type: "CAMP", status: "active" } })
    ]);
    expect(totals.SUPPLY).toBe(2);
  });

  it("§6.4: an active synthesizer grants +1 slot of its own resource, even on a tile with no matching resource", () => {
    const totals = resourceSlotSupplyForPlayer([
      tile({ x: 0, y: 0, economicStructure: { ownerId: "p1", type: "FUR_SYNTHESIZER", status: "active" } }),
      tile({ x: 1, y: 0, economicStructure: { ownerId: "p1", type: "IRONWORKS", status: "active" } }),
      tile({ x: 2, y: 0, economicStructure: { ownerId: "p1", type: "CRYSTAL_SYNTHESIZER", status: "active" } })
    ]);
    expect(totals).toEqual({ FOOD: 0, IRON: 1, CRYSTAL: 1, SUPPLY: 1 });
  });

  it("a synthesizer still under construction does not yet grant its slot", () => {
    const totals = resourceSlotSupplyForPlayer([
      tile({ x: 0, y: 0, economicStructure: { ownerId: "p1", type: "FUR_SYNTHESIZER", status: "under_construction" } })
    ]);
    expect(totals.SUPPLY).toBe(0);
  });

  it("an Advanced synthesizer grants the same +1 as its base tier (no doubling)", () => {
    const totals = resourceSlotSupplyForPlayer([
      tile({ x: 0, y: 0, economicStructure: { ownerId: "p1", type: "ADVANCED_FUR_SYNTHESIZER", status: "active" } })
    ]);
    expect(totals.SUPPLY).toBe(1);
  });
});

describe("resourceSlotDemandForPlayer", () => {
  it("sums FORT/IRON_BASTION/THUNDER_BASTION at their own tier-specific IRON cost", () => {
    const totals = resourceSlotDemandForPlayer(
      [
        { fort: { ownerId: "p1", status: "active", variant: "FORT" } } as PartialTile as DomainTileState,
        { fort: { ownerId: "p1", status: "active", variant: "IRON_BASTION" } } as PartialTile as DomainTileState,
        { fort: { ownerId: "p1", status: "active", variant: "THUNDER_BASTION" } } as PartialTile as DomainTileState
      ],
      "p1"
    );
    expect(totals.IRON).toBe(1 + 2 + 4);
  });

  it("a fort with no variant recorded defaults to the base FORT requirement", () => {
    const totals = resourceSlotDemandForPlayer(
      [{ fort: { ownerId: "p1", status: "active" } } as PartialTile as DomainTileState],
      "p1"
    );
    expect(totals.IRON).toBe(1);
  });

  it("counts a structure regardless of status — under_construction, active, inactive, and removing all occupy their slot", () => {
    for (const status of ["under_construction", "active", "inactive", "removing"] as const) {
      const totals = resourceSlotDemandForPlayer(
        [{ economicStructure: { ownerId: "p1", type: "MARKET", status } } as PartialTile as DomainTileState],
        "p1"
      );
      expect(totals.FOOD).toBe(1);
    }
  });

  it("ignores structures owned by a different player", () => {
    const totals = resourceSlotDemandForPlayer(
      [{ fort: { ownerId: "someone-else", status: "active", variant: "FORT" } } as PartialTile as DomainTileState],
      "p1"
    );
    expect(totals).toEqual({ FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0 });
  });

  it("sums across every structure field on a tile independently (transient Fort-upgrade coexistence)", () => {
    const totals = resourceSlotDemandForPlayer(
      [
        {
          fort: { ownerId: "p1", status: "under_construction", variant: "FORT" },
          economicStructure: { ownerId: "p1", type: "WOODEN_FORT", status: "active" }
        } as PartialTile as DomainTileState
      ],
      "p1"
    );
    expect(totals.IRON).toBe(2);
  });

  it("§6.4: a synthesizer contributes zero demand — it's a slot source, not a consumer", () => {
    const totals = resourceSlotDemandForPlayer(
      [
        { economicStructure: { ownerId: "p1", type: "FUR_SYNTHESIZER", status: "active" } } as PartialTile as DomainTileState,
        { economicStructure: { ownerId: "p1", type: "ADVANCED_IRONWORKS", status: "active" } } as PartialTile as DomainTileState
      ],
      "p1"
    );
    expect(totals).toEqual({ FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0 });
  });

  it("sums observatory and siege outpost demand alongside fort/economic demand", () => {
    const totals = resourceSlotDemandForPlayer(
      [
        { observatory: { ownerId: "p1", status: "active" } } as PartialTile as DomainTileState,
        { siegeOutpost: { ownerId: "p1", status: "active", variant: "DREAD_TOWER" } } as PartialTile as DomainTileState
      ],
      "p1"
    );
    expect(totals.CRYSTAL).toBe(1);
    expect(totals.SUPPLY).toBe(3);
    expect(totals.IRON).toBe(2);
  });
});

describe("currentTileFieldSlotRequirements", () => {
  it("returns the fort field's current tier requirement when upgrading in place", () => {
    const target = { fort: { ownerId: "p1", status: "active", variant: "FORT" } } as PartialTile as DomainTileState;
    expect(currentTileFieldSlotRequirements(target, "fort", "p1")).toEqual([{ resource: "IRON", count: 1 }]);
  });

  it("returns [] for the fort field when a WOODEN_FORT (economicStructure) is what's actually there", () => {
    const target = { economicStructure: { ownerId: "p1", type: "WOODEN_FORT", status: "active" } } as PartialTile as DomainTileState;
    expect(currentTileFieldSlotRequirements(target, "fort", "p1")).toEqual([]);
  });

  it("returns [] when the tile field is unoccupied or owned by someone else", () => {
    expect(currentTileFieldSlotRequirements({} as DomainTileState, "economicStructure", "p1")).toEqual([]);
    const target = { economicStructure: { ownerId: "someone-else", type: "MARKET", status: "active" } } as PartialTile as DomainTileState;
    expect(currentTileFieldSlotRequirements(target, "economicStructure", "p1")).toEqual([]);
  });
});

describe("totalsFromSlotRequirements", () => {
  it("sums a mixed list of requirements into per-resource totals", () => {
    expect(totalsFromSlotRequirements([{ resource: "FOOD", count: 1 }, { resource: "CRYSTAL", count: 1 }])).toEqual({
      FOOD: 1,
      IRON: 0,
      CRYSTAL: 1,
      SUPPLY: 0
    });
  });
});
