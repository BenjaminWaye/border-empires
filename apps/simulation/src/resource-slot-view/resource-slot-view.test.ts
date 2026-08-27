import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import {
  currentTileFieldSlotRequirements,
  dormantStructureDetailsFromDormancy,
  emptySlotWaivers,
  resourceSlotDemandForPlayer,
  resourceSlotDormantContributorsForPlayer,
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

  it("maps TITANIUM/GEMS/UMBRITE to TITANIUM/CRYSTAL/UMBRITE at 1 base slot each", () => {
    const totals = resourceSlotSupplyForPlayer([
      tile({ x: 0, y: 0, resource: "TITANIUM" }),
      tile({ x: 1, y: 0, resource: "GEMS" }),
      tile({ x: 3, y: 0, resource: "UMBRITE" })
    ]);
    expect(totals).toEqual({ FOOD: 0, TITANIUM: 1, CRYSTAL: 1, UMBRITE: 1 });
  });

  it("an active Farmstead adds +2 FOOD slots to its own FARM tile", () => {
    const totals = resourceSlotSupplyForPlayer([
      tile({ x: 0, y: 0, resource: "FARM", economicStructure: { ownerId: "p1", type: "FARMSTEAD", status: "active" } })
    ]);
    expect(totals.FOOD).toBe(3);
  });

  it("a Farmstead still under construction does not yet boost its tile", () => {
    const totals = resourceSlotSupplyForPlayer([
      tile({ x: 0, y: 0, resource: "FARM", economicStructure: { ownerId: "p1", type: "FARMSTEAD", status: "under_construction" } })
    ]);
    expect(totals.FOOD).toBe(1);
  });

  it("an active Mine adds +1 TITANIUM slot, an active Umbrite Rig adds +1 UMBRITE slot", () => {
    const totals = resourceSlotSupplyForPlayer([
      tile({ x: 0, y: 0, resource: "TITANIUM", economicStructure: { ownerId: "p1", type: "MINE", status: "active" } }),
      tile({ x: 1, y: 0, resource: "UMBRITE", economicStructure: { ownerId: "p1", type: "UMBRITE_RIG", status: "active" } })
    ]);
    expect(totals.TITANIUM).toBe(2);
    expect(totals.UMBRITE).toBe(2);
  });

  it("an active Farmstead within Waterworks radius jumps from 3 to 5 FOOD slots", () => {
    const farmstead = tile({ x: 5, y: 5, resource: "FARM", economicStructure: { ownerId: "p1", type: "FARMSTEAD", status: "active" } });
    const totals = resourceSlotSupplyForPlayer([farmstead], new Set(["5,6"]));
    expect(totals.FOOD).toBe(5);
  });

  it("Waterworks radius bonus does not apply outside WATERWORKS_RADIUS", () => {
    const farmstead = tile({ x: 5, y: 5, resource: "FARM", economicStructure: { ownerId: "p1", type: "FARMSTEAD", status: "active" } });
    const totals = resourceSlotSupplyForPlayer([farmstead], new Set(["5,100"]));
    expect(totals.FOOD).toBe(3);
  });

  it("FISH gets no Farmstead or Waterworks bonus (fixed 2 slots forever)", () => {
    const fish = tile({ x: 5, y: 5, resource: "FISH" });
    const totals = resourceSlotSupplyForPlayer([fish], new Set(["5,6"]));
    expect(totals.FOOD).toBe(2);
  });

  it("an active Mine within Foundry radius jumps from 2 to 4 slots of its resource", () => {
    const mine = tile({ x: 5, y: 5, resource: "GEMS", economicStructure: { ownerId: "p1", type: "MINE", status: "active" } });
    const totals = resourceSlotSupplyForPlayer([mine], new Set(), new Set(["5,6"]));
    expect(totals.CRYSTAL).toBe(4);
  });

  it("Foundry radius bonus does not apply outside FOUNDRY_RADIUS", () => {
    const mine = tile({ x: 5, y: 5, resource: "TITANIUM", economicStructure: { ownerId: "p1", type: "MINE", status: "active" } });
    const totals = resourceSlotSupplyForPlayer([mine], new Set(), new Set(["5,100"]));
    expect(totals.TITANIUM).toBe(2);
  });

  it("a tile with no resource contributes nothing", () => {
    const totals = resourceSlotSupplyForPlayer([tile({ x: 0, y: 0 })]);
    expect(totals).toEqual({ FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 });
  });

  it("§5.3: an active Farmstead built on a FISH tile (placement-legal per structure-placement-metadata.json) does NOT boost it past the base 2", () => {
    const totals = resourceSlotSupplyForPlayer([
      tile({ x: 5, y: 5, resource: "FISH", economicStructure: { ownerId: "p1", type: "FARMSTEAD", status: "active" } })
    ]);
    expect(totals.FOOD).toBe(2);
  });

  it("fishFoodSlotBonus stacks with an active Farmstead's own (blocked) attempt on a FISH tile", () => {
    const totals = resourceSlotSupplyForPlayer(
      [tile({ x: 5, y: 5, resource: "FISH", economicStructure: { ownerId: "p1", type: "FARMSTEAD", status: "active" } })],
      new Set(),
      new Set(),
      undefined,
      1
    );
    expect(totals.FOOD).toBe(3);
  });

  it("an active Mine on a GEMS tile (placement-legal alongside TITANIUM) boosts CRYSTAL, not TITANIUM", () => {
    const totals = resourceSlotSupplyForPlayer([
      tile({ x: 5, y: 5, resource: "GEMS", economicStructure: { ownerId: "p1", type: "MINE", status: "active" } })
    ]);
    expect(totals).toEqual({ FOOD: 0, TITANIUM: 0, CRYSTAL: 2, UMBRITE: 0 });
  });

  it("an active Umbrite Rig on a UMBRITE tile boosts UMBRITE", () => {
    const totals = resourceSlotSupplyForPlayer([
      tile({ x: 5, y: 5, resource: "UMBRITE", economicStructure: { ownerId: "p1", type: "UMBRITE_RIG", status: "active" } })
    ]);
    expect(totals.UMBRITE).toBe(2);
  });

  it("§6.4: an active synthesizer grants +1 slot of its own resource, even on a tile with no matching resource", () => {
    const totals = resourceSlotSupplyForPlayer([
      tile({ x: 0, y: 0, economicStructure: { ownerId: "p1", type: "UMBRITE_SYNTHESIZER", status: "active" } }),
      tile({ x: 1, y: 0, economicStructure: { ownerId: "p1", type: "TITANIUM_WORKS", status: "active" } }),
      tile({ x: 2, y: 0, economicStructure: { ownerId: "p1", type: "CRYSTAL_SYNTHESIZER", status: "active" } })
    ]);
    expect(totals).toEqual({ FOOD: 0, TITANIUM: 1, CRYSTAL: 1, UMBRITE: 1 });
  });

  it("a synthesizer still under construction does not yet grant its slot", () => {
    const totals = resourceSlotSupplyForPlayer([
      tile({ x: 0, y: 0, economicStructure: { ownerId: "p1", type: "UMBRITE_SYNTHESIZER", status: "under_construction" } })
    ]);
    expect(totals.UMBRITE).toBe(0);
  });

  it("an Advanced synthesizer grants the same +1 as its base tier (no doubling)", () => {
    const totals = resourceSlotSupplyForPlayer([
      tile({ x: 0, y: 0, economicStructure: { ownerId: "p1", type: "ADVANCED_UMBRITE_SYNTHESIZER", status: "active" } })
    ]);
    expect(totals.UMBRITE).toBe(1);
  });

  it("domainGrantedSupply adds extra slots on top of tile-based supply", () => {
    const totals = resourceSlotSupplyForPlayer([], new Set(), new Set(), { TITANIUM: 1, CRYSTAL: 1 });
    expect(totals.TITANIUM).toBe(1);
    expect(totals.CRYSTAL).toBe(1);
    expect(totals.UMBRITE).toBe(0);
    expect(totals.FOOD).toBe(0);
  });

  it("an EXCHANGE-mode synthesizer grants no supply slot (it sells its slot off instead)", () => {
    const totals = resourceSlotSupplyForPlayer([
      tile({ x: 0, y: 0, economicStructure: { ownerId: "p1", type: "UMBRITE_SYNTHESIZER", status: "active", converterMode: "EXCHANGE" } }),
      tile({ x: 1, y: 0, economicStructure: { ownerId: "p1", type: "TITANIUM_WORKS", status: "active", converterMode: "EXCHANGE" } })
    ]);
    expect(totals).toEqual({ FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 });
  });

  it("an EXCHANGE-mode Advanced synthesizer also grants no supply slot", () => {
    const totals = resourceSlotSupplyForPlayer([
      tile({ x: 0, y: 0, economicStructure: { ownerId: "p1", type: "ADVANCED_UMBRITE_SYNTHESIZER", status: "active", converterMode: "EXCHANGE" } })
    ]);
    expect(totals.UMBRITE).toBe(0);
  });
});

describe("resourceSlotDemandForPlayer", () => {
  it("a settled, owned town draws 4 FOOD slots (§5.3)", () => {
    const totals = resourceSlotDemandForPlayer(
      [
        {
          x: 0, y: 0, ownerId: "p1", ownershipState: "SETTLED",
          town: { type: "FARMING", populationTier: "TOWN", name: "Town" }
        } as PartialTile as DomainTileState
      ],
      "p1"
    );
    expect(totals.FOOD).toBe(4);
  });

  it("town FOOD demand is additive with a structure sitting on the same tile", () => {
    const totals = resourceSlotDemandForPlayer(
      [
        {
          x: 0, y: 0, ownerId: "p1", ownershipState: "SETTLED",
          town: { type: "MARKET", populationTier: "TOWN", name: "Town" },
          economicStructure: { ownerId: "p1", type: "MINTWORKS", status: "active" }
        } as PartialTile as DomainTileState
      ],
      "p1"
    );
    expect(totals.FOOD).toBe(4 + 1);
  });

  it("ignores a town on a FRONTIER (not yet SETTLED) tile", () => {
    const totals = resourceSlotDemandForPlayer(
      [
        {
          x: 0, y: 0, ownerId: "p1", ownershipState: "FRONTIER",
          town: { type: "FARMING", populationTier: "TOWN", name: "Town" }
        } as PartialTile as DomainTileState
      ],
      "p1"
    );
    expect(totals.FOOD).toBe(0);
  });

  it("ignores a town owned by a different player", () => {
    const totals = resourceSlotDemandForPlayer(
      [
        {
          x: 0, y: 0, ownerId: "someone-else", ownershipState: "SETTLED",
          town: { type: "FARMING", populationTier: "TOWN", name: "Town" }
        } as PartialTile as DomainTileState
      ],
      "p1"
    );
    expect(totals.FOOD).toBe(0);
  });

  it("sums FORT/TITANIUM_BASTION/THUNDER_BASTION at their own tier-specific TITANIUM cost", () => {
    const totals = resourceSlotDemandForPlayer(
      [
        { fort: { ownerId: "p1", status: "active", variant: "FORT" } } as PartialTile as DomainTileState,
        { fort: { ownerId: "p1", status: "active", variant: "TITANIUM_BASTION" } } as PartialTile as DomainTileState,
        { fort: { ownerId: "p1", status: "active", variant: "THUNDER_BASTION" } } as PartialTile as DomainTileState
      ],
      "p1"
    );
    expect(totals.TITANIUM).toBe(1 + 2 + 4);
  });

  it("a fort with no variant recorded defaults to the base FORT requirement", () => {
    const totals = resourceSlotDemandForPlayer(
      [{ fort: { ownerId: "p1", status: "active" } } as PartialTile as DomainTileState],
      "p1"
    );
    expect(totals.TITANIUM).toBe(1);
  });

  it("counts a structure regardless of status — under_construction, active, inactive, and removing all occupy their slot", () => {
    for (const status of ["under_construction", "active", "inactive", "removing"] as const) {
      const totals = resourceSlotDemandForPlayer(
        [{ economicStructure: { ownerId: "p1", type: "MINTWORKS", status } } as PartialTile as DomainTileState],
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
    expect(totals).toEqual({ FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 });
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
    // The in-progress FORT upgrade draws its own 1 TITANIUM slot; the still-active
    // Wooden Fort it's replacing draws 1 FOOD slot (not TITANIUM) — both fields
    // count independently while they transiently coexist mid-upgrade.
    expect(totals.TITANIUM).toBe(1);
    expect(totals.FOOD).toBe(1);
  });

  it("§6.4: a synthesizer contributes zero demand — it's a slot source, not a consumer", () => {
    const totals = resourceSlotDemandForPlayer(
      [
        { economicStructure: { ownerId: "p1", type: "UMBRITE_SYNTHESIZER", status: "active" } } as PartialTile as DomainTileState,
        { economicStructure: { ownerId: "p1", type: "ADVANCED_TITANIUM_WORKS", status: "active" } } as PartialTile as DomainTileState
      ],
      "p1"
    );
    expect(totals).toEqual({ FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 });
  });

  it("an EXCHANGE-mode synthesizer consumes 1 slot of its family resource", () => {
    const totals = resourceSlotDemandForPlayer(
      [
        { economicStructure: { ownerId: "p1", type: "UMBRITE_SYNTHESIZER", status: "active", converterMode: "EXCHANGE" } } as PartialTile as DomainTileState,
        { economicStructure: { ownerId: "p1", type: "TITANIUM_WORKS", status: "active", converterMode: "EXCHANGE" } } as PartialTile as DomainTileState,
        { economicStructure: { ownerId: "p1", type: "CRYSTAL_SYNTHESIZER", status: "active", converterMode: "EXCHANGE" } } as PartialTile as DomainTileState
      ],
      "p1"
    );
    expect(totals).toEqual({ FOOD: 0, TITANIUM: 1, CRYSTAL: 1, UMBRITE: 1 });
  });

  it("a SYNTHESIZE-mode synthesizer contributes zero demand even with the mode field set", () => {
    const totals = resourceSlotDemandForPlayer(
      [
        { economicStructure: { ownerId: "p1", type: "UMBRITE_SYNTHESIZER", status: "active", converterMode: "SYNTHESIZE" } } as PartialTile as DomainTileState
      ],
      "p1"
    );
    expect(totals.UMBRITE).toBe(0);
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
    expect(totals.UMBRITE).toBe(3);
    expect(totals.TITANIUM).toBe(2);
  });

  it("each additional Observatory costs progressively more CRYSTAL upkeep — 1st=1, 2nd=2, 3rd=3", () => {
    const totals = resourceSlotDemandForPlayer(
      [
        { x: 0, y: 0, observatory: { ownerId: "p1", status: "active", activatedAt: 1_000 } } as PartialTile as DomainTileState,
        { x: 1, y: 0, observatory: { ownerId: "p1", status: "active", activatedAt: 3_000 } } as PartialTile as DomainTileState,
        { x: 2, y: 0, observatory: { ownerId: "p1", status: "active", activatedAt: 2_000 } } as PartialTile as DomainTileState
      ],
      "p1"
    );
    // 1 (earliest, activatedAt 1000) + 2 (2nd by build order, activatedAt 2000) + 3 (3rd, activatedAt 3000) = 6.
    expect(totals.CRYSTAL).toBe(6);
  });

  it("Watchtower Engine's free observatory doesn't count toward another Observatory's progressive rank", () => {
    const totals = resourceSlotDemandForPlayer(
      [
        {
          x: 0, y: 0,
          observatory: { ownerId: "p1", status: "active", activatedAt: 500 },
          naturalWonder: { type: "WATCHTOWER_ENGINE" }
        } as PartialTile as DomainTileState,
        { x: 1, y: 0, observatory: { ownerId: "p1", status: "active", activatedAt: 1_000 } } as PartialTile as DomainTileState
      ],
      "p1"
    );
    // The Watchtower Engine's own observatory is exempt entirely (addContributor
    // is never called for it), so the real one is still the 1st (and only) paid copy.
    expect(totals.CRYSTAL).toBe(1);
  });
});

describe("currentTileFieldSlotRequirements", () => {
  it("returns the fort field's current tier requirement when upgrading in place", () => {
    const target = { fort: { ownerId: "p1", status: "active", variant: "FORT" } } as PartialTile as DomainTileState;
    expect(currentTileFieldSlotRequirements(target, "fort", "p1")).toEqual([{ resource: "TITANIUM", count: 1 }]);
  });

  it("returns [] for the fort field when a WOODEN_FORT (economicStructure) is what's actually there", () => {
    const target = { economicStructure: { ownerId: "p1", type: "WOODEN_FORT", status: "active" } } as PartialTile as DomainTileState;
    expect(currentTileFieldSlotRequirements(target, "fort", "p1")).toEqual([]);
  });

  it("returns [] when the tile field is unoccupied or owned by someone else", () => {
    expect(currentTileFieldSlotRequirements({} as DomainTileState, "economicStructure", "p1")).toEqual([]);
    const target = { economicStructure: { ownerId: "someone-else", type: "MINTWORKS", status: "active" } } as PartialTile as DomainTileState;
    expect(currentTileFieldSlotRequirements(target, "economicStructure", "p1")).toEqual([]);
  });
});

describe("resourceSlotDormantContributorsForPlayer", () => {
  it("marks nothing dormant when supply covers demand", () => {
    const tiles = [tile({ x: 0, y: 0, fort: { ownerId: "p1", status: "active", variant: "FORT", activatedAt: 100 } })];
    const dormancy = resourceSlotDormantContributorsForPlayer(tiles, "p1", { FOOD: 0, TITANIUM: 1, CRYSTAL: 0, UMBRITE: 0 });
    expect(dormancy.TITANIUM.size).toBe(0);
  });

  it("marks only the newest-activated Fort dormant when TITANIUM supply is short by one", () => {
    const tiles = [
      tile({ x: 0, y: 0, fort: { ownerId: "p1", status: "active", variant: "FORT", activatedAt: 100 } }),
      tile({ x: 1, y: 0, fort: { ownerId: "p1", status: "active", variant: "FORT", activatedAt: 200 } })
    ];
    // demand = 2 TITANIUM (1 per Fort), supply = 1 -> short by 1, newest (activatedAt 200) goes dormant
    const dormancy = resourceSlotDormantContributorsForPlayer(tiles, "p1", { FOOD: 0, TITANIUM: 1, CRYSTAL: 0, UMBRITE: 0 });
    expect([...dormancy.TITANIUM]).toEqual(["1,0:fort"]);
  });

  it("a structure needing multiple resources is only dormant for the resource that's actually short", () => {
    const tiles = [
      tile({ x: 0, y: 0, economicStructure: { ownerId: "p1", type: "FOUNDRY", status: "active", activatedAt: 100 } })
    ];
    // FOUNDRY needs 1 FOOD + 1 CRYSTAL. Supply covers CRYSTAL but not FOOD.
    const dormancy = resourceSlotDormantContributorsForPlayer(tiles, "p1", { FOOD: 0, TITANIUM: 0, CRYSTAL: 1, UMBRITE: 0 });
    expect([...dormancy.FOOD]).toEqual(["0,0:economicStructure"]);
    expect(dormancy.CRYSTAL.size).toBe(0);
  });

  it("without a settledAtByTileKey map, falls back to protecting a town's FOOD demand as the oldest contributor", () => {
    const tiles = [
      tile({ x: 0, y: 0, ownerId: "p1", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN" } }),
      tile({ x: 1, y: 0, ownerId: "p1", economicStructure: { ownerId: "p1", type: "MINTWORKS", status: "active", activatedAt: 500 } })
    ];
    // Town falls back to activatedAt 0 (oldest); demand 5 vs supply 4.
    const dormancy = resourceSlotDormantContributorsForPlayer(tiles, "p1", { FOOD: 4, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 });
    expect([...dormancy.FOOD]).toEqual(["1,0:economicStructure"]);
  });

  it("a newly settled town's own FOOD demand goes dormant first, not an older, unrelated structure", () => {
    const tiles = [
      // Mintworks (activatedAt 100) predates the town's settlement (500).
      tile({ x: 1, y: 0, ownerId: "p1", economicStructure: { ownerId: "p1", type: "MINTWORKS", status: "active", activatedAt: 100 } }),
      tile({ x: 0, y: 0, ownerId: "p1", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN" } })
    ];
    const dormancy = resourceSlotDormantContributorsForPlayer(
      tiles, "p1", { FOOD: 4, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }, emptySlotWaivers(), new Map([["0,0", 500]])
    );
    // Town (newest) goes dormant, not the long-since-built Mintworks.
    expect([...dormancy.FOOD]).toEqual(["0,0:town"]);
  });

  it("skips synthesizers entirely (they provide supply, never consume it, so never go dormant)", () => {
    const tiles = [
      tile({ x: 0, y: 0, economicStructure: { ownerId: "p1", type: "TITANIUM_WORKS", status: "active", activatedAt: 100 } })
    ];
    const dormancy = resourceSlotDormantContributorsForPlayer(tiles, "p1", { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 });
    expect(dormancy.TITANIUM.size).toBe(0);
  });

  it("an EXCHANGE-mode synthesizer consumes a slot, so it goes dormant when that slot's supply is short", () => {
    const tiles = [
      tile({ x: 0, y: 0, economicStructure: { ownerId: "p1", type: "TITANIUM_WORKS", status: "active", activatedAt: 100, converterMode: "EXCHANGE" } })
    ];
    // EXCHANGE TITANIUM_WORKS demands 1 TITANIUM but supply is 0 -> dormant on TITANIUM.
    const dormancy = resourceSlotDormantContributorsForPlayer(tiles, "p1", { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 });
    expect([...dormancy.TITANIUM]).toEqual(["0,0:economicStructure"]);
  });

  it("a SYNTHESIZE-mode synthesizer never goes dormant even when its resource supply is short", () => {
    const tiles = [
      tile({ x: 0, y: 0, economicStructure: { ownerId: "p1", type: "TITANIUM_WORKS", status: "active", activatedAt: 100, converterMode: "SYNTHESIZE" } })
    ];
    const dormancy = resourceSlotDormantContributorsForPlayer(tiles, "p1", { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 });
    expect(dormancy.TITANIUM.size).toBe(0);
  });
});

describe("dormantStructureDetailsFromDormancy", () => {
  it("returns nothing when nothing is dormant", () => {
    const dormancy = resourceSlotDormantContributorsForPlayer([], "p1", { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 });
    expect(dormantStructureDetailsFromDormancy(dormancy)).toEqual([]);
  });

  it("§14.2: lists a dormant structure's key with the single resource it's short on", () => {
    const tiles = [
      tile({ x: 0, y: 0, fort: { ownerId: "p1", status: "active", variant: "FORT", activatedAt: 100 } }),
      tile({ x: 1, y: 0, fort: { ownerId: "p1", status: "active", variant: "FORT", activatedAt: 200 } })
    ];
    const dormancy = resourceSlotDormantContributorsForPlayer(tiles, "p1", { FOOD: 0, TITANIUM: 1, CRYSTAL: 0, UMBRITE: 0 });
    expect(dormantStructureDetailsFromDormancy(dormancy)).toEqual([{ key: "1,0:fort", resources: ["TITANIUM"] }]);
  });

  it("groups a multi-resource structure's dormancy into one entry with both resources", () => {
    const tiles = [
      tile({ x: 0, y: 0, economicStructure: { ownerId: "p1", type: "FOUNDRY", status: "active", activatedAt: 100 } })
    ];
    // FOUNDRY needs 1 FOOD + 1 CRYSTAL; neither is supplied.
    const dormancy = resourceSlotDormantContributorsForPlayer(tiles, "p1", { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 });
    const details = dormantStructureDetailsFromDormancy(dormancy);
    expect(details).toHaveLength(1);
    expect(details[0]?.key).toBe("0,0:economicStructure");
    expect(details[0]?.resources.sort()).toEqual(["CRYSTAL", "FOOD"]);
  });

  it("excludes town FOOD dormancy — that's surfaced separately via town.isFed", () => {
    const tiles = [
      tile({ x: 0, y: 0, ownerId: "p1", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN" } })
    ];
    const dormancy = resourceSlotDormantContributorsForPlayer(tiles, "p1", { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 });
    expect(dormantStructureDetailsFromDormancy(dormancy)).toEqual([]);
  });
});

describe("totalsFromSlotRequirements", () => {
  it("sums a mixed list of requirements into per-resource totals", () => {
    expect(totalsFromSlotRequirements([{ resource: "FOOD", count: 1 }, { resource: "CRYSTAL", count: 1 }])).toEqual({
      FOOD: 1,
      TITANIUM: 0,
      CRYSTAL: 1,
      UMBRITE: 0
    });
  });
});
