// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";

vi.mock("../client-renderer-mode.js", () => ({ isTrue3DRendererActive: () => false }));
const { createTownNameplates } = await import("./client-town-nameplates.js");

const townTile = (x: number, overrides: Partial<NonNullable<Tile["town"]>> = {}): Tile => ({
  x, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED",
  town: { name: `Town${x}`, type: "FARMING", isFed: true, goldPerMinute: 1, population: 20_000, maxPopulation: 100_000, populationGrowthPerMinute: 5, populationTier: "TOWN", ...overrides }
}) as Tile;

const mount = () => {
  const host = document.createElement("div");
  const canvas = document.createElement("canvas");
  canvas.width = 800; canvas.height = 600;
  host.append(canvas); document.body.append(host);
  canvas.getBoundingClientRect = () => ({ width: 800, height: 600, left: 0, top: 0, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
  return { host, plates: createTownNameplates(canvas, { me: "me", authSessionReady: true }) };
};
const at = (t: Tile, px: number, py: number) => ({ wx: t.x, wy: t.y, wk: `${t.x},${t.y}`, px, py, vis: "visible", t });
const project = () => ({ sx: 0, sy: 0 });

describe("createTownNameplates (2D path)", () => {
  it("draws a named plate with the unfed status over an own town", () => {
    const { host, plates } = mount();
    const unfed = townTile(1, { isFed: false, goldPerMinute: 0, populationGrowthPerMinute: 0 });
    plates.render([at(unfed, 100, 200)], { size: 40, project });
    const plate = host.querySelector(".town-plate-full");
    expect(plate?.querySelector(".town-plate-name")?.textContent).toBe("Town1");
    expect(plate?.querySelector('[data-status="unfed"]')).not.toBeNull();
    expect(plate?.getAttribute("title")).toBe("Town1: Unfed");
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
});
