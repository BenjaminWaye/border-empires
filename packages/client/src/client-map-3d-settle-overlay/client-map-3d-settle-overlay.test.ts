import { BufferAttribute, Color, Mesh, MeshBasicMaterial, Scene } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HILL_INDICES_PER_TILE, HILL_SUBDIV, HILL_VERTS_PER_TILE } from "./client-map-3d-settle-hill-drape.js";
import { createSettleOverlay } from "./client-map-3d-settle-overlay.js";

const NO_HILL_NEIGHBORS = { north: false, south: false, east: false, west: false, northEast: false, northWest: false, southEast: false, southWest: false };
const RED = new Color("#ff0000");
const BLUE = new Color("#0000ff");

// The draped hill tint is the only non-instanced Mesh the overlay adds.
const hillTintMeshOf = (scene: Scene): Mesh => scene.children.find((c): c is Mesh => c instanceof Mesh && !("isInstancedMesh" in c))!;
const positionsOf = (mesh: Mesh): BufferAttribute => mesh.geometry.getAttribute("position") as BufferAttribute;

// Distinct x positions (scene units, relative to the slot's x0) of one hill slot's drape grid.
const drapedColumnsX = (mesh: Mesh, slot: number, x0: number): number[] => {
  const positions = positionsOf(mesh);
  const xs = new Set<number>();
  for (let i = 0; i < HILL_VERTS_PER_TILE; i += 1) xs.add(Math.round((positions.getX(slot * HILL_VERTS_PER_TILE + i) - x0) * 1e5) / 1e5);
  return [...xs].sort((a, b) => a - b);
};

describe("settle overlay on hill tiles", () => {
  afterEach(() => vi.useRealTimers());

  it("tints the draped hill fill in the owner colour and sweeps it in with progress", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const scene = new Scene();
    const overlay = createSettleOverlay(scene, 8);
    overlay.addHillTile(0, 1, 0, 1, 0, 0, 0, 0, RED, 1_000, 11_000, 5, 5, NO_HILL_NEIGHBORS);
    overlay.commit();
    overlay.tick(0);

    const mesh = hillTintMeshOf(scene);
    // The drape has no normals, so it must be unlit; and without vertexColors
    // the per-vertex owner colour is ignored and the fill renders plain white.
    expect(mesh.material).toBeInstanceOf(MeshBasicMaterial);
    expect((mesh.material as MeshBasicMaterial).vertexColors).toBe(true);
    const colors = mesh.geometry.getAttribute("color") as BufferAttribute;
    expect([colors.getX(0), colors.getY(0), colors.getZ(0)]).toEqual([1, 0, 0]);
    expect(Math.max(...drapedColumnsX(mesh, 0, 0))).toBeLessThan(0.1);

    vi.setSystemTime(6_000);
    const versionBefore = positionsOf(mesh).version;
    overlay.tick(16);
    expect(positionsOf(mesh).version).toBeGreaterThan(versionBefore);
    // Covered columns stay on the dome's own a/SUBDIV grid; the rest collapse
    // onto the sweep edge rather than being squeezed off the dome grid.
    const halfway = Array.from({ length: HILL_SUBDIV / 2 + 1 }, (_, a) => a / HILL_SUBDIV);
    expect(drapedColumnsX(mesh, 0, 0)).toEqual(halfway);

    vi.setSystemTime(11_000);
    overlay.tick(32);
    expect(Math.max(...drapedColumnsX(mesh, 0, 0))).toBeCloseTo(1, 5);
    overlay.dispose();
  });

  it("stops re-uploading a hill drape once its fill stops moving", () => {
    vi.useFakeTimers();
    vi.setSystemTime(20_000);
    const scene = new Scene();
    const overlay = createSettleOverlay(scene, 8);
    // Already past resolvesAt: parked at 100% awaiting server confirmation.
    overlay.addHillTile(0, 1, 0, 1, 0, 0, 0, 0, RED, 1_000, 11_000, 5, 5, NO_HILL_NEIGHBORS);
    overlay.commit();
    overlay.tick(0);
    const mesh = hillTintMeshOf(scene);
    const version = positionsOf(mesh).version;
    vi.setSystemTime(21_000);
    overlay.tick(16);
    expect(positionsOf(mesh).version).toBe(version);
    overlay.dispose();
  });

  it("drives each hill slot from its own entry when flat tiles settle alongside", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const scene = new Scene();
    const overlay = createSettleOverlay(scene, 8);
    overlay.addInstance(10.5, 10.5, 0, BLUE, 1_000, 11_000, 10, 10);
    overlay.addInstance(11.5, 10.5, 0, BLUE, 1_000, 11_000, 11, 10);
    // Slot 0 runs 10s, slot 1 runs 40s.
    overlay.addHillTile(0, 1, 0, 1, 0, 0, 0, 0, RED, 1_000, 11_000, 5, 5, NO_HILL_NEIGHBORS);
    overlay.addHillTile(3, 4, 0, 1, 0, 0, 0, 0, RED, 1_000, 41_000, 8, 5, NO_HILL_NEIGHBORS);
    overlay.commit();

    vi.setSystemTime(6_000);
    overlay.tick(16);
    const mesh = hillTintMeshOf(scene);
    expect(mesh.geometry.drawRange.count).toBe(2 * HILL_INDICES_PER_TILE);
    expect(Math.max(...drapedColumnsX(mesh, 0, 0))).toBeCloseTo(0.5, 5);
    expect(Math.max(...drapedColumnsX(mesh, 1, 3))).toBeCloseTo(0.125, 5);
    overlay.dispose();
  });
});
