import { afterEach, describe, expect, it, vi } from "vitest";
import { BoxGeometry, InstancedMesh, Matrix4, Scene } from "three";
import { CONSTRUCTION_PHASES, type ConstructionSite } from "../client-construction-phase/client-construction-phase.js";
import { createFortOverlay } from "../client-map-3d-fort-overlay.js";
import { addFortificationInstancesForTile } from "../client-map-3d-fortification-instances.js";
import type { Tile } from "../client-types.js";

// docs/construction-animation-plan.md, follow-up 2: a fort being built or removed
// rises in phases; an upgrade keeps the standing tier at full height.
const HOUR = 3_600_000;
const WALL_HEIGHT = 0.42;
const TOWER_HEIGHT = 0.58;

const siteAt = (visibleBands: number, over: Partial<ConstructionSite> = {}): ConstructionSite => ({
  x: 3,
  y: 4,
  afcOffset: undefined,
  direction: "build",
  field: "fort",
  structureType: "FORT",
  ownerId: "me",
  fraction: (visibleBands - 1) / CONSTRUCTION_PHASES,
  visibleBands,
  phase: visibleBands - 1,
  startedAtMs: 0,
  completesAtMs: 8 * HOUR,
  crew: 3,
  stalled: false,
  nextPhaseAtMs: 2 * HOUR,
  ...over
});

const boxMesh = (scene: Scene, w: number, h: number, d: number): InstancedMesh | undefined =>
  scene.children.find((c): c is InstancedMesh => {
    if (!(c instanceof InstancedMesh) || c.geometry.type !== "BoxGeometry") return false;
    const p = (c.geometry as BoxGeometry).parameters;
    return p.width === w && p.height === h && p.depth === d && c.count > 0;
  });
const wallMesh = (scene: Scene) => boxMesh(scene, 0.86, WALL_HEIGHT, 0.08);
const towerMesh = (scene: Scene) => boxMesh(scene, 0.16, TOWER_HEIGHT, 0.16);

const matrixAt = (mesh: InstancedMesh, i = 0): number[] => {
  const m = new Matrix4();
  mesh.getMatrixAt(i, m);
  return [...m.elements];
};
const yScale = (e: number[]): number => Math.hypot(e[4]!, e[5]!, e[6]!);

const build = (kind: "FORT" | "WOODEN_FORT" | "SIEGE_OUTPOST", construction?: { site: ConstructionSite; keepStanding: boolean }) => {
  const scene = new Scene();
  const overlay = createFortOverlay(scene, 4);
  overlay.addInstance(0, 0, 0, kind, "CLOSED", 3, 4, 0, construction);
  overlay.commit();
  return { scene, overlay };
};

afterEach(() => vi.useRealTimers());

describe("fort overlay under construction", () => {
  it("raises walls and towers from their base in proportion to the built bands", () => {
    for (const bands of [1, 2, 3, 4]) {
      const { scene, overlay } = build("FORT", { site: siteAt(bands), keepStanding: false });
      const f = bands / CONSTRUCTION_PHASES;
      const wall = matrixAt(wallMesh(scene)!);
      expect(yScale(wall)).toBeCloseTo(f, 5);
      expect(wall[13]).toBeCloseTo((WALL_HEIGHT / 2) * f, 5); // base stays on the ground
      const tower = matrixAt(towerMesh(scene)!);
      expect(yScale(tower)).toBeCloseTo(f, 5);
      expect(tower[13]).toBeCloseTo((TOWER_HEIGHT / 2) * f, 5);
      overlay.dispose();
    }
  });

  it("draws a finished fort at full height", () => {
    const { scene, overlay } = build("FORT");
    expect(yScale(matrixAt(wallMesh(scene)!))).toBeCloseTo(1, 5);
    overlay.dispose();
  });

  it("keeps an upgrading fort standing at full height while still adding the ambient work", () => {
    const plain = build("FORT");
    const plainMeshes = plain.scene.children.filter((c) => c instanceof InstancedMesh && c.count > 0).length;
    plain.overlay.dispose();

    const { scene, overlay } = build("FORT", { site: siteAt(1), keepStanding: true });
    overlay.tick(0);
    expect(yScale(matrixAt(wallMesh(scene)!))).toBeCloseTo(1, 5);
    expect(yScale(matrixAt(towerMesh(scene)!))).toBeCloseTo(1, 5);
    // Scaffold (and, once ticked, crates and crew) now exist around it.
    const meshes = scene.children.filter((c) => c instanceof InstancedMesh && c.count > 0).length;
    expect(meshes).toBeGreaterThan(plainMeshes);
    overlay.dispose();
  });

  it("plays removal in reverse: fewer bands standing as the removal progresses", () => {
    const early = build("FORT", { site: siteAt(4, { direction: "remove" }), keepStanding: false });
    const late = build("FORT", { site: siteAt(1, { direction: "remove" }), keepStanding: false });
    expect(yScale(matrixAt(early.scene.children.find((c) => c === wallMesh(early.scene))! as InstancedMesh))).toBeCloseTo(1, 5);
    expect(yScale(matrixAt(wallMesh(late.scene)!))).toBeCloseTo(0.25, 5);
    early.overlay.dispose();
    late.overlay.dispose();
  });

  it("does not turn a siege outpost into a construction site (follow-up 3)", () => {
    const withSite = build("SIEGE_OUTPOST", { site: siteAt(1, { field: "siegeOutpost" }), keepStanding: false });
    const without = build("SIEGE_OUTPOST");
    const count = (s: Scene): number => s.children.filter((c) => c instanceof InstancedMesh).reduce((n, c) => n + (c as InstancedMesh).count, 0);
    expect(count(withSite.scene)).toBe(count(without.scene));
    withSite.overlay.dispose();
    without.overlay.dispose();
  });

  it("does not leave a built fort short after a site (no state leaks between instances)", () => {
    const scene = new Scene();
    const overlay = createFortOverlay(scene, 4);
    overlay.addInstance(0, 0, 0, "FORT", "CLOSED", 1, 1, 0, { site: siteAt(1), keepStanding: false });
    overlay.addInstance(2, 0, 0, "FORT", "CLOSED", 2, 2);
    overlay.commit();
    const wall = wallMesh(scene)!;
    expect(yScale(matrixAt(wall, 0))).toBeCloseTo(0.25, 5);
    expect(yScale(matrixAt(wall, 1))).toBeCloseTo(1, 5);
    overlay.dispose();
  });

  it("reports a phase boundary once the earliest site's boundary has passed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(HOUR);
    const { overlay } = build("FORT", { site: siteAt(1, { nextPhaseAtMs: 2 * HOUR }), keepStanding: false });
    expect(overlay.constructionBoundaryPassed()).toBe(false);
    vi.setSystemTime(2 * HOUR + 1);
    expect(overlay.constructionBoundaryPassed()).toBe(true);
    overlay.clear();
    expect(overlay.constructionBoundaryPassed()).toBe(false);
    overlay.dispose();
  });

  it("animating crew and pods for building, removal and stalled forts never throws", () => {
    const scene = new Scene();
    const overlay = createFortOverlay(scene, 4);
    overlay.addInstance(0, 0, 0, "FORT", "CLOSED", 1, 1, 0, { site: siteAt(2), keepStanding: false });
    overlay.addInstance(2, 0, 0, "WOODEN_FORT", "NORTH", 2, 2, 0, { site: siteAt(3, { direction: "remove" }), keepStanding: false });
    overlay.addInstance(4, 0, 0, "FORT", "EAST", 3, 3, 0, { site: siteAt(4, { stalled: true, nextPhaseAtMs: undefined }), keepStanding: true });
    overlay.commit();
    expect(() => {
      for (let t = 0; t < 15_000; t += 250) overlay.tick(t);
    }).not.toThrow();
    overlay.dispose();
  });
});

describe("addFortificationInstancesForTile fort construction", () => {
  const deps = {
    state: { tiles: new Map<string, Tile>(), tilesRevision: 0, siegeAimOverrides: new Map() },
    keyFor: (x: number, y: number) => `${x},${y}`,
    wrapX: (x: number) => x,
    wrapY: (y: number) => y
  };
  const route = (tile: Tile) => {
    const fortArgs: unknown[][] = [];
    addFortificationInstancesForTile(
      tile,
      { x: 0, z: 0, surfaceY: 0, wx: 1, wy: 1 },
      {
        fortOverlay: { addInstance: (...args: unknown[]) => void fortArgs.push(args) },
        relayBeaconOverlay: { addInstance: () => undefined },
        siegeTowerOverlay: { addInstance: () => undefined },
        contactShadowOverlay: { addShadow: () => undefined }
      } as never,
      deps,
      0
    );
    return fortArgs[0]?.[8] as { site: ConstructionSite; keepStanding: boolean } | undefined;
  };
  const fortTile = (fort: Record<string, unknown>): Tile => ({ x: 1, y: 1, terrain: "LAND", fort: { ownerId: "me", variant: "FORT", ...fort } }) as unknown as Tile;

  it("passes the site for a fresh build and marks an upgrade as keepStanding", () => {
    const now = Date.now();
    const fresh = route(fortTile({ status: "under_construction", startedAt: now - HOUR, completesAt: now + 7 * HOUR }));
    expect(fresh).toMatchObject({ keepStanding: false, site: { field: "fort", direction: "build" } });
    const upgrade = route(fortTile({ status: "under_construction", upgradingFrom: "WOODEN_FORT", startedAt: now - HOUR, completesAt: now + 7 * HOUR }));
    expect(upgrade).toMatchObject({ keepStanding: true });
    const removing = route(fortTile({ status: "removing", startedAt: now - HOUR, completesAt: now + 7 * HOUR }));
    expect(removing).toMatchObject({ keepStanding: false, site: { direction: "remove" } });
  });

  it("passes nothing for an active fort", () => {
    expect(route(fortTile({ status: "active" }))).toBeUndefined();
  });

  it("attaches the owner's AFC offset so phase pods have somewhere to fly from", () => {
    const now = Date.now();
    const afcTile = { x: 6, y: 9, terrain: "LAND", ownerId: "me", afc: { ownerId: "me", status: "active", activatedAt: 1 } } as unknown as Tile;
    const withAfc = { ...deps, state: { ...deps.state, tiles: new Map([["6,9", afcTile]]) } };
    const fortArgs: unknown[][] = [];
    addFortificationInstancesForTile(
      { x: 1, y: 1, terrain: "LAND", fort: { ownerId: "me", variant: "FORT", status: "under_construction", startedAt: now - HOUR, completesAt: now + 7 * HOUR } } as unknown as Tile,
      { x: 0, z: 0, surfaceY: 0, wx: 1, wy: 1 },
      {
        fortOverlay: { addInstance: (...args: unknown[]) => void fortArgs.push(args) },
        relayBeaconOverlay: { addInstance: () => undefined },
        siegeTowerOverlay: { addInstance: () => undefined },
        contactShadowOverlay: { addShadow: () => undefined }
      } as never,
      withAfc,
      101
    );
    const construction = fortArgs[0]?.[8] as { site: ConstructionSite };
    expect(construction.site.afcOffset).toEqual({ dx: 5, dy: 8 });
  });

  it("attaches it for a Relay Beacon too, and leaves it undefined when the owner has no known AFC", () => {
    const now = Date.now();
    const beaconTile = { x: 1, y: 1, terrain: "LAND", economicStructure: { ownerId: "me", type: "RELAY_BEACON", status: "under_construction", startedAt: now - HOUR, completesAt: now + 7 * HOUR } } as unknown as Tile;
    const run = (tiles: Map<string, Tile>, key: number) => {
      const beaconArgs: unknown[][] = [];
      addFortificationInstancesForTile(
        beaconTile,
        { x: 0, z: 0, surfaceY: 0, wx: 1, wy: 1 },
        {
          fortOverlay: { addInstance: () => undefined },
          relayBeaconOverlay: { addInstance: (...args: unknown[]) => void beaconArgs.push(args) },
          siegeTowerOverlay: { addInstance: () => undefined },
          contactShadowOverlay: { addShadow: () => undefined }
        } as never,
        { ...deps, state: { ...deps.state, tiles } },
        key
      );
      return (beaconArgs[0]?.[6] as ConstructionSite | undefined)?.afcOffset;
    };
    const afcTile = { x: 4, y: 1, terrain: "LAND", ownerId: "me", afc: { ownerId: "me", status: "active", activatedAt: 1 } } as unknown as Tile;
    expect(run(new Map([["4,1", afcTile]]), 201)).toEqual({ dx: 3, dy: 0 });
    expect(run(new Map(), 202)).toBeUndefined();
  });
});
