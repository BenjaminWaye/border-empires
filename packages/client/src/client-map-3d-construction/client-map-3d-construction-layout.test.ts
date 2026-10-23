import { describe, expect, it } from "vitest";
import { BoxGeometry, InstancedMesh, Matrix4, Scene } from "three";
import type { ConstructionSite } from "../client-construction-phase/client-construction-phase.js";
import { createConstructionCrewLayer } from "./client-map-3d-construction-crew.js";
import { DEFAULT_CONSTRUCTION_LAYOUT, stackCenterFor } from "./client-map-3d-construction-layout.js";
import { createConstructionPresentation, createLazyConstructionPresentation } from "./client-map-3d-construction-presentation.js";
import { planPodFlight } from "./client-map-3d-construction-pod-flight.js";
import { firstPodXZ, podsDrawn } from "./client-map-3d-construction-pod.test-helpers.js";

const HOUR = 3_600_000;
const site = (phase: number): ConstructionSite => ({
  x: 1,
  y: 2,
  afcOffset: undefined,
  direction: "build",
  field: "fort",
  structureType: "FORT",
  ownerId: "me",
  fraction: phase / 4,
  visibleBands: phase + 1,
  phase,
  startedAtMs: Date.now() - HOUR,
  completesAtMs: Date.now() + 7 * HOUR,
  crew: 2,
  stalled: false,
  nextPhaseAtMs: undefined
});

const crateMesh = (scene: Scene): InstancedMesh =>
  scene.children.find((c): c is InstancedMesh => c instanceof InstancedMesh && c.geometry.type === "BoxGeometry" && (c.geometry as BoxGeometry).parameters.width === 0.075)!;

const firstCrateXZ = (mesh: InstancedMesh): { x: number; z: number } => {
  const m = new Matrix4();
  mesh.getMatrixAt(0, m);
  return { x: m.elements[12]!, z: m.elements[14]! };
};

describe("construction layout", () => {
  it("puts the parts stack at the default corner unless a layout says otherwise", () => {
    const scene = new Scene();
    const crew = createConstructionCrewLayer(scene);
    crew.add(10, 20, 0, site(0));
    crew.update(0);
    const { x, z } = firstCrateXZ(crateMesh(scene));
    expect(x).toBeCloseTo(10 + DEFAULT_CONSTRUCTION_LAYOUT.stackX, 5);
    expect(z).toBeCloseTo(20 + DEFAULT_CONSTRUCTION_LAYOUT.stackZ, 5);
    crew.dispose();
  });

  it("honours a custom layout (forts keep the stack clear of the corner towers)", () => {
    const scene = new Scene();
    const crew = createConstructionCrewLayer(scene);
    crew.add(10, 20, 0, site(0), { stackX: -0.15, stackZ: -0.36, crewSpan: 0.5 });
    crew.update(0);
    const { x, z } = firstCrateXZ(crateMesh(scene));
    expect(x).toBeCloseTo(10 - 0.15, 5);
    expect(z).toBeCloseTo(20 - 0.36, 5);
    crew.dispose();
  });

  it("lands delivery pods on the layout's stack, flown from the AFC", () => {
    const scene = new Scene();
    const presentation = createConstructionPresentation(scene);
    const layout = { stackX: -0.15, stackZ: -0.36, crewSpan: 0.5 };
    const afcOffset = { dx: -5, dy: -2 };
    presentation.addSite(5, 6, 0, { ...site(0), afcOffset }, 0.5, layout);
    presentation.clear(); // next rebuild: the site is now known
    presentation.addSite(5, 6, 0, { ...site(1), afcOffset }, 0.5, layout); // phase advanced -> pod
    const stack = stackCenterFor(layout);
    // Partway down on the drone's line, straight above the stack.
    const plan = planPodFlight(afcOffset.dx - stack.x, afcOffset.dy - stack.z);
    presentation.update(performance.now() + (plan.lowerAtMs + plan.touchdownAtMs) / 2);
    const pod = firstPodXZ(scene);
    expect(pod).toBeDefined();
    expect(pod!.x).toBeCloseTo(5 + stack.x, 2);
    expect(pod!.z).toBeCloseTo(6 + stack.z, 2);
    presentation.dispose();
  });
});

describe("lazy construction presentation", () => {
  it("allocates nothing until the first site, and every method is safe before then", () => {
    const scene = new Scene();
    const presentation = createLazyConstructionPresentation(scene);
    expect(() => {
      presentation.clear();
      presentation.commit();
      presentation.update(0);
    }).not.toThrow();
    expect(presentation.boundaryPassed()).toBe(false);
    expect(scene.children).toHaveLength(0);

    presentation.addSite(0, 0, 0, site(0), 0.5);
    expect(scene.children.length).toBeGreaterThan(0);
    presentation.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it("does not fire a pod for the very first site it sees", () => {
    const scene = new Scene();
    const presentation = createLazyConstructionPresentation(scene);
    presentation.addSite(0, 0, 0, { ...site(3), afcOffset: { dx: -4, dy: 0 } }, 0.5);
    presentation.update(performance.now() + 1_200);
    expect(podsDrawn(scene)).toBe(0);
    presentation.dispose();
  });
});
