import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Raycaster, Scene, Vector3 } from "three";
import { AFC_BAY_FOUNDATION_RADIUS } from "../client-map-3d-afc-finish.js";
import { afcBayRadius } from "../client-map-3d-afc-deployment.js";
import { createHeightfield, type HeightfieldTerrainKind } from "../client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createHillTerrain } from "../client-map-3d-hills.js";
import { AFC_SOCKET_COUNT, AFC_SOCKET_RING_RADIUS } from "../client-map-3d-fabrication-complex.js";
import { hillBumpsAt, hillShapeHeight, type RoadCutDirections } from "../client-map-3d-hill-shape.js";
import { tileSurfaceHeights } from "../client-map-3d-tile-surface-y/client-map-3d-tile-surface-y.js";
import { afcHillCutMask, buildAfcPadIndex, createAfcPadSurfaceSampler, createHillCutLookup, type AfcPadOffset } from "./client-map-3d-afc-hill-cut.js";

const WORLD = 100;
const wrap = (v: number): number => ((v % WORLD) + WORLD) % WORLD;
const keyFor = (x: number, y: number): string => `${x},${y}`;
const noRoads = (): RoadCutDirections | undefined => undefined;

// An AFC at (ax, ay) with a hill on every footprint neighbour: the scene
// point of each socket, resolved to the neighbour tile it lands in plus its
// tile-local (u, v) -- the same mapping client-map-3d-hills.ts uses.
const AX = 40;
const AY = 40;
const socketSamples = (): Array<{ wx: number; wy: number; u: number; v: number }> => {
  const out: Array<{ wx: number; wy: number; u: number; v: number }> = [];
  for (let k = 0; k < AFC_SOCKET_COUNT; k += 1) {
    const a = (k * Math.PI) / 4;
    const px = AX + 0.5 + Math.cos(a) * AFC_SOCKET_RING_RADIUS;
    const py = AY + 0.5 + Math.sin(a) * AFC_SOCKET_RING_RADIUS;
    const wx = Math.floor(px);
    const wy = Math.floor(py);
    out.push({ wx, wy, u: px - wx - 0.5, v: py - wy - 0.5 });
  }
  return out;
};

const padIndexFor = (afcs: Array<{ x: number; y: number }>, hidden = new Set<string>()): Map<string, AfcPadOffset[]> =>
  buildAfcPadIndex({
    tiles: afcs.map((t) => ({ ...t, afc: {} })),
    keyFor,
    wrapX: wrap,
    wrapY: wrap,
    isAfcHiddenAt: (x, y) => hidden.has(keyFor(x, y))
  });

describe("AFC hill cut", () => {
  it("levels neighbouring hill domes under every AFC socket (regression: sockets/arms buried in hills)", () => {
    const hillCutAt = createHillCutLookup(noRoads, padIndexFor([{ x: AX, y: AY }]), keyFor);
    let uncutTotal = 0;
    for (const s of socketSamples()) {
      const bumps = hillBumpsAt(s.wx, s.wy);
      uncutTotal += hillShapeHeight(s.u, s.v, bumps, s.wx, s.wy);
      expect(hillShapeHeight(s.u, s.v, bumps, s.wx, s.wy, hillCutAt(s.wx, s.wy))).toBe(0);
    }
    // Without the cut the domes really do rise under the sockets.
    expect(uncutTotal).toBeGreaterThan(0.2);
  });

  it("leaves the far corner of a diagonal neighbour as a hill", () => {
    const hillCutAt = createHillCutLookup(noRoads, padIndexFor([{ x: AX, y: AY }]), keyFor);
    const wx = AX + 1;
    const wy = AY + 1;
    const bumps = hillBumpsAt(wx, wy);
    expect(hillShapeHeight(0.32, 0.32, bumps, wx, wy, hillCutAt(wx, wy))).toBe(hillShapeHeight(0.32, 0.32, bumps, wx, wy));
  });

  it("lowers an AFC standing on a hill tile to the levelled ground", () => {
    const heightfield = { elevationAt: (): number => 0.55, cornerYAt: (): number => 0.1 };
    const inputs = { heightfield, wx: AX, wy: AY, wxNext: AX + 1, wyNext: AY + 1, rise: 0.01, isHillsAt: (): boolean => true, wrapX: wrap, wrapY: wrap };
    const uncut = tileSurfaceHeights({ ...inputs, roadDirsAt: noRoads });
    const cut = tileSurfaceHeights({ ...inputs, roadDirsAt: createHillCutLookup(noRoads, padIndexFor([{ x: AX, y: AY }]), keyFor) });
    expect(uncut.flatOverlayY).toBeGreaterThan(0.11);
    expect(cut.flatOverlayY).toBeCloseTo(0.11, 6);
  });

  it("indexes the wrapped 5x5 the fade reaches and skips an AFC the join drop still hides", () => {
    const index = padIndexFor([{ x: 0, y: 0 }]);
    expect(index.size).toBe(25);
    expect(index.get(keyFor(WORLD - 1, WORLD - 1))).toEqual([{ du: 1, dv: 1 }]);
    expect(index.get(keyFor(2, WORLD - 2))).toEqual([{ du: -2, dv: 2 }]);
    expect(index.get(keyFor(0, 0))).toEqual([{ du: 0, dv: 0 }]);
    expect(padIndexFor([{ x: 5, y: 5 }], new Set([keyFor(5, 5)])).size).toBe(0);
  });

  it("keeps road cut directions and only tags footprint tiles", () => {
    const road: RoadCutDirections = { east: true };
    const roadDirsAt = (x: number, y: number): RoadCutDirections | undefined => (x === AX + 1 && y === AY ? road : undefined);
    const hillCutAt = createHillCutLookup(roadDirsAt, padIndexFor([{ x: AX, y: AY }]), keyFor);
    expect(hillCutAt(AX + 1, AY)).toEqual({ east: true, afcPads: [{ du: -1, dv: 0 }] });
    expect(hillCutAt(AX + 1, AY)).toBe(hillCutAt(AX + 1, AY));
    expect(hillCutAt(AX + 3, AY)).toBeUndefined();
    expect(createHillCutLookup(roadDirsAt, new Map(), keyFor)).toBe(roadDirsAt);
  });

  it("cuts both sides of a footprint tile's outer border equally (no step at the seam)", () => {
    const hillCutAt = createHillCutLookup(noRoads, padIndexFor([{ x: AX, y: AY }]), keyFor);
    // Shared border between footprint tile (AX+1, AY) and outside tile (AX+2, AY), at world x = AX+2.
    for (const v of [-0.4, -0.2, 0, 0.2, 0.4]) {
      const inner = { wx: AX + 1, wy: AY, u: 0.5 };
      const outer = { wx: AX + 2, wy: AY, u: -0.5 };
      const innerMask = afcHillCutMask(inner.u, v, hillCutAt(inner.wx, inner.wy)?.afcPads);
      const outerMask = afcHillCutMask(outer.u, v, hillCutAt(outer.wx, outer.wy)?.afcPads);
      expect(outerMask).toBeGreaterThan(0);
      expect(outerMask).toBeCloseTo(innerMask, 10);
    }
  });

  it("fades the cut out smoothly between the full and fade radii", () => {
    const pads = [{ du: 0, dv: 0 }];
    expect(afcHillCutMask(1.64, 0, pads)).toBe(1);
    const mid = afcHillCutMask(1.75, 0, pads);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(afcHillCutMask(1.9, 0, pads)).toBe(0);
  });

  it("clears the outer edge of each bay and covers the highest rendered pad corner across the map seam", () => {
    const pads = [{ du: 0, dv: 0 }];
    const bayEdge = AFC_SOCKET_RING_RADIUS + AFC_BAY_FOUNDATION_RADIUS;
    for (let i = 0; i < AFC_SOCKET_COUNT; i++) {
      const angle = i * Math.PI / 4;
      expect(afcHillCutMask(Math.cos(angle) * bayEdge, Math.sin(angle) * bayEdge, pads)).toBe(1);
    }
    const cornerHeight = (x: number, y: number): number => {
      if (x === WORLD - 1 && y === 2) return 0.42;
      if (x === WORLD - 2 && y === 2) return 0.9;
      return 0.2;
    };
    expect(createAfcPadSurfaceSampler(cornerHeight, wrap, wrap, 0.012)(0, 0)).toBeCloseTo(0.432);
  });

  it("keeps each sliding bay above the actual hill mesh on uneven ground", () => {
    const heightfield = createHeightfield();
    const hills = createHillTerrain(new Scene(), 64, heightfield.material);
    const window = {
      camX: AX, camY: AY, halfW: 2, halfH: 2, worldWidth: WORLD, worldHeight: WORLD,
      tileKindAt: (x: number): HeightfieldTerrainKind => x < AX ? "SAND" : "TUNDRA",
      isHillsAt: () => true
    };
    const hillCutAt = createHillCutLookup(noRoads, padIndexFor([{ x: AX, y: AY }]), keyFor);
    heightfield.rebuild(window);
    hills.rebuild({ ...window, roadDirsAt: hillCutAt });
    const padY = createAfcPadSurfaceSampler(heightfield.cornerYAt, wrap, wrap, 0.012)(AX, AY);
    const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0));
    for (const progress of [0.25, 0.5, 0.75, 1]) {
      const radius = afcBayRadius(progress, AFC_SOCKET_RING_RADIUS);
      for (let i = 0; i < AFC_SOCKET_COUNT; i++) {
        const azimuth = i * Math.PI / 4;
        const x = 0.5 + Math.cos(azimuth) * radius;
        const z = 0.5 + Math.sin(azimuth) * radius;
        for (let j = 0; j < 16; j++) {
          const edge = j * Math.PI / 8;
          ray.ray.origin.set(x + Math.cos(edge) * AFC_BAY_FOUNDATION_RADIUS, 2, z + Math.sin(edge) * AFC_BAY_FOUNDATION_RADIUS);
          const hit = ray.intersectObject(hills.mesh, false)[0];
          expect(hit).toBeDefined();
          expect(hit!.point.y).toBeLessThan(padY);
        }
      }
    }
    hills.dispose();
    heightfield.dispose();
  });

  it("is wired into the true-3D map: hill drapes use hillCutAt, roads still draw from roadDirsAt, the AFC uses the full pad surface", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const mapSource = readFileSync(resolve(here, "../client-map-3d/client-map-3d.ts"), "utf8");
    expect(mapSource).toContain("hillTerrain.rebuild({ ...sharedTerrainWindow, isHillsAt: isHillsTile, roadDirsAt: hillCutAt })");
    expect(mapSource).toContain("deps.wrapX, deps.wrapY, hillCutAt);");
    expect(mapSource).toContain("const roadDirs = roadDirsAt(wx, wy);");
    expect(mapSource).toContain("afcOverlayGroup.addAfc(x, z, afcPadSurfaceY(wx, wy),");
  });
});
