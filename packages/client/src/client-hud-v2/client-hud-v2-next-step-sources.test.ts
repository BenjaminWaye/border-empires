// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { scanNextStepSources } from "./client-hud-v2-next-step-sources.js";

const tile = (x: number, y: number, extra: Record<string, unknown> = {}): Tile => ({ x, y, terrain: "LAND", ...extra }) as unknown as Tile;
const mine = (x: number, y: number, extra: Record<string, unknown> = {}): Tile => tile(x, y, { ownerId: "me", ownershipState: "SETTLED", ...extra });
const town = (tier: string, name: string) => ({ town: { type: "MARKET", populationTier: tier, name } });
const state = (tiles: Tile[], manpower = 19, techIds: string[] = []) => {
  const s = createInitialState();
  s.me = "me";
  s.manpower = manpower;
  s.manpowerCap = 1920;
  s.homeTile = { x: 0, y: 0 };
  s.techIds = techIds;
  s.resourceSlots = { supply: { FOOD: 2, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }, demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 } };
  s.tiles = new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));
  return s;
};
const works = (shipped = 0) => ({ resource: "PRECURSOR_SALVAGE", economicStructure: { type: "RECLAMATION_WORKS", ownerId: "me", status: "active", salvageLoadsShipped: shipped } });

describe("next-step sources scan", () => {
  it("finds the nearest working salvage Works, skipping one that is empty or still a frontier claim", () => {
    expect(scanNextStepSources(state([mine(9, 9, works()), mine(1, 1, works(1))])).salvage).toMatchObject({ x: 1, y: 1 });
    expect(scanNextStepSources(state([mine(1, 1, works(3))])).salvage).toBeUndefined();
    expect(scanNextStepSources(state([mine(1, 1, { ...works(), ownershipState: "FRONTIER" })])).salvage).toBeUndefined();
    expect(scanNextStepSources(state([mine(1, 1, works(1))])).salvage).toEqual({ x: 1, y: 1, delivered: 1000, loads: 2 });
    // Full manpower: nothing to ship.
    expect(scanNextStepSources(state([mine(1, 1, works())], 1920)).salvage).toBeUndefined();
  });

  it("prefers an owned waystation over a nearer unclaimed one, and ignores activated or fogged ones", () => {
    const sources = scanNextStepSources(state([
      tile(1, 0, { waystation: { activated: false } }),
      mine(9, 9, { waystation: { activated: false } }),
      mine(2, 0, { waystation: { activated: true } }),
      mine(3, 0, { fogged: true, waystation: { activated: false } })
    ]));
    expect(sources.waystation).toEqual({ x: 9, y: 9, owned: true });
    expect(scanNextStepSources(state([tile(1, 0, { waystation: { activated: false } })])).waystation).toEqual({ x: 1, y: 0, owned: false });
  });

  it("picks the nearest visible unowned town", () => {
    const sources = scanNextStepSources(state([
      tile(20, 20, town("TOWN", "Far")),
      tile(3, 3, town("TOWN", "Near")),
      tile(1, 1, { ...town("TOWN", "Hidden"), fogged: true }),
      tile(2, 2, { ...town("TOWN", "Rival"), ownerId: "them" })
    ]));
    expect(sources.neutralTown).toEqual({ x: 3, y: 3, name: "Near" });
  });

  it("offers a Manufactory town only when the town menu's action would be enabled", () => {
    const plot = mine(11, 10);
    const towns = [mine(4, 4, town("SETTLEMENT", "Camp")), mine(10, 10, town("TOWN", "Ashford")), plot];
    // Manifest not researched.
    expect(scanNextStepSources(state(towns)).manufactoryTown).toBeUndefined();
    expect(scanNextStepSources(state(towns, 19, ["trade"])).manufactoryTown).toEqual({ x: 10, y: 10, name: "Ashford" });
    // Manufactories stack: a town that already has one still counts while it has an open plot.
    const built = mine(9, 10, { economicStructure: { type: "MANUFACTORY", ownerId: "me", status: "active" } });
    expect(scanNextStepSources(state([...towns, built], 19, ["trade"])).manufactoryTown).toEqual({ x: 10, y: 10, name: "Ashford" });
    // No free FOOD slot.
    const starved = state(towns, 19, ["trade"]);
    starved.resourceSlots = { supply: { FOOD: 1, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }, demand: { FOOD: 1, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 } };
    expect(scanNextStepSources(starved).manufactoryTown).toBeUndefined();
    // Review of #2867: no open plot next to the town (only an ungarrisoned claim), so the build button is disabled.
    expect(scanNextStepSources(state([towns[1]!, { ...plot, ownershipState: "FRONTIER" } as Tile], 19, ["trade"])).manufactoryTown).toBeUndefined();
  });
});
