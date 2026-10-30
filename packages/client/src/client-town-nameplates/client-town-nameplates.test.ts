// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";

let threeActive = false;
vi.mock("../client-renderer-mode.js", () => ({ isTrue3DRendererActive: () => threeActive }));
const { createTownNameplates, placeNameplates } = await import("./client-town-nameplates.js");

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
    expect(plate?.querySelector('[data-status="unfed"] img')?.getAttribute("src")).toBe("/icons/resources/food-96.png");
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
    // Tile centre x 104; the plate's bottom is 4px above the tile's top edge (y 200).
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

describe("paused growth", () => {
  it("shows a nearby-war town as growth struck through, not crossed swords", () => {
    const { host, plates } = mount();
    plates.render([at(townTile(1, { nearbyWarPausedUntil: Date.now() + 60_000 }), 100, 200)], { size: 40, project });
    const badge = host.querySelector('[data-status="war"]');
    expect(badge?.querySelector("img")?.getAttribute("src")).toBe("/icons/simple/town-growth.svg");
    expect(badge?.querySelector(".town-plate-slash")).not.toBeNull();
    expect(host.querySelector(".town-plate")?.getAttribute("title")).toBe("Town1: Growth paused: nearby war");
  });
});

describe("createTownNameplates (true-3D path)", () => {
  it("sits on the town tile's projected back edge and scales with the tile, not with the raw zoom", () => {
    threeActive = true;
    try {
      const { host, plates } = mount();
      // Camera projection: each world tile is 200 screen px wide, independent of the zoom value passed in.
      const project3d = (x: number, y: number) => ({ sx: 300 + x * 200, sy: 400 + y * 120 });
      plates.render([at(townTile(1), 0, 0)], { size: 160, project: project3d });
      // Tile centre (500, 400), 120px deep: back edge at y 340, plate bottom 4px above it.
      // The old lift (1.5 × zoom = 240px) put it at y 160, deep in the tile behind.
      expect(host.querySelector<HTMLElement>(".town-plate")?.style.transform).toBe("translate3d(500px, 336px, 0) translate(-50%, -100%) scale(1.600)");
    } finally {
      threeActive = false;
    }
  });

  it("finds the back edge whichever way world y runs on screen", () => {
    threeActive = true;
    try {
      const { host, plates } = mount();
      const flipped = (x: number, y: number) => ({ sx: 300 + x * 200, sy: 400 - y * 120 });
      plates.render([at(townTile(1), 0, 0)], { size: 160, project: flipped });
      expect(host.querySelector<HTMLElement>(".town-plate")?.style.transform).toContain("translate3d(500px, 336px, 0)");
    } finally {
      threeActive = false;
    }
  });
});

describe("placeNameplates", () => {
  const plate = (rank: number) => ({ name: "Ux", ownerId: "me", own: true, rank });
  it("treats plates as growing upward from their bottom when their scales differ", () => {
    // A big near plate (1.6x) and a small far one (1x) stacked: the big one spans 51.2px up from its bottom.
    const near = { key: "a", plate: plate(2), x: 100, y: 300, scale: 1.6 };
    const above = { key: "b", plate: plate(1), x: 100, y: 255, scale: 1 };
    expect(placeNameplates([near, above]).map((p) => p.key)).toEqual(["a"]);
    const clear = { key: "c", plate: plate(1), x: 100, y: 245, scale: 1 };
    expect(placeNameplates([near, clear]).map((p) => p.key)).toEqual(["a", "c"]);
  });
});
