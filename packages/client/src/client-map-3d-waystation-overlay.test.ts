import { IcosahedronGeometry, InstancedMesh, MeshStandardMaterial, Scene } from "three";
import { describe, expect, it } from "vitest";

import { createWaystationOverlay } from "./client-map-3d-waystation-overlay.js";

describe("3D waystation overlay — lens glow per capture state", () => {
  it("keeps a captured waystation's lens dim even while another waystation on the map is still dormant", () => {
    const scene = new Scene();
    const overlay = createWaystationOverlay(scene, 8);

    overlay.clear();
    overlay.addInstance(0, 0, 0, 0, 0, { activated: false });
    overlay.addInstance(10, 10, 0, 10, 10, { activated: true });
    overlay.commit();
    overlay.update(0);

    // The dormant and activated lenses must live on separate InstancedMesh
    // slots (with their own materials) rather than sharing one material
    // whose intensity is derived from the aggregate state of every
    // waystation on the map — otherwise a captured waystation's lens keeps
    // shining as long as any other waystation anywhere is still dormant.
    const lensMeshes = overlay.group.children.filter(
      (c): c is InstancedMesh => c instanceof InstancedMesh && c.geometry instanceof IcosahedronGeometry && c.count > 0
    ); // in use; the remembered-under-fog lens slot stays empty here
    expect(lensMeshes).toHaveLength(2);

    const dormantMesh = lensMeshes.find((m) => (m.material as MeshStandardMaterial).emissiveIntensity >= 1);
    const activeMesh = lensMeshes.find((m) => (m.material as MeshStandardMaterial).emissiveIntensity < 1);
    expect(dormantMesh?.count).toBe(1);
    expect(activeMesh?.count).toBe(1);

    // The captured waystation's lens stays pinned at the dim, constant
    // intensity no matter what nowMs is fed to update() next.
    expect((activeMesh!.material as MeshStandardMaterial).emissiveIntensity).toBe(0.3);
    overlay.update(5000);
    expect((activeMesh!.material as MeshStandardMaterial).emissiveIntensity).toBe(0.3);

    overlay.dispose();
  });
  it("builds a bounded portable tripod and keeps fogged glass still", () => {
    const overlay = createWaystationOverlay(new Scene(), 1);
    overlay.addInstance(0, 0, 0, 0, 0, { activated: false }, true);
    overlay.addInstance(1, 1, 0, 1, 1, { activated: false });
    overlay.commit();
    const mesh = (name: string): InstancedMesh => overlay.group.getObjectByName(`survey-rig-${name}`) as InstancedMesh;
    expect(mesh("legs").count).toBe(3);
    expect(mesh("case").count).toBe(1);
    expect(mesh("shelter").count).toBe(1);
    const remembered = mesh("lensRemembered").material as MeshStandardMaterial;
    overlay.update(0);
    const brightness = remembered.emissiveIntensity;
    overlay.update(5000);
    expect(remembered.emissiveIntensity).toBe(brightness);
    overlay.clear(); overlay.commit();
    expect(mesh("legs").count).toBe(0);
    expect(mesh("lensRemembered").count).toBe(0);
    overlay.dispose();
  });

});
