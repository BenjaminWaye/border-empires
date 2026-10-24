import { BufferAttribute, Color, Mesh, MeshStandardMaterial, Scene } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSettleOverlay } from "./client-map-3d-settle-overlay.js";

const NO_HILL_NEIGHBORS = { north: false, south: false, east: false, west: false };

// The draped hill tint is the only non-instanced Mesh the overlay adds.
const hillTintMeshOf = (scene: Scene): Mesh => scene.children.find((c): c is Mesh => c instanceof Mesh && !("isInstancedMesh" in c))!;

const maxDrapedX = (mesh: Mesh): number => {
  const positions = mesh.geometry.getAttribute("position") as BufferAttribute;
  const verts = (mesh.geometry.drawRange.count / 600) * 121;
  let max = -Infinity;
  for (let i = 0; i < verts; i += 1) max = Math.max(max, positions.getX(i));
  return max;
};

describe("settle overlay on hill tiles", () => {
  afterEach(() => vi.useRealTimers());

  it("tints the draped hill fill in the owner colour and sweeps it in with progress", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const scene = new Scene();
    const overlay = createSettleOverlay(scene, 8);
    const red = new Color("#ff0000");
    overlay.addHillTile(0, 1, 0, 1, 0, 0, 0, 0, red, 1_000, 11_000, 5, 5, NO_HILL_NEIGHBORS);
    overlay.commit();
    overlay.tick(0);

    const mesh = hillTintMeshOf(scene);
    // Without vertexColors the per-vertex owner colour is ignored and the
    // fill renders plain white.
    expect((mesh.material as MeshStandardMaterial).vertexColors).toBe(true);
    const colors = mesh.geometry.getAttribute("color") as BufferAttribute;
    expect([colors.getX(0), colors.getY(0), colors.getZ(0)]).toEqual([1, 0, 0]);
    const early = maxDrapedX(mesh);
    expect(early).toBeLessThan(0.1);

    vi.setSystemTime(6_000);
    overlay.tick(16);
    expect(maxDrapedX(mesh)).toBeCloseTo(0.5, 5);

    vi.setSystemTime(11_000);
    overlay.tick(32);
    expect(maxDrapedX(mesh)).toBeCloseTo(1, 5);
    overlay.dispose();
  });
});
