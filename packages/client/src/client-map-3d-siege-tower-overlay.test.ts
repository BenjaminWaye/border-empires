import { describe, expect, it } from "vitest";
import { InstancedMesh, MeshBasicMaterial, Scene } from "three";
import { createSiegeTowerOverlay } from "./client-map-3d-siege-tower-overlay.js";
import type { SiegeTowerVariant } from "./client-map-3d-siege-tower-palette.js";

// Regression for the initial siege-tower overlay build: PIECE_SPECS listed
// leg/brace/platform slots, but the shared geometry map never gave them a
// geometry, so those 13 of 23 pieces per tower silently rendered nothing
// (the unit box it was clearly meant to use sat unused under the "box" key).
// Every variant slot must resolve to a geometry and each addInstance must
// emit the full piece set.
const PIECE_COUNTS: Record<string, number> = {
  base: 1,
  leg: 4,
  brace: 8,
  platform: 1,
  column: 1,
  ringOuter: 1,
  ringInner: 1,
  barrel: 1,
  lens: 1,
  rim: 1,
  halo: 1,
  beam: 1,
  beamCore: 1
};

const TOTAL_PIECES_PER_TOWER = Object.values(PIECE_COUNTS).reduce((a, b) => a + b, 0);

const pieceMesh = (scene: Scene, variant: SiegeTowerVariant, key: string): InstancedMesh => {
  const mesh = scene.getObjectByName(`${variant}:${key}`);
  expect(mesh, `${variant}:${key} slot`).toBeDefined();
  return mesh as InstancedMesh;
};

describe("createSiegeTowerOverlay", () => {
  it("renders all 23 pieces per tower for both upgraded siege variants", () => {
    const scene = new Scene();
    const overlay = createSiegeTowerOverlay(scene, 8, () => "lens");
    overlay.addInstance(0, 0, 0, 3, 4, "SIEGE_TOWER");
    overlay.addInstance(2, 0, 0, 6, 9, "DREAD_TOWER");
    overlay.commit();
    for (const variant of ["SIEGE_TOWER", "DREAD_TOWER"] as const) {
      let total = 0;
      for (const [key, mult] of Object.entries(PIECE_COUNTS)) {
        const mesh = pieceMesh(scene, variant, key);
        expect(mesh.geometry, `${variant}:${key} geometry`).toBeDefined();
        expect(mesh.count).toBe(mult);
        total += mesh.count;
      }
      expect(total).toBe(TOTAL_PIECES_PER_TOWER);
      expect(total).toBe(23);
    }
    overlay.dispose();
  });

  it("casts and receives sun shadows on solid pieces but not the additive glow lances", () => {
    const scene = new Scene();
    const overlay = createSiegeTowerOverlay(scene, 4, () => "lens");
    overlay.addInstance(0, 0, 0, 1, 1, "SIEGE_TOWER");
    overlay.commit();
    for (const key of ["base", "leg", "brace", "platform", "column", "ringOuter", "ringInner", "barrel", "lens", "rim"]) {
      const mesh = pieceMesh(scene, "SIEGE_TOWER", key);
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(true);
    }
    for (const key of ["halo", "beam", "beamCore"]) {
      const mesh = pieceMesh(scene, "SIEGE_TOWER", key);
      expect(mesh.castShadow).toBe(false);
      expect(mesh.receiveShadow).toBe(false);
    }
    overlay.dispose();
  });

  it("aims the lens at the latest battle and fades the beam in only while a battle is live", () => {
    const scene = new Scene();
    const overlay = createSiegeTowerOverlay(scene, 8, () => "lens");
    overlay.addInstance(0, 0, 0, 10, 10, "SIEGE_TOWER");
    overlay.commit();
    const lensMesh = pieceMesh(scene, "SIEGE_TOWER", "lens");
    const beamMesh = pieceMesh(scene, "SIEGE_TOWER", "beam");
    const beamMaterial = beamMesh.material as MeshBasicMaterial;

    expect(beamMaterial.opacity).toBe(0); // dark before any battle
    const parkedLens = new Float32Array(lensMesh.instanceMatrix.array);
    for (let i = 0; i < 30; i += 1) overlay.update(i * 16); // no active battle
    expect(new Float32Array(lensMesh.instanceMatrix.array)).toEqual(parkedLens);
    expect(beamMaterial.opacity).toBe(0);

    overlay.update(500, { x: 30, y: 10 }); // battle directly east of the tower
    const aimedLens = new Float32Array(lensMesh.instanceMatrix.array);
    expect(aimedLens).not.toEqual(parkedLens); // cradle pitches/tracks toward the battle
    expect(beamMaterial.opacity).toBeGreaterThan(0);
    expect(beamMaterial.opacity).toBeLessThan(1);

    for (let i = 0; i < 300; i += 1) overlay.update(1000 + i * 16); // battle ends; 5%/frame ease snaps to 0 below 0.0005
    expect(beamMaterial.opacity).toBe(0); // beam dims out
    overlay.dispose();
  });

  it("keeps the static tower parked in lens mode but wheels the whole tower in structure mode", () => {
    for (const mode of ["lens", "structure"] as const) {
      const scene = new Scene();
      const overlay = createSiegeTowerOverlay(scene, 8, () => mode);
      overlay.addInstance(0, 0, 0, 10, 10, "DREAD_TOWER");
      overlay.commit();
      const platformMesh = pieceMesh(scene, "DREAD_TOWER", "platform");
      const parkedPlatform = new Float32Array(platformMesh.instanceMatrix.array);
      overlay.update(0, { x: 30, y: 10 }); // battle east of the tower
      const moved = new Float32Array(platformMesh.instanceMatrix.array);
      if (mode === "lens") {
        expect(moved).toEqual(parkedPlatform); // only the lens assembly rotates
      } else {
        expect(moved).not.toEqual(parkedPlatform); // the whole tower wheels around
      }
      overlay.dispose();
    }
  });
});