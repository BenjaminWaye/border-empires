import { describe, expect, it } from "vitest";
import type { TechInfo } from "../client-tech-info-types.js";
import type { Tile } from "../client-types.js";
import { afcBayAngleRadians, afcModuleBaysView, type AfcModuleBaysState } from "./client-afc-module-bays-model.js";

const tech = (id: string, name: string, branch: string, description = ""): TechInfo =>
  ({ id, name, branch, tier: 1, description, mods: {}, requirements: { gold: 0, resources: {} }, manifestCategory: "AFC_MODULE" }) as TechInfo;

const CATALOG: TechInfo[] = [
  tech("masonry", "Titanium Forge Module", "war", "AFC module: a heavy plate-forging system. Unlocks Fort."),
  tech("workshops", "Umbrite Synthesis Module", "economy"),
  tech("radar", "Resonance Grid Module", "aether"),
  tech("muster-discipline", "Hive Mind Module I", "war")
];

const afcTile = (x: number, y: number, afc: Partial<NonNullable<Tile["afc"]>>, ownerId = "me"): Tile =>
  ({ x, y, terrain: "LAND", ownerId, ownershipState: "SETTLED", afc: { ownerId, status: "active", ...afc } }) as Tile;

const stateWith = (tiles: Tile[], techIds: string[]): AfcModuleBaysState => ({
  me: "me",
  techIds,
  techCatalog: CATALOG,
  tiles: new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile]))
});

describe("afcBayAngleRadians", () => {
  it("places the 8 bays 45 degrees apart, matching the 3D socket ring", () => {
    expect(afcBayAngleRadians(0)).toBe(0);
    expect(afcBayAngleRadians(2)).toBeCloseTo(Math.PI / 2);
    expect(afcBayAngleRadians(7)).toBeCloseTo((7 * Math.PI) / 4);
  });
});

describe("afcModuleBaysView", () => {
  it("fills bays in docking order then incoming, and marks captured copies and empty bays", () => {
    const tile = afcTile(1, 1, {
      modules: ["masonry", "workshops"],
      houseModules: ["masonry"],
      incomingModules: [{ techId: "radar", arrivesAt: 31_000 }]
    });

    const view = afcModuleBaysView(stateWith([tile], ["masonry", "radar"]), tile, 1_000)!;

    expect(view.bays.map((bay) => bay.state)).toEqual(["docked", "captured", "incoming", "empty", "empty", "empty", "empty", "empty"]);
    expect(view.bays[0]).toMatchObject({ name: "Titanium Forge Module", shortName: "TF", family: "war", description: "a heavy plate-forging system. Unlocks Fort." });
    expect(view.bays[2]).toMatchObject({ remainingLabel: "Lands in 30s" });
    expect(view.bays[0]).toMatchObject({ leftPercent: 88, topPercent: 50 });
    expect(view.bays[2]).toMatchObject({ leftPercent: 50, topPercent: 88 });
    expect(view).toMatchObject({ usedCount: 3, incomingCount: 1, isOwner: true, dormant: false });
  });

  it("lists call-down candidates with where each module is now", () => {
    const here = afcTile(1, 1, {});
    const other = afcTile(9, 9, { modules: ["masonry"], houseModules: ["masonry"] });

    const view = afcModuleBaysView(stateWith([here, other], ["masonry", "workshops", "muster-discipline"]), here)!;

    expect(view.candidates.map((candidate) => [candidate.techId, candidate.whereLabel, candidate.actionId])).toEqual([
      ["masonry", "Docked at the AFC at (9, 9) — moves here", "redeploy_afc_module:masonry"],
      ["workshops", "Not docked — what it unlocks is inactive", "redeploy_afc_module:workshops"],
      ["muster-discipline", "Not docked — what it unlocks is inactive", "redeploy_afc_module:muster-discipline"]
    ]);
    expect(view.bays[0]?.shortName).toBeUndefined();
  });

  it("keeps the numeral in short bay labels so Hive Mind I and II differ", () => {
    const tile = afcTile(1, 1, { modules: ["muster-discipline"] });
    expect(afcModuleBaysView(stateWith([tile], []), tile)!.bays[0]?.shortName).toBe("HMI");
  });

  it("is read-only on another player's AFC", () => {
    const tile = afcTile(1, 1, { modules: ["masonry"] }, "enemy");
    const view = afcModuleBaysView(stateWith([tile], ["workshops"]), tile)!;
    expect(view.isOwner).toBe(false);
    expect(view.candidates).toEqual([]);
  });

  it("keeps modules beyond 8 bays (pre-cap captured copies) in an overflow list", () => {
    const nine = ["a", "b", "c", "d", "e", "f", "g", "h", "masonry"];
    const tile = afcTile(1, 1, { modules: nine });
    const view = afcModuleBaysView(stateWith([tile], []), tile)!;
    expect(view.usedCount).toBe(8);
    expect(view.overflow.map((bay) => bay.techId)).toEqual(["masonry"]);
  });
});
