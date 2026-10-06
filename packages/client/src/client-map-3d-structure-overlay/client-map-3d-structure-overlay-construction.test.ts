import { afterEach, describe, expect, it, vi } from "vitest";
import { InstancedMesh, Matrix4, Scene } from "three";
import { geometryHalfExtents, verticalHalfExtent } from "../client-map-3d-construction/client-map-3d-vertical-extent.js";
import { CONSTRUCTION_PHASES, type ConstructionSite } from "../client-construction-phase/client-construction-phase.js";
import { createContactShadowOverlay } from "../client-map-3d-contact-shadow/client-map-3d-contact-shadow.js";
import { createStructureOverlay } from "./client-map-3d-structure-overlay.js";

// docs/construction-animation-plan.md: structures under construction are laid
// out band by band, with scaffolding and an ancillary crew around them.
const HOUR = 3_600_000;

const siteAt = (visibleBands: number, over: Partial<ConstructionSite> = {}): ConstructionSite => ({
  x: 4,
  y: 7,
  direction: "build",
  field: "economicStructure",
  structureType: "MINTWORKS",
  ownerId: "me",
  fraction: (visibleBands - 1) / CONSTRUCTION_PHASES,
  visibleBands,
  phase: visibleBands - 1,
  startedAtMs: 0,
  completesAtMs: 8 * HOUR,
  crew: 4,
  stalled: false,
  nextPhaseAtMs: 2 * HOUR,
  ...over
});

const piecesIn = (scene: Scene): number =>
  scene.children.filter((c): c is InstancedMesh => c instanceof InstancedMesh).reduce((n, m) => n + m.count, 0);

const build = (site?: ConstructionSite) => {
  const scene = new Scene();
  const overlay = createStructureOverlay(scene, 4, createContactShadowOverlay(scene, 4));
  overlay.addInstance(0, 0, 0, "MINTWORKS", undefined, site);
  overlay.commit();
  return { scene, overlay };
};

afterEach(() => vi.useRealTimers());

describe("structure overlay under construction", () => {
  it("lays out fewer structure pieces in an early phase than the finished structure has", () => {
    const finished = build();
    const finishedPieces = piecesIn(finished.scene);
    finished.overlay.dispose();

    const early = build(siteAt(1));
    // Scaffolding adds posts/bars, so compare against the finished count plus
    // the scaffold: an early phase must still be clearly below it.
    const earlyPieces = piecesIn(early.scene);
    early.overlay.dispose();
    expect(earlyPieces).toBeLessThan(finishedPieces);
  });

  it("shows every piece again in the last phase (plus scaffolding)", () => {
    const finished = build();
    const finishedPieces = piecesIn(finished.scene);
    finished.overlay.dispose();

    const lastPhase = build(siteAt(CONSTRUCTION_PHASES));
    const lastPieces = piecesIn(lastPhase.scene);
    lastPhase.overlay.dispose();
    expect(lastPieces).toBeGreaterThan(finishedPieces);
  });

  it("adds more structure pieces as bands are built", () => {
    const counts = [1, 2, 3, 4].map((bands) => {
      const { scene, overlay } = build(siteAt(bands));
      const n = piecesIn(scene);
      overlay.dispose();
      return n;
    });
    for (let i = 1; i < counts.length; i += 1) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]!);
    expect(counts[3]).toBeGreaterThan(counts[0]!);
  });

  it("does not leave the gate on for the next, finished structure", () => {
    const scene = new Scene();
    const overlay = createStructureOverlay(scene, 4, createContactShadowOverlay(scene, 4));
    overlay.addInstance(0, 0, 0, "MINTWORKS", undefined, siteAt(1));
    overlay.commit();
    const gated = piecesIn(scene);
    overlay.clear();
    overlay.addInstance(0, 0, 0, "MINTWORKS");
    overlay.commit();
    const finished = piecesIn(scene);
    overlay.dispose();
    expect(finished).toBeGreaterThan(gated);
  });

  it("reports a phase boundary only once the earliest site's boundary has passed", () => {
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

  it("never reports a boundary when no site is under construction", () => {
    const { overlay } = build();
    expect(overlay.constructionBoundaryPassed()).toBe(false);
    overlay.dispose();
  });

  it("animating the crew every frame never throws, including stalled and removal sites", () => {
    const { overlay } = build(siteAt(2));
    overlay.addInstance(1, 1, 0, "MINTWORKS", undefined, siteAt(3, { stalled: true, nextPhaseAtMs: undefined }));
    overlay.addInstance(2, 2, 0, "MINTWORKS", undefined, siteAt(2, { direction: "remove" }));
    expect(() => {
      for (let t = 0; t < 20_000; t += 250) overlay.update(t);
    }).not.toThrow();
    overlay.dispose();
  });

  describe("delivery pods", () => {
    const pods = (scene: Scene): number => scene.children.filter((c) => c.type === "Group").length;
    const rebuild = (overlay: ReturnType<typeof createStructureOverlay>, site?: ConstructionSite): void => {
      overlay.clear();
      overlay.addInstance(0, 0, 0, "MINTWORKS", undefined, site);
      overlay.commit();
    };
    const setup = () => {
      const scene = new Scene();
      return { scene, overlay: createStructureOverlay(scene, 4, createContactShadowOverlay(scene, 4)) };
    };

    it("does not fire for a site seen for the first time, however far along it is", () => {
      const { scene, overlay } = setup();
      rebuild(overlay, siteAt(3));
      expect(pods(scene)).toBe(0);
      overlay.dispose();
    });

    it("fires one pod when an already-seen site enters a new phase, but not within the same phase", () => {
      const { scene, overlay } = setup();
      rebuild(overlay, siteAt(1));
      rebuild(overlay, siteAt(1));
      expect(pods(scene)).toBe(0);
      rebuild(overlay, siteAt(2));
      expect(pods(scene)).toBe(1);
      rebuild(overlay, siteAt(2));
      expect(pods(scene)).toBe(1);
      overlay.dispose();
    });

    it("stays quiet for removal and for stalled sites", () => {
      const { scene, overlay } = setup();
      rebuild(overlay, siteAt(1, { direction: "remove" }));
      rebuild(overlay, siteAt(2, { direction: "remove" }));
      expect(pods(scene)).toBe(0);
      rebuild(overlay, siteAt(1));
      rebuild(overlay, siteAt(2, { stalled: true }));
      expect(pods(scene)).toBe(0);
      overlay.dispose();
    });

    it("does not fire when a site scrolls out of view for a rebuild and returns in a later phase", () => {
      const { scene, overlay } = setup();
      rebuild(overlay, siteAt(1));
      rebuild(overlay); // site not laid out this rebuild
      rebuild(overlay, siteAt(3));
      expect(pods(scene)).toBe(0);
      overlay.dispose();
    });

    it("keeps an in-flight pod alive across the rebuild that follows it", () => {
      const { scene, overlay } = setup();
      rebuild(overlay, siteAt(1));
      rebuild(overlay, siteAt(2));
      rebuild(overlay, siteAt(2));
      expect(pods(scene)).toBe(1);
      overlay.dispose();
    });
  });

  describe("tall structures grow instead of appearing whole", () => {
    // Highest point of the structure's own pieces (the construction scaffold, crates and
    // crew are meshes created after the overlay, so they are excluded).
    const topAt = (kind: "AETHER_TOWER" | "FARMSTEAD" | "WORLD_ENGINE", bands: number | undefined): number => {
      const scene = new Scene();
      const overlay = createStructureOverlay(scene, 2, createContactShadowOverlay(scene, 2));
      const own = new Set(scene.children.filter((c): c is InstancedMesh => c instanceof InstancedMesh));
      overlay.addInstance(0, 0, 0, kind, undefined, bands === undefined ? undefined : siteAt(bands));
      overlay.commit();
      let top = 0;
      const m = new Matrix4();
      for (const mesh of own) {
        const ext = geometryHalfExtents(mesh.geometry);
        for (let i = 0; i < mesh.count; i += 1) {
          mesh.getMatrixAt(i, m);
          top = Math.max(top, m.elements[13]! + verticalHalfExtent(m.elements, ext));
        }
      }
      overlay.dispose();
      return top;
    };

    it.each(["AETHER_TOWER", "FARMSTEAD", "WORLD_ENGINE"] as const)("%s climbs roughly a quarter of its height per phase", (kind) => {
      const full = topAt(kind, undefined);
      const ratios = [1, 2, 3, 4].map((bands) => topAt(kind, bands) / full);
      // Not stuck at full height from the first phase (the old whole-piece behaviour)...
      expect(ratios[0]!).toBeLessThan(0.45);
      // ...rising every phase, and finishing at full height.
      for (let i = 1; i < ratios.length; i += 1) expect(ratios[i]!).toBeGreaterThan(ratios[i - 1]! + 0.05);
      expect(ratios[3]!).toBeCloseTo(1, 5);
    });
  });
});
