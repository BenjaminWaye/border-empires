import { describe, expect, it } from "vitest";
import { createSolarSystem, disposeSolarSystem, animateSolarSystem } from "./client-space-solar-system.js";
import { decorativeOrbitBodyCount, type SpacePlanetViewModel } from "../client-space-view-state.js";

const planet = (overrides: Partial<SpacePlanetViewModel> = {}): SpacePlanetViewModel => ({
  seasonId: "season-1",
  tier: "PLANET",
  label: "Aurelia",
  state: "owned",
  ...overrides
});

describe("createSolarSystem", () => {
  it("positions the system group at the given world position", () => {
    const entry = createSolarSystem(planet(), { x: 1, y: 2, z: 3 });
    expect(entry.group.position.toArray()).toEqual([1, 2, 3]);
  });

  it("builds a sun and the deterministic number of decorative bodies for a known system", () => {
    const p = planet({ seasonId: "season-known" });
    const entry = createSolarSystem(p, { x: 0, y: 0, z: 0 });
    expect(entry.sun).toBeDefined();
    expect(entry.decoratives).toHaveLength(decorativeOrbitBodyCount("season-known"));
  });

  it("skips the sun and decoratives entirely for an unknown (fogged) system", () => {
    const entry = createSolarSystem(planet({ state: "unknown" }), { x: 0, y: 0, z: 0 });
    expect(entry.sun).toBeUndefined();
    expect(entry.decoratives).toHaveLength(0);
  });

  it("stamps the real planet body's seasonId for picking, unlike decorative bodies", () => {
    const entry = createSolarSystem(planet({ seasonId: "season-pick" }), { x: 0, y: 0, z: 0 });
    expect(entry.planet.group.userData.seasonId).toBe("season-pick");
    for (const { mesh } of entry.decoratives) {
      expect(mesh.userData.seasonId).toBeUndefined();
    }
  });

  it("is deterministic: the same seasonId always produces the same decorative layout", () => {
    const a = createSolarSystem(planet({ seasonId: "season-det" }), { x: 0, y: 0, z: 0 });
    const b = createSolarSystem(planet({ seasonId: "season-det" }), { x: 0, y: 0, z: 0 });
    expect(a.decoratives.map((d) => d.radius)).toEqual(b.decoratives.map((d) => d.radius));
    expect(a.decoratives.map((d) => d.speed)).toEqual(b.decoratives.map((d) => d.speed));
  });
});

describe("animateSolarSystem", () => {
  it("advances the planet's own orbit and every decorative body's orbit without throwing", () => {
    const entry = createSolarSystem(planet(), { x: 0, y: 0, z: 0 });
    const before = entry.planetOrbit.pivot.rotation.y;
    animateSolarSystem(entry, 1.5);
    expect(entry.planetOrbit.pivot.rotation.y).not.toBe(before);
  });
});

describe("disposeSolarSystem", () => {
  it("does not throw for a system with decoratives", () => {
    expect(() => disposeSolarSystem(createSolarSystem(planet(), { x: 0, y: 0, z: 0 }))).not.toThrow();
  });

  it("does not throw for a fogged system with no sun/decoratives", () => {
    expect(() => disposeSolarSystem(createSolarSystem(planet({ state: "unknown" }), { x: 0, y: 0, z: 0 }))).not.toThrow();
  });
});
