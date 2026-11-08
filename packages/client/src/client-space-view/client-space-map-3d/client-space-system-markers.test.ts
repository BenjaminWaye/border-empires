import { describe, expect, it } from "vitest";
import { MeshBasicMaterial, MeshStandardMaterial } from "three";
import { createSolarSystem } from "./client-space-solar-system.js";
import { animateSystemMarkers, createSystemMarkers, disposeSystemMarkers, planetRadiusOf } from "./client-space-system-markers.js";
import { NO_MARKERS } from "../client-space-view-markers.js";

const system = () => createSolarSystem({ seasonId: "season-markers", tier: "PLANET", label: "Aurelia", state: "owned" }, { x: 0, y: 0, z: 0 });

describe("3D system markers (§31)", () => {
  it("a smoking planet gets rising puffs that fade as they climb, and an ember", () => {
    const entry = system();
    const objects = createSystemMarkers(entry, { ...NO_MARKERS, smoking: true });
    expect(objects.smoke.length).toBeGreaterThan(3);
    expect(objects.ember).toBeDefined();
    expect(entry.planet.group.children).toContain(objects.planetRoot);
    const r = planetRadiusOf(entry);
    animateSystemMarkers(objects, r, 0);
    const puff = objects.smoke[1]!;
    const lowY = puff.position.y;
    animateSystemMarkers(objects, r, 0.5);
    expect(puff.position.y).toBeGreaterThan(lowY);
    expect((puff.material as MeshBasicMaterial).opacity).toBeLessThan(0.55);
  });

  it("nothing is added for a quiet system, and a build ring and Probe only when asked", () => {
    expect(createSystemMarkers(system(), NO_MARKERS).planetRoot.children).toHaveLength(0);
    const busy = createSystemMarkers(system(), { ...NO_MARKERS, building: true, watched: true });
    expect(busy.buildRing).toBeDefined();
    expect(busy.probe).toBeDefined();
  });

  it("marks a based body with a ring, brightens a developed one, and restores it on dispose", () => {
    const entry = system();
    const developed = entry.decoratives[0]!.mesh;
    const objects = createSystemMarkers(entry, { ...NO_MARKERS, bodies: [{ base: true, developed: true, building: false }, { base: true, developed: false, building: true }] });
    expect((developed.material as MeshStandardMaterial).emissiveIntensity).toBe(3);
    expect(objects.bodyRoots).toHaveLength(2);
    expect(objects.bodyPulses).toHaveLength(1);
    disposeSystemMarkers(objects);
    expect((developed.material as MeshStandardMaterial).emissiveIntensity).toBe(1);
    expect(entry.planet.group.children).not.toContain(objects.planetRoot);
    expect(developed.children).toHaveLength(0);
  });
});
