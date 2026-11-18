import { InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Scene } from "three";
import { describe, expect, it } from "vitest";

import { createWaystationOverlay } from "./client-map-3d-waystation-overlay.js";
import { HOLO_CRATE_PARTS } from "./client-waystation-holo-crates/holo-crate-model-3d.js";

const mesh = (overlay: ReturnType<typeof createWaystationOverlay>, name: string): InstancedMesh =>
  overlay.group.getObjectByName(`holo-crate-${name}`) as InstancedMesh;
const total = (overlay: ReturnType<typeof createWaystationOverlay>): number =>
  overlay.group.children.reduce((sum, c) => sum + (c instanceof InstancedMesh ? c.count : 0), 0);

describe("3D waystation overlay — Holo-Locked Stack", () => {
  it("instances every part of the crate stack per site and clears them", () => {
    const overlay = createWaystationOverlay(new Scene(), 4);
    overlay.addInstance(0, 0, 0, 0, 0, { activated: false });
    overlay.addInstance(3, 3, 0, 3, 3, { activated: false });
    overlay.commit();
    expect(total(overlay)).toBe(HOLO_CRATE_PARTS.length * 2);
    expect(mesh(overlay, "hull:hull").count).toBe(6); // three crates per site
    overlay.clear(); overlay.commit();
    expect(total(overlay)).toBe(0);
    overlay.dispose();
  });

  it("animates the live padlock and lights but keeps a remembered (fogged) site still", () => {
    const overlay = createWaystationOverlay(new Scene(), 2);
    overlay.addInstance(0, 0, 0, 0, 0, { activated: false }, true);
    overlay.addInstance(5, 5, 0, 5, 5, { activated: false });
    overlay.commit();
    const liveLock = mesh(overlay, "shackle:holo");
    const stillLock = mesh(overlay, "shackle:holo|still");
    expect(liveLock.count).toBe(1);
    expect(stillLock.count).toBe(1);
    const at = (m: InstancedMesh): number[] => { const out = new Matrix4(); m.getMatrixAt(0, out); return out.elements.slice(); };
    overlay.update(0);
    const live0 = at(liveLock), still0 = at(stillLock);
    const glow = mesh(overlay, "ring:glow").material as MeshStandardMaterial;
    const stillGlow = mesh(overlay, "ring:glow|still").material as MeshStandardMaterial;
    const holo = mesh(overlay, "shackle:holo|still").material as MeshBasicMaterial;
    const g0 = glow.emissiveIntensity, s0 = stillGlow.emissiveIntensity, h0 = holo.opacity;
    overlay.update(700);
    expect(at(liveLock)).not.toEqual(live0);
    expect(at(stillLock)).toEqual(still0);
    expect(glow.emissiveIntensity).not.toBe(g0);
    expect(stillGlow.emissiveIntensity).toBe(s0);
    expect(holo.opacity).toBe(h0);
    overlay.dispose();
  });

  it("never draws a padlock over an already-activated site", () => {
    const overlay = createWaystationOverlay(new Scene(), 1);
    overlay.addInstance(0, 0, 0, 0, 0, { activated: true });
    overlay.commit();
    expect(mesh(overlay, "shackle:holo").count).toBe(0);
    overlay.dispose();
  });
});
