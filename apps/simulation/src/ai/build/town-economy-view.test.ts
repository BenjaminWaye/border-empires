import { describe, expect, it } from "vitest";
import type { DomainTileState, PopulationTier } from "@border-empires/game-domain";
import type { EconomicStructureType } from "@border-empires/shared";

import { buildConnectedTownNetworkForPlayer, type ConnectedTownNetworkEntry } from "../../economy-network/economy-network.js";
import { buildTownEconomyView, TOWN_ECONOMY_VIEW_MAX_TOWNS } from "./town-economy-view.js";

const PLAYER = "ai-1";

const town = (x: number, y: number, populationTier: PopulationTier = "TOWN"): DomainTileState => ({
  x,
  y,
  terrain: "LAND",
  ownerId: PLAYER,
  ownershipState: "SETTLED",
  town: { name: `T${x}-${y}`, type: "FARMING", populationTier }
});

const land = (x: number, y: number, type?: EconomicStructureType, status: "active" | "under_construction" = "active"): DomainTileState => ({
  x,
  y,
  terrain: "LAND",
  ownerId: PLAYER,
  ownershipState: "SETTLED",
  ...(type ? { economicStructure: { ownerId: PLAYER, type, status } } : {})
});

const mapOf = (tiles: DomainTileState[]): Map<string, DomainTileState> => new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));

const emptyNetwork = new Map<string, ConnectedTownNetworkEntry>();

describe("buildTownEconomyView", () => {
  it("tallies stacking copies (built and under construction) and own amplifiers from the support ring", () => {
    const tiles = mapOf([
      town(20, 20),
      land(21, 20, "MANUFACTORY"),
      land(19, 20, "MANUFACTORY", "under_construction"),
      land(20, 21, "ANCILLARY_DEPOT"),
      land(20, 19, "ANCILLARY_FACTORY"),
      land(21, 21, "CLEARING_HOUSE", "under_construction")
    ]);
    const [entry] = buildTownEconomyView(PLAYER, ["20,20"], tiles, emptyNetwork);
    expect(entry).toMatchObject({
      townKey: "20,20",
      manufactories: 2,
      ancillaryDepots: 1,
      hasAncillaryFactory: true,
      clearingHouseInReach: true,
      tradeNexusInReach: false,
      ancillaryFactoriesInReach: 1,
      depotTownsInReach: 1,
      baseManpowerCap: 300,
      amplifiersUnderConstruction: ["CLEARING_HOUSE"]
    });
  });

  it("reads amplifiers in connected towns from the real connected-town network", () => {
    // Two towns joined by a settled corridor; the Trade Nexus and Clearing
    // House sit at the second town only.
    const tiles = mapOf([
      town(10, 10),
      land(11, 10),
      land(12, 10),
      land(13, 10, "TRADE_NEXUS"),
      town(14, 10),
      land(14, 11, "CLEARING_HOUSE"),
      land(15, 10, "NEURAL_WORKS"),
      land(14, 9, "ANCILLARY_FACTORY")
    ]);
    const network = buildConnectedTownNetworkForPlayer({ id: PLAYER, techIds: [], domainIds: [] }, tiles, tiles.values());
    const view = buildTownEconomyView(PLAYER, ["10,10", "14,10"], tiles, network);
    const first = view.find((e) => e.townKey === "10,10");
    expect(first).toMatchObject({
      connectedTownCount: 1,
      tradeNexusInReach: true,
      clearingHouseInReach: true,
      neuralWorksInReach: true,
      ancillaryFactoriesInReach: 1,
      manufactories: 0
    });
    expect(first?.connectedTownBonus).toBeGreaterThan(0);
  });

  it("leaves out settlements, other players' towns and unsettled towns", () => {
    const enemy: DomainTileState = { ...town(5, 5), ownerId: "other" };
    const tiles = mapOf([town(1, 1, "SETTLEMENT"), enemy, { ...town(9, 9), ownershipState: "FRONTIER" }, town(30, 30, "CITY")]);
    const view = buildTownEconomyView(PLAYER, ["1,1", "5,5", "9,9", "30,30", "missing"], tiles, emptyNetwork);
    expect(view.map((e) => e.townKey)).toEqual(["30,30"]);
  });

  it("caps the view at the richest towns", () => {
    const towns: DomainTileState[] = [];
    for (let i = 0; i < TOWN_ECONOMY_VIEW_MAX_TOWNS + 6; i += 1) towns.push(town(i * 5, 40, i === 3 ? "METROPOLIS" : "TOWN"));
    const view = buildTownEconomyView(PLAYER, towns.map((t) => `${t.x},${t.y}`), mapOf(towns), emptyNetwork);
    expect(view).toHaveLength(TOWN_ECONOMY_VIEW_MAX_TOWNS);
    expect(view[0]?.townKey).toBe("15,40");
  });

  it("reads each town's support ring once (bounded by towns × ring size, not the map)", () => {
    const tiles = mapOf([town(10, 10), town(30, 30, "METROPOLIS"), land(11, 10, "MANUFACTORY")]);
    let reads = 0;
    const counting = new Map(tiles);
    const originalGet = counting.get.bind(counting);
    counting.get = (key: string) => {
      reads += 1;
      return originalGet(key);
    };
    buildTownEconomyView(PLAYER, ["10,10", "30,30"], counting, emptyNetwork);
    // Radius-1 ring = 8 neighbours, radius-2 = 24, plus each town tile and
    // support-ring assignment checks. A full-map scan would be thousands.
    expect(reads).toBeLessThan(200);
  });
});
