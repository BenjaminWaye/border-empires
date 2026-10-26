import { afterEach, describe, expect, it, vi } from "vitest";
import { InstancedMesh, Matrix4, Scene } from "three";
import { CONSTRUCTION_PHASES, type ConstructionSite } from "../client-construction-phase/client-construction-phase.js";
import { createRelayBeaconOverlay } from "../client-map-3d-relay-beacon-overlay.js";

// docs/construction-animation-plan.md, follow-up 1: a Relay Beacon under
// construction is laid out band by band; tall pieces grow, the heliograph array
// (animated by slot index) keeps its slots aligned, and instant beacons are untouched.
const HOUR = 3_600_000;

const siteAt = (visibleBands: number, over: Partial<ConstructionSite> = {}): ConstructionSite => ({
  x: 4,
  y: 7,
  afcOffset: undefined,
  direction: "build",
  field: "economicStructure",
  structureType: "RELAY_BEACON",
  ownerId: "me",
  fraction: (visibleBands - 1) / CONSTRUCTION_PHASES,
  visibleBands,
  phase: visibleBands - 1,
  startedAtMs: 0,
  completesAtMs: 8 * HOUR,
  crew: 2,
  stalled: false,
  nextPhaseAtMs: 2 * HOUR,
  ...over
});

const meshes = (scene: Scene): InstancedMesh[] => scene.children.filter((c): c is InstancedMesh => c instanceof InstancedMesh);
const total = (scene: Scene): number => meshes(scene).reduce((n, m) => n + m.count, 0);

const mirrors = (scene: Scene) => meshes(scene).find(mesh => mesh.name === "relay-mirror");

const matrixAt = (mesh: InstancedMesh, i: number): Matrix4 => {
  const m = new Matrix4();
  mesh.getMatrixAt(i, m);
  return m;
};
const build = (...sites: Array<ConstructionSite | undefined>) => {
  const scene = new Scene();
  const overlay = createRelayBeaconOverlay(scene, 8);
  sites.forEach((site, i) => overlay.addInstance(i * 2, 0, 0, i, 0, false, site));
  overlay.commit();
  return { scene, overlay };
};

afterEach(() => vi.useRealTimers());

describe("relay beacon under construction", () => {
  it("shows fewer pieces early and more as bands are built", () => {
    const counts = [1, 2, 3, 4].map((bands) => {
      const { scene, overlay } = build(siteAt(bands));
      const n = total(scene);
      overlay.dispose();
      return n;
    });
    for (let i = 1; i < counts.length; i += 1) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]!);
    expect(counts[0]).toBeLessThan(counts[3]!);
  });

  it("clips the communications mast below its finished height in the first phase", () => {
    const { scene, overlay } = build(siteAt(1));
    const mast = meshes(scene).find(mesh => mesh.name.includes("RELAY_HOUSING") && mesh.name.endsWith("-body"))!;
    const cut = mast.geometry.getAttribute("districtState").getY(0);
    mast.geometry.computeBoundingBox();
    expect(cut).toBeGreaterThan(0);
    expect(cut).toBeLessThan(mast.geometry.boundingBox!.max.y * 0.6);
    overlay.dispose();
  });

  it("keeps the animated mirror array's slots aligned across beacons while one is still being built", () => {
    // Beacon 0 is early (array not built), beacons 1 and 2 are finished.
    const { scene, overlay } = build(siteAt(1), undefined, undefined);
    overlay.update(1_000);
    const mirror = mirrors(scene)!;
    expect(mirror.count).toBe(3 * 6); // every beacon holds all 6 slots, built or not

    const scaleOf = (i: number): number => {
      const e = matrixAt(mirror, i).elements;
      return Math.hypot(e[0]!, e[1]!, e[2]!);
    };
    for (let slot = 0; slot < 6; slot += 1) expect(scaleOf(slot)).toBe(0); // placeholder, never animated
    for (let slot = 6; slot < 18; slot += 1) expect(scaleOf(slot)).toBeGreaterThan(0.5); // finished beacons animate
    overlay.dispose();
  });

  it("does not animate placeholder slots on later frames", () => {
    const { scene, overlay } = build(siteAt(2));
    overlay.update(500);
    overlay.update(2_500);
    const e = matrixAt(mirrors(scene)!, 0).elements;
    expect(Math.hypot(e[0]!, e[1]!, e[2]!)).toBe(0);
    overlay.dispose();
  });

  it("builds the array in the last phase", () => {
    const { scene, overlay } = build(siteAt(CONSTRUCTION_PHASES));
    overlay.update(500);
    const e = matrixAt(mirrors(scene)!, 0).elements;
    expect(Math.hypot(e[0]!, e[1]!, e[2]!)).toBeGreaterThan(0.5);
    overlay.dispose();
  });

  it.each(["build", "remove"] as const)("freezes the visible array during %s and starts it after completion", (direction) => {
    const { scene, overlay } = build(siteAt(CONSTRUCTION_PHASES, { direction }), undefined);
    const mirror = mirrors(scene)!;
    const before = Array.from(mirror.instanceMatrix.array.slice(0, 12 * 16));
    overlay.update(500);
    overlay.update(2500);
    expect(Array.from(mirror.instanceMatrix.array.slice(0, 6 * 16))).toEqual(before.slice(0, 6 * 16));
    expect(Array.from(mirror.instanceMatrix.array.slice(6 * 16, 12 * 16))).not.toEqual(before.slice(6 * 16));
    overlay.clear();
    overlay.addInstance(0, 0, 0, 0, 0);
    overlay.commit();
    const completed = matrixAt(mirror, 0).elements;
    overlay.update(5000);
    expect(matrixAt(mirror, 0).elements).not.toEqual(completed);
    overlay.dispose();
  });

  it("does not leave the cut on for the next, finished beacon", () => {
    const scene = new Scene();
    const overlay = createRelayBeaconOverlay(scene, 4);
    overlay.addInstance(0, 0, 0, 0, 0, false, siteAt(1));
    overlay.addInstance(2, 0, 0, 1, 0);
    overlay.commit();
    const mast = meshes(scene).find(mesh => mesh.name.includes("RELAY_HOUSING") && mesh.name.endsWith("-body"))!;
    const finishedCut = mast.geometry.getAttribute("districtState").getY(1);
    overlay.clear();
    overlay.addInstance(0, 0, 0, 0, 0);
    overlay.commit();
    expect(finishedCut).toBe(1000);
    expect(mast.geometry.getAttribute("districtState").getY(0)).toBe(finishedCut);
    overlay.dispose();
  });

  it("reports a phase boundary only after the earliest site's boundary passes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(HOUR);
    const { overlay } = build(siteAt(1, { nextPhaseAtMs: 2 * HOUR }));
    expect(overlay.constructionBoundaryPassed()).toBe(false);
    vi.setSystemTime(2 * HOUR + 1);
    expect(overlay.constructionBoundaryPassed()).toBe(true);
    overlay.clear();
    expect(overlay.constructionBoundaryPassed()).toBe(false);
    overlay.dispose();
  });

  it("adds a scaffold, parts stack and crew only for a site, and animating them never throws", () => {
    const plain = build(undefined);
    const plainTotal = total(plain.scene);
    plain.overlay.dispose();
    const { scene, overlay } = build(siteAt(CONSTRUCTION_PHASES));
    overlay.update(0);
    // Same beacon pieces plus scaffold posts/bars, crates and crew on top.
    expect(total(scene)).toBeGreaterThan(plainTotal);
    expect(() => {
      for (let t = 0; t < 20_000; t += 250) overlay.update(t);
    }).not.toThrow();
    overlay.dispose();
  });

  it("works for removal and stalled sites too", () => {
    const { overlay } = build(siteAt(2, { direction: "remove" }), siteAt(3, { stalled: true, nextPhaseAtMs: undefined }));
    expect(() => {
      for (let t = 0; t < 10_000; t += 500) overlay.update(t);
    }).not.toThrow();
    overlay.dispose();
  });
});
