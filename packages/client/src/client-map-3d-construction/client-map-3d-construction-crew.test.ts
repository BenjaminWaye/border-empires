import { describe, expect, it } from "vitest";
import { BoxGeometry, InstancedMesh, Matrix4, Scene } from "three";
import type { ConstructionSite } from "../client-construction-phase/client-construction-phase.js";
import { PERSON_D, PERSON_H, PERSON_W } from "../client-map-3d-ancillary-figures/client-map-3d-ancillary-figures.js";
import { createConstructionCrewLayer } from "./client-map-3d-construction-crew.js";

const HOUR = 3_600_000;
const site = (over: Partial<ConstructionSite> = {}): ConstructionSite => ({
  x: 3,
  y: 4,
  direction: "build",
  field: "economicStructure",
  structureType: "FOUNDRY",
  ownerId: "me",
  fraction: 0.2,
  visibleBands: 1,
  phase: 0,
  startedAtMs: Date.now() - HOUR,
  completesAtMs: Date.now() + 7 * HOUR,
  crew: 8,
  stalled: false,
  nextPhaseAtMs: undefined,
  ...over
});

// The settle overlay's people (client-map-3d-ancillary-figures.ts): the crew must be the same figures.
const figureMesh = (scene: Scene): InstancedMesh =>
  scene.children.find((c): c is InstancedMesh => {
    if (!(c instanceof InstancedMesh) || c.geometry.type !== "BoxGeometry") return false;
    const p = (c.geometry as BoxGeometry).parameters;
    return p.width === PERSON_W && p.height === PERSON_H && p.depth === PERSON_D;
  })!;

const positions = (mesh: InstancedMesh): string => {
  const m = new Matrix4();
  const out: number[][] = [];
  for (let i = 0; i < mesh.count; i += 1) {
    mesh.getMatrixAt(i, m);
    out.push([Number(m.elements[12]!.toFixed(4)), Number(m.elements[14]!.toFixed(4))]);
  }
  return JSON.stringify(out);
};

describe("construction crew", () => {
  it("uses the settle overlay's figures at the settle overlay's size", () => {
    const scene = new Scene();
    const crew = createConstructionCrewLayer(scene);
    crew.add(0, 0, 0, site({ crew: 5 }));
    crew.update(0);
    const mesh = figureMesh(scene);
    expect(mesh).toBeDefined();
    expect(mesh.count).toBe(5);
    const m = new Matrix4();
    mesh.getMatrixAt(0, m);
    // Unscaled: the same pinprick body a settler has, not a bigger stand-in.
    expect(Math.hypot(m.elements[0]!, m.elements[1]!, m.elements[2]!)).toBeCloseTo(1, 5);
    expect(Math.hypot(m.elements[4]!, m.elements[5]!, m.elements[6]!)).toBeCloseTo(1, 5);
    crew.dispose();
  });

  it("wanders like settlers: figures move over time and stay inside the tile", () => {
    const scene = new Scene();
    const crew = createConstructionCrewLayer(scene);
    crew.add(10, 20, 0, site());
    const seen = new Set<string>();
    for (const t of [0, 700, 1_400, 2_100, 2_800]) {
      crew.update(t);
      seen.add(positions(figureMesh(scene)));
      const m = new Matrix4();
      const mesh = figureMesh(scene);
      for (let i = 0; i < mesh.count; i += 1) {
        mesh.getMatrixAt(i, m);
        expect(Math.abs(m.elements[12]! - 10)).toBeLessThanOrEqual(0.43);
        expect(Math.abs(m.elements[14]! - 20)).toBeLessThanOrEqual(0.43);
      }
    }
    expect(seen.size).toBeGreaterThan(1);
    crew.dispose();
  });

  it("spreads the figures out (they do not stack on one spot)", () => {
    const scene = new Scene();
    const crew = createConstructionCrewLayer(scene);
    crew.add(0, 0, 0, site({ x: 3, y: 4 })); // small tile coordinates: the case the old 2D hash collapsed
    crew.update(1_000);
    const spots = new Set(JSON.parse(positions(figureMesh(scene))).map((p: number[]) => `${Math.round(p[0]! * 20)},${Math.round(p[1]! * 20)}`));
    expect(spots.size).toBeGreaterThan(3);
    crew.dispose();
  });

  it("freezes a stalled build's crew", () => {
    const scene = new Scene();
    const crew = createConstructionCrewLayer(scene);
    crew.add(0, 0, 0, site({ stalled: true }));
    crew.update(0);
    const first = positions(figureMesh(scene));
    crew.update(1_700);
    crew.update(9_000);
    expect(positions(figureMesh(scene))).toBe(first);
    crew.dispose();
  });

  it("no longer carries parts: only crew figures and crates are drawn", () => {
    const scene = new Scene();
    const crew = createConstructionCrewLayer(scene);
    expect(scene.children.filter((c) => c instanceof InstancedMesh)).toHaveLength(2); // figures, crates
    crew.dispose();
  });
});
