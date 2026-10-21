import { describe, expect, it } from "vitest";
import { InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Scene, Vector3 } from "three";
import { createSiegeTowerOverlay } from "./client-map-3d-siege-tower-overlay.js";
import type { SiegeTowerVariant } from "./client-map-3d-siege-tower-palette.js";

// Regression for the initial siege-tower overlay build: PIECE_SPECS listed
// leg/brace/platform slots, but the shared geometry map never gave them a
// geometry, so those 13 of 23 pieces per tower silently rendered nothing
// (the unit box it was clearly meant to use sat unused under the "box" key).
// Every variant slot must resolve to a geometry and each addInstance must
// emit the full piece set.
const PIECE_COUNTS: Record<SiegeTowerVariant, Record<string, number>> = {
  SIEGE_TOWER: {
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
  },
  DREAD_TOWER: {
    base: 1,
    pylon: 1,
    core: 1,
    coreHalo: 1,
    ringA: 1,
    ringB: 1,
    ringC: 1,
    ringD: 1,
    sky: 1,
    leg: 4,
    brace: 8,
    platform: 1,
    beam: 1,
    beamCore: 1
  }
};

const TOTAL_PIECES_PER_TOWER: Record<SiegeTowerVariant, number> = {
  SIEGE_TOWER: Object.values(PIECE_COUNTS.SIEGE_TOWER).reduce((a, b) => a + b, 0),
  DREAD_TOWER: Object.values(PIECE_COUNTS.DREAD_TOWER).reduce((a, b) => a + b, 0)
};

const pieceMesh = (scene: Scene, variant: SiegeTowerVariant, key: string): InstancedMesh => {
  const mesh = scene.getObjectByName(`${variant}:${key}`);
  expect(mesh, `${variant}:${key} slot`).toBeDefined();
  return mesh as InstancedMesh;
};

describe("createSiegeTowerOverlay", () => {
  it("renders the full piece set for both upgraded siege variants (23 siege, 24 dread)", () => {
    const scene = new Scene();
    const overlay = createSiegeTowerOverlay(scene, 8, () => "lens");
    overlay.addInstance(0, 0, 0, 3, 4, "SIEGE_TOWER");
    overlay.addInstance(2, 0, 0, 6, 9, "DREAD_TOWER");
    overlay.commit();
    for (const variant of ["SIEGE_TOWER", "DREAD_TOWER"] as const) {
      let total = 0;
      for (const [key, mult] of Object.entries(PIECE_COUNTS[variant])) {
        const mesh = pieceMesh(scene, variant, key);
        expect(mesh.geometry, `${variant}:${key} geometry`).toBeDefined();
        expect(mesh.count).toBe(mult);
        total += mesh.count;
      }
      expect(total).toBe(TOTAL_PIECES_PER_TOWER[variant]);
      expect(total).toBe(variant === "DREAD_TOWER" ? 24 : 23);
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

  it("hasInstances() reports whether a real tower exists on the map", () => {
    const scene = new Scene();
    const overlay = createSiegeTowerOverlay(scene, 8, () => "lens");
    expect(overlay.hasInstances()).toBe(false);
    overlay.addInstance(0, 0, 0, 3, 4, "SIEGE_TOWER");
    expect(overlay.hasInstances()).toBe(true);
    overlay.clear();
    expect(overlay.hasInstances()).toBe(false);
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

    overlay.update(500, () => ({ x: 30, y: 10 })); // battle directly east of the tower
    const aimedLens = new Float32Array(lensMesh.instanceMatrix.array);
    expect(aimedLens).not.toEqual(parkedLens); // cradle pitches/tracks toward the battle
    expect(beamMaterial.opacity).toBeGreaterThan(0);
    expect(beamMaterial.opacity).toBeLessThan(1);

    for (let i = 0; i < 300; i += 1) overlay.update(1000 + i * 16); // battle ends; 5%/frame ease snaps to 0 below 0.0005
    expect(beamMaterial.opacity).toBe(0); // beam dims out
    overlay.dispose();
  });

  it("beams only from towers that have a battle of their own, and reports those battles", () => {
    const scene = new Scene();
    const overlay = createSiegeTowerOverlay(scene, 8, () => "lens");
    overlay.addInstance(0, 0, 0, 10, 10, "SIEGE_TOWER");
    overlay.addInstance(40, 0, 0, 50, 10, "SIEGE_TOWER");
    overlay.commit();
    const beamMesh = pieceMesh(scene, "SIEGE_TOWER", "beam");
    const beamLength = (index: number): number => {
      const matrix = new Matrix4();
      beamMesh.getMatrixAt(index, matrix);
      const scale = new Vector3();
      matrix.decompose(new Vector3(), new Quaternion(), scale);
      return scale.y;
    };

    const beamed = overlay.update(0, (wx) => (wx === 10 ? { x: 13, y: 10 } : undefined));

    expect(beamed).toEqual([{ x: 13, y: 10 }]);
    expect(beamLength(0)).toBeGreaterThan(0);
    expect(beamLength(1)).toBe(0); // the idle tower shows no beam while the other fires
    expect(overlay.update(16)).toEqual([]);
    overlay.dispose();
  });

  it("fades each tower's beam on its own, and never flashes one on a tower that wasn't firing", () => {
    const scene = new Scene();
    const overlay = createSiegeTowerOverlay(scene, 8, () => "lens");
    overlay.addInstance(0, 0, 0, 10, 10, "SIEGE_TOWER");
    overlay.addInstance(40, 0, 0, 50, 10, "SIEGE_TOWER");
    overlay.addInstance(80, 0, 0, 90, 10, "SIEGE_TOWER");
    overlay.commit();
    const beamMesh = pieceMesh(scene, "SIEGE_TOWER", "beam");
    const beamLength = (index: number): number => {
      const matrix = new Matrix4();
      beamMesh.getMatrixAt(index, matrix);
      const scale = new Vector3();
      matrix.decompose(new Vector3(), new Quaternion(), scale);
      return scale.y;
    };
    // Towers 0 and 1 fire; tower 2 stays idle throughout.
    for (let i = 0; i < 120; i += 1) overlay.update(i * 16, (wx) => (wx === 10 ? { x: 13, y: 10 } : wx === 50 ? { x: 53, y: 10 } : undefined));
    const fullLength = beamLength(0);

    // Tower 0's battle ends while tower 1 keeps firing: its beam shrinks, not pops.
    overlay.update(2000, (wx) => (wx === 50 ? { x: 53, y: 10 } : undefined));
    expect(beamLength(0)).toBeGreaterThan(fullLength * 0.5);
    expect(beamLength(0)).toBeLessThan(fullLength);

    // Every battle ends: the idle tower never shows a beam while the rest fade.
    for (let i = 0; i < 20; i += 1) {
      overlay.update(2100 + i * 16);
      expect(beamLength(2)).toBe(0);
    }
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
      overlay.update(0, () => ({ x: 30, y: 10 })); // battle east of the tower
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