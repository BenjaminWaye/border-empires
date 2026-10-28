// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";

let threeActive = false;
vi.mock("../client-renderer-mode.js", () => ({ isTrue3DRendererActive: () => threeActive }));
const { createTownNameplates } = await import("./client-town-nameplates.js");

const townTile = (x: number, overrides: Partial<NonNullable<Tile["town"]>> = {}): Tile => ({
  x, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED",
  town: { name: `Town${x}`, type: "FARMING", isFed: true, goldPerMinute: 1, population: 20_000, maxPopulation: 100_000, populationGrowthPerMinute: 5, populationTier: "TOWN", ...overrides }
}) as Tile;

const mount = (profileSetupRequired = false) => {
  const host = document.createElement("div");
  const canvas = document.createElement("canvas");
  canvas.width = 800; canvas.height = 600;
  host.append(canvas); document.body.append(host);
  canvas.getBoundingClientRect = () => ({ width: 800, height: 600, left: 0, top: 0, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
  return { host, plates: createTownNameplates(canvas, { me: "me", authSessionReady: true, profileSetupRequired, playerColors: new Map([["me", "#e3b92b"]]) }) };
};
const at = (t: Tile, px: number, py: number) => ({ wx: t.x, wy: t.y, wk: `${t.x},${t.y}`, px, py, vis: "visible", t });
const project = () => ({ sx: 0, sy: 0 });

describe("createTownNameplates (2D path)", () => {
  it("draws a named plate with the struck-through food icon over an unfed own town", () => {
    const { host, plates } = mount();
    const unfed = townTile(1, { isFed: false, goldPerMinute: 0, populationGrowthPerMinute: 0 });
    plates.render([at(unfed, 100, 200)], { size: 40, project });
    const plate = host.querySelector<HTMLElement>(".town-plate");
    expect(plate?.querySelector(".town-plate-name")?.textContent).toBe("Town1");
    expect(plate?.querySelector('[data-status="unfed"] img')?.getAttribute("src")).toBe("/icons/simple/food.svg");
    expect(plate?.querySelector('[data-status="unfed"] .town-plate-slash')).not.toBeNull();
    expect(plate?.querySelector(".town-plate-pop")?.textContent).toBe("20k");
    expect(plate?.style.getPropertyValue("--town-plate-owner")).toBe("#e3b92b");
    expect(plate?.getAttribute("title")).toBe("Town1: Unfed");
  });

  it("keeps plates up when zoomed far out, like Civ banners, so calm towns stay marked", () => {
    const { host, plates } = mount();
    plates.render([at(townTile(1), 100, 200), at({ ...townTile(9), ownerId: "rival" } as Tile, 400, 200)], { size: 10, project });
    expect(Array.from(host.querySelectorAll(".town-plate-name")).map((el) => el.textContent).sort()).toEqual(["Town1", "Town9"]);
  });

  it("keeps only the higher-ranked plate when two would overlap, and removes plates that leave view", () => {
    const { host, plates } = mount();
    const calm = townTile(1), unfed = townTile(2, { isFed: false, goldPerMinute: 0, populationGrowthPerMinute: 0 });
    plates.render([at(calm, 100, 200), at(unfed, 110, 200)], { size: 40, project });
    expect(Array.from(host.querySelectorAll(".town-plate-name")).map((el) => el.textContent)).toEqual(["Town2"]);
    plates.render([], { size: 40, project });
    expect(host.querySelectorAll(".town-plate")).toHaveLength(0);
  });

  it("escapes town names instead of injecting them as HTML", () => {
    const { host, plates } = mount();
    plates.render([at(townTile(1, { name: "<img src=x>" }), 100, 200)], { size: 40, project });
    expect(host.querySelector(".town-plate img")).toBeNull();
    expect(host.querySelector(".town-plate-name")?.textContent).toBe("<img src=x>");
  });

  it("hides plates during profile setup, like the AFC layer", () => {
    const { host, plates } = mount(true);
    plates.render([at(townTile(1), 100, 200)], { size: 40, project });
    expect(host.querySelectorAll(".town-plate")).toHaveLength(0);
  });

  it("sits just above the 2D tile and moves by transform, so panning never dirties layout", () => {
    const { host, plates } = mount();
    plates.render([at(townTile(1), 100, 200)], { size: 8, project });
    const plate = host.querySelector<HTMLElement>(".town-plate");
    // Tile centre (104, 204) lifted by half a tile plus 4px: the plate's bottom is on the tile's top edge.
    expect(plate?.style.transform).toBe("translate3d(104px, 196px, 0) translate(-50%, -100%) scale(1.000)");
    expect(plate?.style.left).toBe("");
  });

  it("breaks rank ties by tile key, so two overlapping equal plates don't swap while panning", () => {
    const { host, plates } = mount();
    const a = townTile(1), b = townTile(2);
    plates.render([at(b, 110, 200), at(a, 100, 200)], { size: 40, project });
    plates.render([at(a, 100, 200), at(b, 110, 200)], { size: 40, project });
    expect(Array.from(host.querySelectorAll(".town-plate-name")).map((el) => el.textContent)).toEqual(["Town1"]);
  });

  it("lets two short plates sit closer than two long ones", () => {
    const { host, plates } = mount();
    const short = (x: number) => ({ ...townTile(x, { name: "Ux" }), ownerId: "rival" }) as Tile;
    plates.render([at(short(1), 100, 200), at(short(2), 170, 200)], { size: 40, project });
    expect(host.querySelectorAll(".town-plate")).toHaveLength(2);
    const long = (x: number) => ({ ...townTile(x, { name: "Harrowgate Reach" }), ownerId: "rival" }) as Tile;
    plates.render([at(long(1), 100, 200), at(long(2), 170, 200)], { size: 40, project });
    expect(host.querySelectorAll(".town-plate")).toHaveLength(1);
  });

  it("grows the plate as the 2D tiles grow, like Civ banners", () => {
    const { host, plates } = mount();
    plates.render([at(townTile(1), 100, 200)], { size: 192, project });
    expect(host.querySelector<HTMLElement>(".town-plate")?.style.transform).toMatch(/scale\(1\.600\)$/);
  });
});

describe("createTownNameplates (true-3D path)", () => {
  it("sits half a projected tile above the town and scales with it, not with the raw zoom", () => {
    threeActive = true;
    try {
      const { host, plates } = mount();
      // Camera projection: each world tile is 200 screen px wide, independent of the zoom value passed in.
      const project3d = (x: number, y: number) => ({ sx: 300 + x * 200, sy: 400 + y * 120 });
      plates.render([at(townTile(1), 0, 0)], { size: 160, project: project3d });
      // Centre (500, 400), lifted 100px (half the 200px tile), not 240px (1.5 × zoom) onto the tile behind.
      expect(host.querySelector<HTMLElement>(".town-plate")?.style.transform).toBe("translate3d(500px, 300px, 0) translate(-50%, -100%) scale(1.600)");
    } finally {
      threeActive = false;
    }
  });
});
