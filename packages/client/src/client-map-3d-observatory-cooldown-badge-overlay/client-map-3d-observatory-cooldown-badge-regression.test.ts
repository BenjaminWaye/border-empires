import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { InstancedMesh, Matrix4, Scene, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { TOWER } from "../client-map-3d-aether-tower-body.js";
import { createObservatoryCooldownBadgeOverlay } from "./client-map-3d-observatory-cooldown-badge-overlay.js";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("3d observatory-cooldown badge regression guard", () => {
  it("wires the cooldown badge overlay into the 3D renderer lifecycle", () => {
    const source = clientSource("../client-map-3d/client-map-3d.ts");
    expect(source).toContain("createObservatoryCooldownBadgeOverlay");
    expect(source).toContain("observatoryCooldownBadgeOverlay.addInstance(x, z, surfaceY)");
    expect(source).toContain("observatoryCooldownBadgeOverlay.clear()");
    expect(source).toContain("observatoryCooldownBadgeOverlay.commit()");
    expect(source).toContain("observatoryCooldownBadgeOverlay.dispose()");
  });

  it("only paints over our own active observatory whose cooldown is still running", () => {
    const source = clientSource("../client-map-3d/client-map-3d.ts");
    // Parity with the tile-menu overview: the badge is owner-scoped,
    // active-only, and gated on a live cooldownUntil > now check so it
    // disappears the instant the observatory can cast again.
    expect(source).toContain("ownerId === deps.state.me");
    expect(source).toContain('tile.observatory.status === "active"');
    expect(source).toContain("(tile.observatory.cooldownUntil ?? 0) > Date.now()");
  });

  it("emits exactly one badge per observatory and clears between frames", () => {
    const scene = new Scene();
    const overlay = createObservatoryCooldownBadgeOverlay(scene, 32);
    const meshes = overlay.group.children.filter(
      (c): c is InstancedMesh => c instanceof InstancedMesh
    );
    // Single textured plane per badge (canvas texture: crystal-blue disc
    // + ⏳ hourglass).
    expect(meshes).toHaveLength(1);

    overlay.clear();
    overlay.addInstance(1, 2, 0.5);
    overlay.commit();
    expect(meshes[0]!.count).toBe(1);

    overlay.clear();
    overlay.commit();
    expect(meshes[0]!.count).toBe(0);

    overlay.dispose();
  });

  it("floats above the aether tower's opaque spire tip so it isn't depth-occluded", () => {
    // Regression for a bug where the badge (added correctly to the scene
    // every frame) was invisible in-game because the aether-tower model
    // (PR #1695) is taller than this badge's float height, so the tower's
    // opaque geometry depth-tested the transparent badge plane away. The
    // badge must clear TOWER.spireTipY, not just the old short generic
    // structure mesh this constant used to be tuned for.
    const scene = new Scene();
    const overlay = createObservatoryCooldownBadgeOverlay(scene, 4);
    const surfaceY = 0;
    overlay.addInstance(0, 0, surfaceY);
    overlay.commit();

    const mesh = overlay.group.children.find((c): c is InstancedMesh => c instanceof InstancedMesh)!;
    const matrix = new Matrix4();
    mesh.getMatrixAt(0, matrix);
    const position = new Vector3().setFromMatrixPosition(matrix);

    expect(position.y).toBeGreaterThan(surfaceY + TOWER.spireTipY);

    overlay.dispose();
  });
});
