import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { InstancedMesh, Scene } from "three";
import { describe, expect, it } from "vitest";

import { createObservatoryCooldownBadgeOverlay } from "./client-map-3d-observatory-cooldown-badge-overlay.js";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("3d observatory-cooldown badge regression guard", () => {
  it("wires the cooldown badge overlay into the 3D renderer lifecycle", () => {
    const source = clientSource("./client-map-3d.ts");
    expect(source).toContain("createObservatoryCooldownBadgeOverlay");
    expect(source).toContain("observatoryCooldownBadgeOverlay.addInstance(x, z, surfaceY)");
    expect(source).toContain("observatoryCooldownBadgeOverlay.clear()");
    expect(source).toContain("observatoryCooldownBadgeOverlay.commit()");
    expect(source).toContain("observatoryCooldownBadgeOverlay.dispose()");
  });

  it("only paints over our own active observatory whose cooldown is still running", () => {
    const source = clientSource("./client-map-3d.ts");
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
});
