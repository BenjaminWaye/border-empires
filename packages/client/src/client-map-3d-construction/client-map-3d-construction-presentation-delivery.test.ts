import { describe, expect, it } from "vitest";
import { BoxGeometry, InstancedMesh, Scene } from "three";
import { CONSTRUCTION_PHASES, type ConstructionSite } from "../client-construction-phase/client-construction-phase.js";
import { stackCenterFor, DEFAULT_CONSTRUCTION_LAYOUT } from "./client-map-3d-construction-layout.js";
import { planPodFlight, podTransitBudgetMs } from "./client-map-3d-construction-pod-flight.js";
import { createConstructionPresentation } from "./client-map-3d-construction-presentation.js";

// The parts stack and its delivery drone, wired through the real presentation (the crate layer
// asks the pod layer, on the render clock, whether a site's pod has landed yet).
const site = (phase: number, durationMs: number, afcOffset: { dx: number; dy: number }): ConstructionSite => {
  const startedAtMs = Date.now() - (phase / CONSTRUCTION_PHASES) * durationMs - 1_000;
  return {
    x: 1,
    y: 2,
    afcOffset,
    direction: "build",
    field: "economicStructure",
    structureType: "ORE_REFINERY",
    ownerId: "me",
    fraction: phase / CONSTRUCTION_PHASES,
    visibleBands: phase + 1,
    phase,
    startedAtMs,
    completesAtMs: startedAtMs + durationMs,
    crew: 4,
    stalled: false,
    nextPhaseAtMs: undefined
  };
};

const crates = (scene: Scene): number =>
  scene.children.find((c): c is InstancedMesh => c instanceof InstancedMesh && c.geometry.type === "BoxGeometry" && (c.geometry as BoxGeometry).parameters.width === 0.075)!.count;

// One rebuild per phase: the second one sees a phase change and sends the drone.
const deliver = (durationMs: number, afcOffset: { dx: number; dy: number }) => {
  const scene = new Scene();
  const presentation = createConstructionPresentation(scene);
  presentation.addSite(0, 0, 0, site(0, durationMs, afcOffset), 0.5);
  presentation.commit();
  presentation.clear();
  const spawnedAt = performance.now();
  presentation.addSite(0, 0, 0, site(1, durationMs, afcOffset), 0.5);
  presentation.commit();
  return { scene, presentation, spawnedAt };
};

describe("construction presentation: parts delivered by drone", () => {
  it("keeps the new phase's stack empty until the drone has set the pod down", () => {
    const afcOffset = { dx: -6, dy: -3 };
    const { scene, presentation, spawnedAt } = deliver(8 * 3_600_000, afcOffset);
    const stack = stackCenterFor(DEFAULT_CONSTRUCTION_LAYOUT);
    const plan = planPodFlight(afcOffset.dx - stack.x, afcOffset.dy - stack.z);
    presentation.update(spawnedAt + plan.lowerAtMs);
    expect(crates(scene)).toBe(0); // still on the drone's line
    presentation.update(spawnedAt + plan.touchdownAtMs + 100);
    expect(crates(scene)).toBeGreaterThan(0);
    presentation.dispose();
  });

  // Regression: builds take minutes, and an uncapped trip from a distant AFC (here 300 tiles,
  // about 43 s) left a 20 s phase's stack empty for the whole phase.
  it("lands within a quarter of a short phase however far away the AFC is", () => {
    const durationMs = 80_000; // a 20 s phase
    const { scene, presentation, spawnedAt } = deliver(durationMs, { dx: -300, dy: 0 });
    const phaseMs = durationMs / CONSTRUCTION_PHASES;
    presentation.update(spawnedAt + 500);
    expect(crates(scene)).toBe(0);
    presentation.update(spawnedAt + phaseMs / 4 + 100);
    expect(crates(scene)).toBeGreaterThan(0);
    expect(podTransitBudgetMs(phaseMs)).toBeLessThan(planPodFlight(-300, 0).lowerAtMs);
    presentation.dispose();
  });
});
