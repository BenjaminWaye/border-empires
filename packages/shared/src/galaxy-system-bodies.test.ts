import { describe, expect, it } from "vitest";
import { GALAXY_BODY_KINDS, galaxySystemBodies, galaxySystemBodyCount } from "./galaxy-system-bodies.js";

describe("galaxySystemBodies", () => {
  it("is deterministic per system", () => {
    expect(galaxySystemBodies("season-7")).toEqual(galaxySystemBodies("season-7"));
  });
  it("gives every system 2 to 4 bodies, all of a known kind", () => {
    for (let i = 0; i < 500; i += 1) {
      const bodies = galaxySystemBodies(`season-${i}`);
      expect(bodies.length).toBe(galaxySystemBodyCount(`season-${i}`));
      expect(bodies.length).toBeGreaterThanOrEqual(2);
      expect(bodies.length).toBeLessThanOrEqual(4);
      for (const body of bodies) expect(GALAXY_BODY_KINDS).toContain(body);
    }
  });
  it("systems differ from each other, so which system you develop is a real choice", () => {
    const signatures = new Set(Array.from({ length: 60 }, (_, i) => galaxySystemBodies(`season-${i}`).join(",")));
    expect(signatures.size).toBeGreaterThan(10);
  });
  it("every kind appears across the galaxy", () => {
    const seen = new Set(Array.from({ length: 60 }, (_, i) => galaxySystemBodies(`season-${i}`)).flat());
    expect(seen.size).toBe(GALAXY_BODY_KINDS.length);
  });
});
