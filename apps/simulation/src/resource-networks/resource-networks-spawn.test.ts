import { describe, expect, it } from "vitest";
import { computeFairSpawnSites, type DomainTileState } from "@border-empires/game-domain";
import { seedResourceNetworks } from "../resource-networks-worldgen.js";

describe("resource placement preserves future landings", () => {
  it("never fills the clear footprint of an existing qualified starter site", () => {
    const original = new Map<string, DomainTileState>();
    for (let y=0;y<80;y++) for (let x=0;x<160;x++) original.set(`${x},${y}`,{x,y,terrain:"LAND"});
    for (const y of [10,40,65]) for (const x of [10,40,70,100,130]) {
      original.get(`${x+8},${y}`)!.town={name:"Starter town",type:"MARKET",populationTier:"TOWN"};
      for (let dx=3;dx<=6;dx++) original.get(`${x+dx},${y}`)!.resource="FARM";
    }
    const options={requireStarterEconomy:true,width:160,height:80};
    const sites=computeFairSpawnSites([...original.values()],50,options);
    expect(sites.length).toBeGreaterThan(0);
    for (let seed=0;seed<12;seed++) {
      const tiles=new Map(original);
      seedResourceNetworks(tiles,seed,160,80, () => true);
      for (const site of sites) for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++)
        expect(tiles.get(`${site.x+dx},${site.y+dy}`)?.resource,`seed=${seed}, landing=${site.x},${site.y}`).toBeUndefined();
    }
  });
});
