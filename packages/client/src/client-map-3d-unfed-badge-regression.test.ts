import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { InstancedMesh, Scene } from "three";
import { describe, expect, it } from "vitest";

import { createUnfedBadgeOverlay } from "./client-map-3d-unfed-badge-overlay.js";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("3d unfed-town badge regression guard", () => {
  it("wires the unfed badge overlay into the 3D renderer lifecycle", () => {
    const source = clientSource("./client-map-3d.ts");
    expect(source).toContain('createUnfedBadgeOverlay');
    expect(source).toContain('unfedBadgeOverlay.addInstance');
    expect(source).toContain('unfedBadgeOverlay.clear()');
    expect(source).toContain('unfedBadgeOverlay.commit()');
    expect(source).toContain('unfedBadgeOverlay.dispose()');
  });

  it("paints the badge only when the real town record reports isFed === false", () => {
    const source = clientSource("./client-map-3d.ts");
    // Parity with the 2D predicate (`tile.town && !tile.town.isFed`):
    // we require an explicit isFed === false, and we skip demo-only tiles
    // by gating on tile?.town (which is undefined for synthesized demo
    // entries).
    expect(source).toContain('tile?.town && tile.town.isFed === false');
    expect(source).toContain('unfedBadgeOverlay.addInstance(x, z, surfaceY)');
  });

  it("emits exactly one triangle + dot pair per unfed town and clears between frames", () => {
    const scene = new Scene();
    const overlay = createUnfedBadgeOverlay(scene, 32);
    const meshes = overlay.group.children.filter(
      (c): c is InstancedMesh => c instanceof InstancedMesh
    );
    // Triangle + dot — two InstancedMesh objects on the overlay group.
    expect(meshes).toHaveLength(2);

    overlay.clear();
    overlay.addInstance(1, 2, 0.5);
    overlay.commit();
    expect(meshes[0]!.count).toBe(1);
    expect(meshes[1]!.count).toBe(1);

    overlay.clear();
    overlay.commit();
    expect(meshes[0]!.count).toBe(0);
    expect(meshes[1]!.count).toBe(0);

    overlay.dispose();
  });
});
