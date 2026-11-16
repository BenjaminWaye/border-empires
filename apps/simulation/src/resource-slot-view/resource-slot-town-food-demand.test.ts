import { describe, expect, it } from "vitest";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { townFoodSlotDemandForTier } from "@border-empires/shared";
import { emptySlotWaivers, resourceSlotDemandForPlayer, townFoodSlotDemandByTileKey } from "./resource-slot-view.js";
import { slotWaiversForPlayer } from "../tech-domain-bridge/slot-waivers.js";
import { refreshTownEconomyFields } from "../player-update-economy/player-update-economy.js";

// Playtest 2026-11-16: the town screen's FOOD UPKEEP card showed the tier's base
// demand while an upgrade waived part of it. The card now reads the per-town
// number the simulation's own slot demand is built from.
const town = (x: number): DomainTileState => ({
  x, y: 0, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED",
  town: { type: "MARKET", populationTier: "TOWN", supportCurrent: 0, supportMax: 8 } as DomainTileState["town"]
});

describe("townFoodSlotDemandByTileKey", () => {
  it("is each town's FOOD demand after Enduring Realm's waiver, and sums to the player's FOOD demand", () => {
    const tiles = [town(0), town(1)];
    const enduring = slotWaiversForPlayer({ techIds: new Set(["civil-service"]), domainIds: new Set(["enduring-realm"]) });
    const base = townFoodSlotDemandForTier("TOWN");
    expect(townFoodSlotDemandByTileKey(tiles, "p1")).toEqual(new Map([["0,0", base], ["1,0", base]]));
    const waived = townFoodSlotDemandByTileKey(tiles, "p1", enduring);
    expect(waived).toEqual(new Map([["0,0", base - 1], ["1,0", base - 1]]));
    expect([...waived.values()].reduce((sum, n) => sum + n, 0)).toBe(resourceSlotDemandForPlayer(tiles, "p1", enduring).FOOD);
  });

  it("applies Treasury State to the first towns only", () => {
    const waived = townFoodSlotDemandByTileKey([town(0), town(1)], "p1", { ...emptySlotWaivers(), firstTownsFoodSlotWaiverCount: 1 });
    expect(waived.get("0,0")).toBe(townFoodSlotDemandForTier("TOWN") - 1);
    expect(waived.get("1,0")).toBe(townFoodSlotDemandForTier("TOWN"));
  });
});

describe("refreshTownEconomyFields food slot demand", () => {
  const player: DomainPlayer = {
    id: "p1", isAi: false, points: 0, manpower: 0, techIds: new Set<string>(), allies: new Set<string>(),
    mods: { attack: 1, defense: 1, income: 1, vision: 1 }, strategicResources: { FOOD: 10 }
  };

  it("stamps the waived demand on the town the client reads, and leaves it alone when not given", () => {
    const tile = town(0);
    const tiles = new Map([["0,0", tile]]);
    expect(refreshTownEconomyFields(tile.town!, tile, player, tiles, new Set(["0,0"]), undefined, undefined, new Set(), 2).foodSlotDemand).toBe(2);
    expect(refreshTownEconomyFields(tile.town!, tile, player, tiles, new Set(["0,0"])).foodSlotDemand).toBeUndefined();
  });
});
