import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BufferGeometry, Mesh, Scene } from "three";
import { describe, expect, it } from "vitest";
import { setWorldSeed, terrainAt, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { createRiverOverlay, maxNearbyElevation, smoothRiverPath, type RiverPath } from "./client-map-3d-rivers.js";
import {
  heightfieldFlatTileElevation,
  HEIGHTFIELD_HILLS_ELEVATION_BONUS,
  type HeightfieldTerrainKind
} from "../client-map-3d-heightfield-terrain.js";

const clientSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "client-map-3d-rivers.ts"), "utf8");
};

const riverMesh = (scene: Scene): Mesh | undefined =>
  scene.children.find((child): child is Mesh => child instanceof Mesh);

const positionsOf = (mesh: Mesh | undefined): Float32Array | undefined => {
  if (!mesh) return undefined;
  const geometry = mesh.geometry as BufferGeometry;
  return (geometry.getAttribute("position").array as Float32Array).slice();
};

describe("decorative river overlay", () => {
  it("is purely read-only against world-gen — never imports a mutating worldgen function", () => {
    const source = clientSource();
    expect(source).not.toContain("overrideTerrainAt");
    expect(source).not.toContain("setWorldSeed");
    expect(source).not.toMatch(/import\s*\{\s*[^}]*\bLandBiome\b/);
  });

  // A window covering most of the 450x450 world so the test reliably
  // captures at least one of the ~10 generated rivers regardless of exactly
  // where they happen to fall for a given seed.
  const ALWAYS_EXPLORED = (): boolean => true;
  const WIDE_WINDOW = { camX: 225, camY: 225, halfW: 225, halfH: 225, isExploredAt: ALWAYS_EXPLORED };

  it("produces the same river geometry across repeated rebuilds for the same seed (no per-rebuild re-randomization)", () => {
    setWorldSeed(2024);
    const scene = new Scene();
    const overlay = createRiverOverlay(scene);

    overlay.rebuild(WIDE_WINDOW);
    const first = positionsOf(riverMesh(scene));

    overlay.rebuild(WIDE_WINDOW);
    const second = positionsOf(riverMesh(scene));

    expect(first).toBeDefined();
    expect(first!.length).toBeGreaterThan(0);
    expect(second).toEqual(first);

    overlay.dispose();
  });

  it("produces different river geometry for a different world seed", () => {
    setWorldSeed(2024);
    const sceneA = new Scene();
    const overlayA = createRiverOverlay(sceneA);
    overlayA.rebuild(WIDE_WINDOW);
    const positionsA = positionsOf(riverMesh(sceneA));

    setWorldSeed(97531);
    const sceneB = new Scene();
    const overlayB = createRiverOverlay(sceneB);
    overlayB.rebuild(WIDE_WINDOW);
    const positionsB = positionsOf(riverMesh(sceneB));

    expect(positionsA).toBeDefined();
    expect(positionsB).toBeDefined();
    expect(positionsB).not.toEqual(positionsA);

    overlayA.dispose();
    overlayB.dispose();
  });

  it("maxNearbyElevation clears a neighbouring MOUNTAIN's elevation, not just the point's own tile", () => {
    // A river point one tile from a MOUNTAIN has a real corner-blended
    // ground surface well above its own flat-land tile's elevation — using
    // only the point's own tile rendered the ribbon underground there.
    const kindAt = (wx: number, wy: number): HeightfieldTerrainKind => (wx === 5 && wy === 5 ? "MOUNTAIN" : "GRASS");
    const elevationAtPointOwnTile = heightfieldFlatTileElevation(4, 4, "GRASS");
    const elevationOfNeighbourMountain = heightfieldFlatTileElevation(5, 5, "MOUNTAIN");

    // (4.5, 4.5) sits in tile (4,4), diagonally adjacent to the mountain at (5,5).
    const result = maxNearbyElevation(4.5, 4.5, kindAt);

    expect(result).toBeGreaterThan(elevationAtPointOwnTile);
    expect(result).toBe(elevationOfNeighbourMountain);
  });

  it("maxNearbyElevation adds the hills dome bonus for a neighbouring hills tile", () => {
    // Hills are rendered as a dome mesh bolted on top of the flat grid
    // (client-map-3d-hills.ts), invisible to heightfieldFlatTileElevation.
    // Without accounting for it here, a river crossing a hills tile
    // rendered underground relative to the dome bulge.
    const kindAt = (): HeightfieldTerrainKind => "GRASS";
    const isHillsAt = (wx: number, wy: number): boolean => wx === 5 && wy === 5;
    const flatElevation = heightfieldFlatTileElevation(5, 5, "GRASS");

    // (4.5, 4.5) sits in tile (4,4), diagonally adjacent to the hill at (5,5).
    const result = maxNearbyElevation(4.5, 4.5, kindAt, isHillsAt);

    expect(result).toBe(flatElevation + HEIGHTFIELD_HILLS_ELEVATION_BONUS);
  });

  it("produces meaningfully longer rivers, not mostly short stubs near the coast", () => {
    // Regression for findRiverStart preferring the *first* near-mountain
    // land tile it found rather than the farthest-from-coast candidate: on
    // a world where most mountains sit close to the coast (land bands here
    // rarely run more than ~40-50 tiles deep anywhere), that produced mostly
    // short stub rivers a handful of tiles long, which read as disconnected
    // scribbles rather than a river reaching the sea from somewhere inland.
    //
    // Total vertex count (4 vertices per ribbon segment) is used as a proxy
    // for total river length here — the merged geometry doesn't carry
    // per-river boundaries to check any single river's span directly. For
    // this seed, the unfixed algorithm produces 10 rivers totalling 77
    // segments (308 vertices); the fix raises that to 116 segments (464
    // vertices) by finding a meaningfully longer source for one of them.
    setWorldSeed(555);
    const scene = new Scene();
    const overlay = createRiverOverlay(scene);
    overlay.rebuild(WIDE_WINDOW);
    const positions = positionsOf(riverMesh(scene));
    expect(positions).toBeDefined();

    const vertexCount = positions!.length / 3;
    expect(vertexCount).toBeGreaterThan(350);

    overlay.dispose();
  });

  it("extends at least one river's ribbon onto the actual sea tile at its mouth, not just adjacent land", () => {
    // walkRiver used to stop as soon as it reached the last *land* tile
    // adjacent to the coast (distance-to-sea == 1), so the ribbon's flat,
    // untapered end could sit up to a tile short of the water depending on
    // wobble — reading as the river stopping just before the sea rather
    // than flowing into it. It now takes one more step onto the actual
    // SEA/COASTAL_SEA tile, so at least one rendered vertex should resolve
    // to water terrain, not just land.
    //
    // Seed 3141's river near (82, 143) was traced by hand: its last *land*
    // point sits at (94.42, 142.62) with terrainAt(95, 142) === "SEA" as its
    // immediate neighbour — a seed/window picked specifically because it
    // does NOT touch water under the old stopping condition, so this
    // actually exercises the fix rather than getting lucky on a coincidental
    // wobble elsewhere in a wide scan.
    setWorldSeed(3141);
    const scene = new Scene();
    const overlay = createRiverOverlay(scene);
    const window = { camX: 82, camY: 143, halfW: 20, halfH: 20, isExploredAt: ALWAYS_EXPLORED };
    overlay.rebuild(window);
    const positions = positionsOf(riverMesh(scene));
    expect(positions).toBeDefined();

    let touchesWater = false;
    for (let i = 0; i < positions!.length && !touchesWater; i += 3) {
      const wx = ((window.camX + positions![i]!) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH;
      const wy = ((window.camY + positions![i + 2]!) % WORLD_HEIGHT + WORLD_HEIGHT) % WORLD_HEIGHT;
      const terrain = terrainAt(Math.floor(wx), Math.floor(wy));
      if (terrain === "SEA" || terrain === "COASTAL_SEA") touchesWater = true;
    }
    expect(touchesWater).toBe(true);

    overlay.dispose();
  });

  it("only renders geometry near the requested camera window, not the whole world", () => {
    setWorldSeed(2024);
    const scene = new Scene();
    const overlay = createRiverOverlay(scene);

    overlay.rebuild({ camX: 225, camY: 225, halfW: 100, halfH: 100, isExploredAt: ALWAYS_EXPLORED });
    const mesh = riverMesh(scene);
    const geometry = mesh?.geometry as BufferGeometry | undefined;
    const positions = geometry?.getAttribute("position").array as Float32Array | undefined;

    expect(positions).toBeDefined();
    expect(positions!.length).toBeGreaterThan(0);
    for (let i = 0; i < positions!.length; i += 3) {
      expect(Math.abs(positions![i]!)).toBeLessThanOrEqual(100 + 2 + 1); // halfW + margin + ribbon half-width slop
      expect(Math.abs(positions![i + 2]!)).toBeLessThanOrEqual(100 + 2 + 1);
    }

    overlay.dispose();
  });

  it("does not draw river segments over tiles the isExploredAt predicate reports as unexplored", () => {
    // Regression for the river overlay bleeding through fog: it only ever
    // culled by camera distance, never checked what the player had actually
    // explored, so segments drew straight through black unexplored tiles
    // the terrain-rebuild loop was skipping.
    setWorldSeed(2024);
    const sceneAll = new Scene();
    const overlayAll = createRiverOverlay(sceneAll);
    overlayAll.rebuild(WIDE_WINDOW);
    const allPositions = positionsOf(riverMesh(sceneAll));
    expect(allPositions).toBeDefined();
    overlayAll.dispose();

    const sceneNoneExplored = new Scene();
    const overlayNoneExplored = createRiverOverlay(sceneNoneExplored);
    overlayNoneExplored.rebuild({ ...WIDE_WINDOW, isExploredAt: (): boolean => false });
    const mesh = riverMesh(sceneNoneExplored);

    // No segment has both endpoints explored, so nothing should render at all.
    expect(mesh).toBeUndefined();

    overlayNoneExplored.dispose();
  });

  it("tapers ribbon width from a narrow source to a wide mouth, instead of a constant width", () => {
    // Regression for the fixed-width ribbon (RIVER_HALF_WIDTH the whole
    // length) that made every river the same thickness from source to sea.
    // Vertices are pushed in left/right pairs per path point (see
    // pushRibbonStrip), so the distance between each pair is that point's
    // rendered width — a real river should show both a narrow end and a
    // noticeably wider end within the same mesh.
    setWorldSeed(2024);
    const scene = new Scene();
    const overlay = createRiverOverlay(scene);
    overlay.rebuild(WIDE_WINDOW);
    const positions = positionsOf(riverMesh(scene));
    expect(positions).toBeDefined();

    let minWidth = Number.POSITIVE_INFINITY;
    let maxWidth = 0;
    for (let i = 0; i + 5 < positions!.length; i += 6) {
      const dx = positions![i]! - positions![i + 3]!;
      const dz = positions![i + 2]! - positions![i + 5]!;
      const width = Math.hypot(dx, dz);
      if (width < minWidth) minWidth = width;
      if (width > maxWidth) maxWidth = width;
    }

    expect(maxWidth).toBeGreaterThan(minWidth * 2);

    overlay.dispose();
  });

  it("smoothRiverPath stays wrap-aware across a world edge instead of extrapolating across the whole map", () => {
    // Regression: walkRiver's neighbour steps wrap toroidally (see wrap()
    // calls there), so a raw path that reaches a world edge can jump from
    // e.g. x=449.5 straight to x=0.5 -- a real one-tile step, not a jump
    // across the map. Fitting Catmull-Rom directly through those raw
    // coordinates (rather than through a wrap-aware local delta) would make
    // the curve extrapolate a segment stretching most of the way across the
    // world instead of the true short step it represents.
    setWorldSeed(2024);
    const path: RiverPath = [
      { wx: WORLD_WIDTH - 1.5, wy: 10.5, halfWidth: 0.1 },
      { wx: WORLD_WIDTH - 0.5, wy: 10.5, halfWidth: 0.12 },
      { wx: 0.5, wy: 10.5, halfWidth: 0.14 }, // wraps past the world edge
      { wx: 1.5, wy: 10.5, halfWidth: 0.16 },
      { wx: 2.5, wy: 10.5, halfWidth: 0.18 }
    ];

    const smoothed = smoothRiverPath(path);

    for (let i = 0; i < smoothed.length - 1; i += 1) {
      const dx = smoothed[i + 1]!.wx - smoothed[i]!.wx;
      // A wrap-corrupted fit would swing wx by nearly WORLD_WIDTH between
      // adjacent samples; a correct fit never moves more than a couple of
      // tiles per sample along this straight, slow-moving path.
      const wrappedDx = dx > WORLD_WIDTH / 2 ? dx - WORLD_WIDTH : dx < -WORLD_WIDTH / 2 ? dx + WORLD_WIDTH : dx;
      expect(Math.abs(wrappedDx)).toBeLessThan(2);
    }
  });
});
