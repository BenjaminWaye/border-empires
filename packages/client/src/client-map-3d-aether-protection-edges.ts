import { Color, DoubleSide, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Scene } from "three";
import type { AetherProtectionEdges } from "./client-aether-tower-protection/client-aether-tower-protection.js";

// Outline of the Aether Tower protection field on the true-3D renderer: a
// thin flat strip along each side of a shielded tile where the field ends
// (aetherProtectionEdges), so the shield reads as a bounded area rather than
// just recoloured land. Instanced strips instead of LineSegments because WebGL
// lines are 1px wide on most platforms -- too faint to see at play zoom.
// The 2D fallback draws the same strips in drawAetherProtectionTile2D.

const STRIP_WIDTH = 0.1; // in tiles
const RISE_ABOVE_HEIGHTFIELD = 0.013; // just above the field's glow
const HALF = 0.5 - STRIP_WIDTH / 2;

export type AetherProtectionEdgeOverlay = {
  readonly clear: () => void;
  /** (sceneX, sceneZ) is the tile centre. */
  readonly addTile: (edges: AetherProtectionEdges, sceneX: number, sceneZ: number, surfaceY: number, color: string) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

type Strip = { x: number; y: number; z: number; alongZ: boolean; color: string };

export const createAetherProtectionEdgeOverlay = (scene: Scene, maxStrips: number): AetherProtectionEdgeOverlay => {
  const geometry = new PlaneGeometry(1, STRIP_WIDTH).rotateX(-Math.PI / 2);
  const material = new MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, side: DoubleSide });
  const mesh = new InstancedMesh(geometry, material, maxStrips);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = 23; // above the glow (20), under the selected tower's range ring (24/26)
  scene.add(mesh);

  let strips: Strip[] = [];
  const matrix = new Matrix4();
  const rotateToZ = new Matrix4().makeRotationY(Math.PI / 2);
  const tmpColor = new Color();

  const push = (strip: Strip): void => {
    if (strips.length < maxStrips) strips.push(strip);
  };

  return {
    clear: () => {
      strips = [];
    },
    addTile: (edges, sceneX, sceneZ, surfaceY, color) => {
      const y = surfaceY + RISE_ABOVE_HEIGHTFIELD;
      if (edges.north) push({ x: sceneX, y, z: sceneZ - HALF, alongZ: false, color });
      if (edges.south) push({ x: sceneX, y, z: sceneZ + HALF, alongZ: false, color });
      if (edges.west) push({ x: sceneX - HALF, y, z: sceneZ, alongZ: true, color });
      if (edges.east) push({ x: sceneX + HALF, y, z: sceneZ, alongZ: true, color });
    },
    commit: () => {
      mesh.count = strips.length;
      for (let i = 0; i < strips.length; i += 1) {
        const strip = strips[i]!;
        if (strip.alongZ) matrix.copy(rotateToZ).setPosition(strip.x, strip.y, strip.z);
        else matrix.makeTranslation(strip.x, strip.y, strip.z);
        mesh.setMatrixAt(i, matrix);
        mesh.setColorAt(i, tmpColor.set(strip.color));
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    dispose: () => {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    }
  };
};
