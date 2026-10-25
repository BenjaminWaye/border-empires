import { describe, expect, it } from "vitest";
import { DoubleSide, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial, Raycaster, Scene, Vector3 } from "three";
import { createDistrictGeometry } from "../client-town-district/district-geometry.js";
import { createDistrictOverlay } from "../client-town-district/district-overlay.js";

describe("monument detail integrity", () => {
  it("renders the Aegis field as transparent glass instead of an opaque cap", () => {
    const scene = new Scene(), overlay = createDistrictOverlay(scene, 1);
    overlay.add({ kind: "AEGIS_DOME", x: 0, y: 0, z: 0, foundation: true, operational: true }); overlay.commit();
    const glass = scene.children.find((mesh): mesh is InstancedMesh => mesh instanceof InstancedMesh && mesh.name.endsWith("-glass"));
    expect(glass).toBeDefined();
    expect(glass!.castShadow).toBe(false);
    const material = glass!.material;
    expect(material).toBeInstanceOf(MeshStandardMaterial);
    if (material instanceof MeshStandardMaterial) {
      expect(material.transparent).toBe(true);
      expect(material.opacity).toBeLessThan(0.5);
      expect(material.depthWrite).toBe(false);
    }
    overlay.dispose();
  });
  it("puts the Astral Dock's launch-arm light strip outside its opaque housing", () => {
    const model = createDistrictGeometry("ASTRAL_DOCK", false), material = new MeshBasicMaterial({ side: DoubleSide });
    const radial = new Vector3(Math.SQRT1_2, 0, Math.SQRT1_2);
    const ray = new Raycaster(radial.clone().multiplyScalar(0.18).add(new Vector3(0, 0.175, 0)), radial);
    const distance = (layer: "metal" | "glow"): number => {
      const mesh = new Mesh(model.layers[layer], material); mesh.updateMatrixWorld();
      return ray.intersectObject(mesh)[0]?.distance ?? Infinity;
    };
    expect(distance("glow")).toBeLessThan(distance("metal"));
    for (const geometry of Object.values(model.layers)) geometry.dispose(); material.dispose();
  });
  it("anchors the siege trunnions to its heavy recoil beds", () => {
    const model = createDistrictGeometry("SOVEREIGN_SIEGE_ENGINE", false), material = new MeshBasicMaterial({ side: DoubleSide });
    const mesh = new Mesh(model.layers.metal, material); mesh.updateMatrixWorld();
    const ray = new Raycaster(new Vector3(0.32, 0.41075, -0.035), new Vector3(-1, 0, 0));
    expect(ray.intersectObject(mesh)[0]?.distance ?? Infinity).toBeLessThan(0.12);
    for (const geometry of Object.values(model.layers)) geometry.dispose(); material.dispose();
  });
  it("supports the barrel at its axis instead of leaving trunnions below it", () => {
    const model = createDistrictGeometry("SOVEREIGN_SIEGE_ENGINE", false), material = new MeshBasicMaterial({ side: DoubleSide });
    const mesh = new Mesh(model.layers.metal, material); mesh.updateMatrixWorld();
    for (const x of [0.15, 0.195]) {
      const ray = new Raycaster(new Vector3(x, 0.7, -0.035), new Vector3(0, -1, 0));
      expect(ray.intersectObject(mesh)[0]?.point.y ?? 0).toBeGreaterThan(0.44);
    }
    for (const geometry of Object.values(model.layers)) geometry.dispose(); material.dispose();
  });
  it("keeps the rear core enclosed instead of protruding above its breech", () => {
    const model = createDistrictGeometry("SOVEREIGN_SIEGE_ENGINE", false);
    const glow = model.layers.glow!.getAttribute("position");
    for (let i = 0; i < glow.count; i++) {
      if (glow.getZ(i) < -0.23) {
        const radial = Math.hypot(glow.getX(i), (glow.getY(i) - 0.43 - glow.getZ(i) * 0.55) / Math.hypot(1, 0.55));
        // The 0.14 envelope includes the external accelerator rails.
        expect(radial).toBeLessThan(0.14);
      }
    }
    for (const geometry of Object.values(model.layers)) geometry.dispose();
  });
  it("has a recessed muzzle cavity instead of a flat disc across its opening", () => {
    const model = createDistrictGeometry("SOVEREIGN_SIEGE_ENGINE", false), material = new MeshBasicMaterial({ side: DoubleSide });
    const mesh = new Mesh(model.layers.metal, material); mesh.updateMatrixWorld();
    const ray = new Raycaster(new Vector3(0, 0.43 + 0.46 * 0.55, 0.46), new Vector3(0, -0.55, -1).normalize());
    const hit = ray.intersectObject(mesh)[0]; expect(hit).toBeDefined();
    expect(hit!.point.z).toBeLessThan(0.10);
    for (const geometry of Object.values(model.layers)) geometry.dispose(); material.dispose();
  });
  it("keeps the satellite clear of the launch arms throughout its rotation", () => {
    const model = createDistrictGeometry("ASTRAL_DOCK", false); let animated = 0;
    for (const geometry of Object.values(model.layers)) {
      const positions = geometry.getAttribute("position"), anim = geometry.getAttribute("animA");
      for (let i = 0; i < positions.count; i++) {
        if (Math.abs(anim.getW(i)) < 0.001) continue;
        animated++;
        // Rotation about y preserves this radius. The closest cradle tips
        // are 0.13 from its axis, so every pose must keep this clearance.
        expect(Math.hypot(positions.getX(i), positions.getZ(i))).toBeLessThan(0.12);
      }
      geometry.dispose();
    }
    expect(animated).toBeGreaterThan(0);
  });
  it("keeps the Exchange's upper roof ribs above its curved roof skin", () => {
    const model = createDistrictGeometry("IMPERIAL_EXCHANGE", false);
    const geometry = model.layers.metal!, positions = geometry.getAttribute("position"), colors = geometry.getAttribute("color");
    const exposed: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      if (colors.getX(i) > 0.4 && Math.abs(positions.getX(i)) < 0.02 && positions.getY(i) > 0.4 && positions.getY(i) < 0.425) exposed.push(positions.getZ(i));
    }
    expect(Math.max(...exposed)).toBeGreaterThan(0.145);
    for (const geometry of Object.values(model.layers)) geometry.dispose();
  });
});
