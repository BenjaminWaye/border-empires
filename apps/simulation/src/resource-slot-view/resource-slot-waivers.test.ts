import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { LIGHT_OUTPOST_FREE_FOOD_SLOT_COUNT } from "@border-empires/shared";
import { emptySlotWaivers, resourceSlotDemandForPlayer, resourceSlotDormantContributorsForPlayer } from "./resource-slot-view.js";
import { slotWaiversForPlayer } from "../tech-domain-bridge/slot-waivers.js";

// §23.2: Dwarf Kingdom/Fortress Realm (Fort IRON), Supply State (Siege
// Outpost SUPPLY), and Treasury State/Enduring Realm (town FOOD) — the
// count-based waiver redesign of the old, now-inert percentage-upkeep
// domain effects. These tests exercise the full path: domain ownership ->
// slotWaiversForPlayer -> resourceSlotDemandForPlayer/
// resourceSlotDormantContributorsForPlayer, matching how the real runtime
// wires the two together (runtime.ts's resourceSlotDemandForPlayer private
// method).
const tile = (overrides: Partial<DomainTileState> & Pick<DomainTileState, "x" | "y">): DomainTileState =>
  ({ terrain: "LAND", ...overrides }) as DomainTileState;

describe("§23.2 slot waivers — tech-domain-bridge wiring", () => {
  it("Fortress Realm's fortIronSlotWaiverCount (5) supersedes Dwarf Kingdom's (3) via max, not sum", () => {
    const dwarfOnly = { techIds: new Set(["masonry"]), domainIds: new Set(["iron-bastions"]) };
    const fortressOnly = { techIds: new Set(["steelworking"]), domainIds: new Set(["fortress-realm"]) };
    const both = { techIds: new Set(["masonry", "steelworking"]), domainIds: new Set(["iron-bastions", "fortress-realm"]) };
    expect(slotWaiversForPlayer(dwarfOnly).fortIronSlotWaiverCount).toBe(3);
    expect(slotWaiversForPlayer(fortressOnly).fortIronSlotWaiverCount).toBe(5);
    expect(slotWaiversForPlayer(both).fortIronSlotWaiverCount).toBe(5);
  });

  it("Supply State grants outpostSupplySlotWaiverCount 3", () => {
    const player = { techIds: new Set(["organized-supply"]), domainIds: new Set(["supply-state"]) };
    expect(slotWaiversForPlayer(player).outpostSupplySlotWaiverCount).toBe(3);
  });

  it("Treasury State grants firstTownsFoodSlotWaiverCount 3, Enduring Realm grants allTownsFoodSlotWaiverPerTown 1", () => {
    const treasury = { techIds: new Set(["banking"]), domainIds: new Set(["treasury-state"]) };
    const enduring = { techIds: new Set(["civil-service"]), domainIds: new Set(["enduring-realm"]) };
    expect(slotWaiversForPlayer(treasury).firstTownsFoodSlotWaiverCount).toBe(3);
    expect(slotWaiversForPlayer(enduring).allTownsFoodSlotWaiverPerTown).toBe(1);
  });

  it("a player with no relevant tech/domain gets an all-zero waiver set except the built-in Light Outpost waiver", () => {
    expect(slotWaiversForPlayer({ techIds: new Set(), domainIds: new Set() })).toEqual({
      ...emptySlotWaivers(),
      lightOutpostFoodSlotWaiverCount: LIGHT_OUTPOST_FREE_FOOD_SLOT_COUNT
    });
  });
});

describe("§23.2 slot waivers — resourceSlotDemandForPlayer", () => {
  it("waives IRON for the earliest-built N Forts, regardless of ladder tier", () => {
    const tiles = [
      tile({ x: 0, y: 0, fort: { ownerId: "p1", status: "active", variant: "FORT", activatedAt: 100 } }),
      tile({ x: 1, y: 0, fort: { ownerId: "p1", status: "active", variant: "IRON_BASTION", activatedAt: 200 } }),
      tile({ x: 2, y: 0, fort: { ownerId: "p1", status: "active", variant: "THUNDER_BASTION", activatedAt: 300 } }),
      tile({ x: 3, y: 0, fort: { ownerId: "p1", status: "active", variant: "FORT", activatedAt: 400 } })
    ];
    // Unwaived: 1 + 2 + 4 + 1 = 8 IRON.
    const unwaived = resourceSlotDemandForPlayer(tiles, "p1");
    expect(unwaived.IRON).toBe(8);
    // Waive the first 3 built (activatedAt 100/200/300) -> only the 4th Fort's 1 IRON remains.
    const waived = resourceSlotDemandForPlayer(tiles, "p1", { ...emptySlotWaivers(), fortIronSlotWaiverCount: 3 });
    expect(waived.IRON).toBe(1);
  });

  it("Siege Outpost waiver only zeroes the SUPPLY row, not a Siege Tower's separate IRON row", () => {
    const tiles = [
      tile({ x: 0, y: 0, siegeOutpost: { ownerId: "p1", status: "active", variant: "SIEGE_TOWER", activatedAt: 100 } })
    ];
    const waived = resourceSlotDemandForPlayer(tiles, "p1", { ...emptySlotWaivers(), outpostSupplySlotWaiverCount: 3 });
    expect(waived.SUPPLY).toBe(0);
    expect(waived.IRON).toBe(1);
  });

  it("firstTownsFoodSlotWaiverCount reduces only the first N towns (deterministic tile-key order), by 1 each", () => {
    const tiles = [
      tile({ x: 0, y: 0, ownerId: "p1", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN" } }),
      tile({ x: 1, y: 0, ownerId: "p1", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN" } }),
      tile({ x: 2, y: 0, ownerId: "p1", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN" } }),
      tile({ x: 3, y: 0, ownerId: "p1", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN" } })
    ];
    // Unwaived: 4 towns * 2 FOOD = 8.
    expect(resourceSlotDemandForPlayer(tiles, "p1").FOOD).toBe(8);
    const waived = resourceSlotDemandForPlayer(tiles, "p1", { ...emptySlotWaivers(), firstTownsFoodSlotWaiverCount: 3 });
    // First 3 (by tile-key order "0,0" < "1,0" < "2,0" < "3,0") drop to 1 FOOD each, 4th stays at 2.
    expect(waived.FOOD).toBe(1 + 1 + 1 + 2);
  });

  it("allTownsFoodSlotWaiverPerTown reduces every town by 1, uncapped", () => {
    const tiles = [
      tile({ x: 0, y: 0, ownerId: "p1", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN" } }),
      tile({ x: 1, y: 0, ownerId: "p1", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN" } })
    ];
    const waived = resourceSlotDemandForPlayer(tiles, "p1", { ...emptySlotWaivers(), allTownsFoodSlotWaiverPerTown: 1 });
    expect(waived.FOOD).toBe(1 + 1);
  });

  it("combining firstTownsFoodSlotWaiverCount and allTownsFoodSlotWaiverPerTown takes the max per town, not the sum", () => {
    const tiles = [tile({ x: 0, y: 0, ownerId: "p1", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN" } })];
    const waived = resourceSlotDemandForPlayer(tiles, "p1", {
      fortIronSlotWaiverCount: 0,
      outpostSupplySlotWaiverCount: 0,
      firstTownsFoodSlotWaiverCount: 1,
      allTownsFoodSlotWaiverPerTown: 1
    });
    // Base town FOOD demand is 2; both waivers independently say "1 fewer" -> stays at 1, not 0.
    expect(waived.FOOD).toBe(1);
  });

  it("a waiver never drives demand negative", () => {
    const tiles = [tile({ x: 0, y: 0, fort: { ownerId: "p1", status: "active", variant: "FORT", activatedAt: 100 } })];
    const waived = resourceSlotDemandForPlayer(tiles, "p1", { ...emptySlotWaivers(), fortIronSlotWaiverCount: 99 });
    expect(waived.IRON).toBe(0);
  });

  it("lightOutpostFoodSlotWaiverCount waives FOOD for the earliest-built N Light Outposts, leaving later ones charged", () => {
    const tiles = [
      tile({ x: 0, y: 0, economicStructure: { ownerId: "p1", type: "LIGHT_OUTPOST", status: "active", activatedAt: 100 } }),
      tile({ x: 1, y: 0, economicStructure: { ownerId: "p1", type: "LIGHT_OUTPOST", status: "active", activatedAt: 200 } }),
      tile({ x: 2, y: 0, economicStructure: { ownerId: "p1", type: "LIGHT_OUTPOST", status: "active", activatedAt: 300 } })
    ];
    // Unwaived: 3 outposts * 1 FOOD = 3.
    expect(resourceSlotDemandForPlayer(tiles, "p1").FOOD).toBe(3);
    // Waive the first 2 built -> only the 3rd (activatedAt 300) still demands 1 FOOD.
    const waived = resourceSlotDemandForPlayer(tiles, "p1", { ...emptySlotWaivers(), lightOutpostFoodSlotWaiverCount: 2 });
    expect(waived.FOOD).toBe(1);
  });

  it("the built-in Light Outpost waiver doesn't touch a Farmstead/Market's own FOOD demand on other tiles", () => {
    const tiles = [
      tile({ x: 0, y: 0, economicStructure: { ownerId: "p1", type: "LIGHT_OUTPOST", status: "active", activatedAt: 100 } }),
      tile({ x: 1, y: 0, economicStructure: { ownerId: "p1", type: "MARKET", status: "active", activatedAt: 200 } })
    ];
    const waived = resourceSlotDemandForPlayer(tiles, "p1", { ...emptySlotWaivers(), lightOutpostFoodSlotWaiverCount: 5 });
    // Light Outpost waived to 0, Market still demands its own 1 FOOD slot.
    expect(waived.FOOD).toBe(1);
  });
});

describe("§23.2 slot waivers — resourceSlotDormantContributorsForPlayer", () => {
  it("a waived Fort's IRON demand is never a dormancy candidate, even under a shortfall", () => {
    const tiles = [
      tile({ x: 0, y: 0, fort: { ownerId: "p1", status: "active", variant: "FORT", activatedAt: 100 } }),
      tile({ x: 1, y: 0, fort: { ownerId: "p1", status: "active", variant: "FORT", activatedAt: 200 } })
    ];
    // Both Forts waived (fortIronSlotWaiverCount 2) -> zero IRON demand -> zero supply is still enough, nothing dormant.
    const dormancy = resourceSlotDormantContributorsForPlayer(tiles, "p1", { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0 }, {
      ...emptySlotWaivers(),
      fortIronSlotWaiverCount: 2
    });
    expect(dormancy.IRON.size).toBe(0);
  });

  it("only the unwaived Fort can go dormant when supply is short", () => {
    const tiles = [
      tile({ x: 0, y: 0, fort: { ownerId: "p1", status: "active", variant: "FORT", activatedAt: 100 } }),
      tile({ x: 1, y: 0, fort: { ownerId: "p1", status: "active", variant: "FORT", activatedAt: 200 } })
    ];
    // Waive only the earliest-built Fort (count 1); the later one still demands 1 IRON against 0 supply.
    const dormancy = resourceSlotDormantContributorsForPlayer(tiles, "p1", { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0 }, {
      ...emptySlotWaivers(),
      fortIronSlotWaiverCount: 1
    });
    expect([...dormancy.IRON]).toEqual(["1,0:fort"]);
  });
});
