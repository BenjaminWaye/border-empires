import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { NETWORK_RESOURCES, RESOURCE_NETWORKS, emptyNetworkSiteCounts } from "@border-empires/shared";
import { developedNetworkSites } from "./resource-networks.js";
import { seedResourceNetworks } from "../resource-networks-worldgen.js";

const site = (overrides: Partial<DomainTileState> = {}): DomainTileState => ({
  x: 2, y: 3, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED", resource: "NEURAL_RESIN",
  economicStructure: { ownerId: "p", type: "RESIN_EXTRACTOR", status: "active" }, ...overrides
});
describe("developed resource eligibility", () => {
  it("needs settlement, matching active extraction, ownership, slots and the owner's technology", () => {
    const tech = new Set(["neural-resin-processing"]);
    expect(developedNetworkSites([site()], "p", new Set(), tech).NEURAL_RESIN).toBe(1);
    const invalid = [site({ ownerId: "other" }), site({ ownershipState: "FRONTIER" }), site({ economicStructure: undefined }), site({ economicStructure: { ownerId:"other",type:"RESIN_EXTRACTOR",status:"active" } }),
      site({ economicStructure: { ownerId: "p", type: "RESIN_EXTRACTOR", status: "under_construction" } }),
      site({ economicStructure: { ownerId: "p", type: "MINE", status: "active" } })];
    expect(developedNetworkSites(invalid, "p", new Set(), tech)).toEqual(emptyNetworkSiteCounts());
    expect(developedNetworkSites([site()], "p", new Set(["2,3"]), tech).NEURAL_RESIN).toBe(0);
    expect(developedNetworkSites([site()], "p", new Set(), new Set()).NEURAL_RESIN).toBe(0);
  });
});
describe("economic resource map generation", () => {
  it("does no tile traversal for a House with no extraction technology", () => {
    let reads=0;
    function* tiles(): Generator<DomainTileState> { reads+=1; yield site(); }
    expect(developedNetworkSites(tiles(),"p",new Set(),new Set())).toEqual(emptyNetworkSiteCounts());
    expect(reads).toBe(0);
  });
  it("is deterministic, places exact area-scaled counts and preserves occupied/special terrain", () => {
    const build = (): Map<string, DomainTileState> => new Map(Array.from({length: 160 * 80}, (_, i) => {
      const tile: DomainTileState = { x: i % 160, y: Math.floor(i / 160), terrain: "LAND" };
      return [`${tile.x},${tile.y}`, tile];
    }));
    const a = build(), b = build();
    a.set("1,1", { x:1,y:1,terrain:"LAND",resource:"FARM" });
    b.set("1,1", { x:1,y:1,terrain:"LAND",resource:"FARM" });
    seedResourceNetworks(a, 123, 160, 80, () => false); seedResourceNetworks(b, 123, 160, 80, () => false);
    expect(a).toEqual(b);
    for (const resource of NETWORK_RESOURCES) expect([...a.values()].filter(tile => tile.resource === resource)).toHaveLength(Math.round(RESOURCE_NETWORKS[resource].sitesPerStandardMap / 16));
    expect(a.get("1,1")?.resource).toBe("FARM");
    const c = build(); seedResourceNetworks(c, 124, 160, 80, () => false);
    expect(c).not.toEqual(a);
    const d = new Map<string,DomainTileState>([["1,1",{x:1,y:1,terrain:"SEA"}], ["2,2",{x:2,y:2,terrain:"LAND",town:{name:"Town",type:"MARKET",populationTier:"TOWN"}}]]);
    seedResourceNetworks(d, 123, 640, 320, () => false);
    expect([...d.values()].some(tile => tile.resource)).toBe(false);
  });
});
