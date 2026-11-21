// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
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
  s.discoveredTiles = new Set(s.tiles.keys());
  return s;
};
/** Steps from (0,0), across the world seam where shorter. */
const fromOrigin = (at: { x: number; y: number } | undefined): number | undefined =>
  at && Math.min(at.x, WORLD_WIDTH - at.x) + Math.min(at.y, WORLD_HEIGHT - at.y);
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
    // A TOWN adds 300 max MP (credited to the pool once it settles) and 300 per 12h of regen: 100 per 4h batch while you hold under five towns.
    expect(sources.neutralTown).toEqual({ x: 3, y: 3, name: "Near", capAdded: 300, perBatch: 100 });
  });

  // Owner call 2026-11-20: the town row says what the town is worth, at the diminishing weight your town count gives it.
  it("weights the town's manpower per batch by how many towns you already hold", () => {
    const owned = Array.from({ length: 5 }, (_, i) => mine(40 + i * 3, 40, town("SETTLEMENT", `Own${i}`)));
    expect(scanNextStepSources(state([tile(3, 3, town("TOWN", "Near")), ...owned])).neutralTown).toMatchObject({ capAdded: 300, perBatch: 50 });
  });

  it("points explore at the unexplored tile nearest home", () => {
    // Known: a 3x3 block round home plus a far strip; (2,0) is the nearest coordinate missing from the map.
    const known: Tile[] = [];
    for (let y = -1; y <= 1; y += 1) for (let x = -1; x <= 1; x += 1) known.push(tile((x + WORLD_WIDTH) % WORLD_WIDTH, (y + WORLD_HEIGHT) % WORLD_HEIGHT));
    known.push(tile(30, 30));
    const explore = scanNextStepSources(state(known)).explore;
    expect(fromOrigin(explore)).toBe(2);
    expect(known.some((t) => t.x === explore?.x && t.y === explore?.y)).toBe(false);
  });

  // Review of #2903: after a reload, remembered ground is discovered but not in state.tiles; tapping it
  // offers no Explore, so it must not be suggested.
  it("skips discovered ground missing from the map, ranks across the world seam, and only runs with no other source", () => {
    const s = state([tile(0, 0)]);
    for (const key of ["1,0", "0,1", "0,-1"]) s.discoveredTiles.add(key);
    expect(scanNextStepSources(s).explore).toEqual({ x: WORLD_WIDTH - 1, y: 0 });
    // Home sits on the seam: ground just west of it is 2 steps away, not a world away.
    const seam = state([tile(0, 0), tile(WORLD_WIDTH - 1, 0), tile(1, 0), tile(0, 1), tile(0, WORLD_HEIGHT - 1)]);
    expect(fromOrigin(scanNextStepSources(seam).explore)).toBe(2);
    expect(scanNextStepSources(state([tile(0, 0), tile(3, 3, town("TOWN", "Near"))])).explore).toBeUndefined();
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
