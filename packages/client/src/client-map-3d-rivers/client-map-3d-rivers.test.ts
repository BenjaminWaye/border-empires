import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BufferGeometry, Mesh, Scene } from "three";
import { describe, expect, it } from "vitest";
import { setWorldSeed } from "@border-empires/shared";
import { createRiverOverlay } from "./client-map-3d-rivers.js";

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
  const WIDE_WINDOW = { camX: 225, camY: 225, halfW: 225, halfH: 225 };

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

  it("only renders geometry near the requested camera window, not the whole world", () => {
    setWorldSeed(2024);
    const scene = new Scene();
    const overlay = createRiverOverlay(scene);

    overlay.rebuild({ camX: 225, camY: 225, halfW: 100, halfH: 100 });
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
});
