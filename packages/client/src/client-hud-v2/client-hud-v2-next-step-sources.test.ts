import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { MANUFACTORY_MANIFEST_ID, scanNextStepSources } from "./client-hud-v2-next-step-sources.js";

const tile = (x: number, y: number, extra: Record<string, unknown> = {}): Tile => ({ x, y, terrain: "LAND", ...extra }) as unknown as Tile;
const mine = (x: number, y: number, extra: Record<string, unknown> = {}): Tile => tile(x, y, { ownerId: "me", ownershipState: "SETTLED", ...extra });
const town = (tier: string, name: string) => ({ town: { type: "MARKET", populationTier: tier, name } });
const state = (tiles: Tile[], manpower = 19) => ({
  me: "me", manpower, manpowerCap: 1920, homeTile: { x: 0, y: 0 },
  tiles: new Map(tiles.map((t) => [`${t.x},${t.y}`, t]))
});
const works = (shipped = 0) => ({ resource: "PRECURSOR_SALVAGE", economicStructure: { type: "RECLAMATION_WORKS", ownerId: "me", status: "active", salvageLoadsShipped: shipped } });
const afc = (modules: string[]) => ({ afc: { ownerId: "me", status: "active", modules } });

describe("next-step sources scan", () => {
  it("finds a working salvage Works, skipping one that is empty or still a frontier claim", () => {
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

  it("offers a Manufactory town only once the Manifest is installed, never a SETTLEMENT or a town that has one", () => {
    const towns = [mine(4, 4, town("SETTLEMENT", "Camp")), mine(10, 10, town("TOWN", "Ashford"))];
    expect(scanNextStepSources(state(towns)).manufactoryTown).toBeUndefined();
    expect(scanNextStepSources(state([...towns, mine(0, 0, afc([MANUFACTORY_MANIFEST_ID]))])).manufactoryTown).toEqual({ x: 10, y: 10, name: "Ashford" });
    const built = mine(11, 10, { economicStructure: { type: "MANUFACTORY", ownerId: "me", status: "active" } });
    expect(scanNextStepSources(state([...towns, built, mine(0, 0, afc([MANUFACTORY_MANIFEST_ID]))])).manufactoryTown).toBeUndefined();
  });
});
