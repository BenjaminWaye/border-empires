import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Scene,
  Vector3
} from "three";

// 3D dock structures placed on dock tiles, replacing the SVG dock overlay
// in true-3D mode. Three variants give the harbour visual variety; each
// dock is oriented so the pier points outward toward the adjacent water.

type DockPart =
  | { readonly kind: "deck"; readonly cx: number; readonly cz: number; readonly width: number; readonly depth: number; readonly height: number }
  | { readonly kind: "post"; readonly cx: number; readonly cz: number; readonly height: number }
  | { readonly kind: "crate"; readonly cx: number; readonly cz: number; readonly size: number }
  | { readonly kind: "barrel"; readonly cx: number; readonly cz: number; readonly height: number }
  | { readonly kind: "mast"; readonly cx: number; readonly cz: number; readonly height: number };

const VARIANT_PIER: ReadonlyArray<DockPart> = [
  // Long narrow pier sticking outward (positive z = water side after rotation).
  { kind: "deck", cx: 0, cz: 0.18, width: 0.40, depth: 0.60, height: 0.12 },
  { kind: "post", cx: -0.18, cz: 0.42, height: 0.34 },
  { kind: "post", cx: 0.18, cz: 0.42, height: 0.34 },
  { kind: "post", cx: -0.18, cz: 0.08, height: 0.34 },
  { kind: "post", cx: 0.18, cz: 0.08, height: 0.34 },
  { kind: "barrel", cx: 0, cz: 0.36, height: 0.20 }
];

const VARIANT_QUAY: ReadonlyArray<DockPart> = [
  // Wider rectangular quay with stacked crates / barrels on the deck.
  { kind: "deck", cx: 0, cz: 0.12, width: 0.70, depth: 0.52, height: 0.13 },
  { kind: "post", cx: -0.30, cz: 0.32, height: 0.36 },
  { kind: "post", cx: 0.30, cz: 0.32, height: 0.36 },
  { kind: "post", cx: -0.30, cz: -0.06, height: 0.36 },
  { kind: "post", cx: 0.30, cz: -0.06, height: 0.36 },
  { kind: "crate", cx: -0.22, cz: 0.06, size: 0.16 },
  { kind: "crate", cx: -0.06, cz: 0.10, size: 0.14 },
  { kind: "barrel", cx: 0.22, cz: 0.08, height: 0.22 },
  { kind: "barrel", cx: 0.22, cz: 0.26, height: 0.22 }
];

const VARIANT_HARBOR: ReadonlyArray<DockPart> = [
  // L-shaped harbour with a tall mast at the seaward end.
  { kind: "deck", cx: 0, cz: 0.06, width: 0.50, depth: 0.50, height: 0.13 },
  { kind: "deck", cx: 0.22, cz: 0.28, width: 0.26, depth: 0.36, height: 0.13 },
  { kind: "post", cx: -0.20, cz: 0.26, height: 0.36 },
  { kind: "post", cx: 0.20, cz: -0.14, height: 0.36 },
  { kind: "post", cx: 0.32, cz: 0.42, height: 0.36 },
  { kind: "mast", cx: 0.22, cz: 0.36, height: 0.95 },
  { kind: "crate", cx: -0.16, cz: 0.10, size: 0.13 }
];

const VARIANTS: ReadonlyArray<ReadonlyArray<DockPart>> = [VARIANT_PIER, VARIANT_QUAY, VARIANT_HARBOR];

const tileHash = (worldX: number, worldZ: number, salt: number, mod: number): number => {
  const h = ((worldX * 73856093) ^ (worldZ * 19349663) ^ (salt * 83492791)) >>> 0;
  return h % mod;
};

export type DockOverlay = {
  readonly group: Group;
  readonly clear: () => void;
  readonly addInstance: (
    centerX: number,
    centerZ: number,
    surfaceY: number,
    /** Rotation in radians. The dock is modelled facing +z (south); pass
     *  the angle that turns +z toward the adjacent water tile. */
    rotationY: number,
    worldX: number,
    worldZ: number
  ) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

const COUNT_PER_TILE_UPPER_BOUND = 12;

export const createDockOverlay = (scene: Scene, maxTiles: number): DockOverlay => {
  const group = new Group();
  group.name = "dock-overlay";
  scene.add(group);

  const deckGeometry = new BoxGeometry(1, 1, 1);
  const postGeometry = new CylinderGeometry(0.05, 0.06, 1, 6, 1, false);
  const crateGeometry = new BoxGeometry(1, 1, 1);
  const barrelGeometry = new CylinderGeometry(0.08, 0.08, 1, 8, 1, false);
  const mastGeometry = new CylinderGeometry(0.03, 0.038, 1, 6, 1, false);
  const flagGeometry = new ConeGeometry(0.08, 0.14, 4, 1, false);

  const deckMaterial = new MeshStandardMaterial({ color: "#b08054", roughness: 0.86, metalness: 0, flatShading: true });
  const postMaterial = new MeshStandardMaterial({ color: "#6a4e36", roughness: 0.9, metalness: 0, flatShading: true });
  const crateMaterial = new MeshStandardMaterial({ color: "#c8924a", roughness: 0.84, metalness: 0, flatShading: true });
  const barrelMaterial = new MeshStandardMaterial({ color: "#7a553a", roughness: 0.86, metalness: 0, flatShading: true });
  const mastMaterial = new MeshStandardMaterial({ color: "#3a2c20", roughness: 0.88, metalness: 0, flatShading: true });
  const flagMaterial = new MeshStandardMaterial({ color: "#c44141", roughness: 0.7, metalness: 0, flatShading: true });

  const max = maxTiles * COUNT_PER_TILE_UPPER_BOUND;
  const deckMesh = new InstancedMesh(deckGeometry, deckMaterial, max);
  const postMesh = new InstancedMesh(postGeometry, postMaterial, max);
  const crateMesh = new InstancedMesh(crateGeometry, crateMaterial, max);
  const barrelMesh = new InstancedMesh(barrelGeometry, barrelMaterial, max);
  const mastMesh = new InstancedMesh(mastGeometry, mastMaterial, max);
  const flagMesh = new InstancedMesh(flagGeometry, flagMaterial, max);

  for (const mesh of [deckMesh, postMesh, crateMesh, barrelMesh, mastMesh, flagMesh]) {
    mesh.frustumCulled = false;
    mesh.count = 0;
  }
  group.add(deckMesh, postMesh, crateMesh, barrelMesh, mastMesh, flagMesh);

  const tempMatrix = new Matrix4();
  const rotationMatrix = new Matrix4();
  const scaleVec = new Vector3();
  let deckCount = 0;
  let postCount = 0;
  let crateCount = 0;
  let barrelCount = 0;
  let mastCount = 0;
  let flagCount = 0;

  const clear = (): void => {
    deckCount = 0;
    postCount = 0;
    crateCount = 0;
    barrelCount = 0;
    mastCount = 0;
    flagCount = 0;
  };

  const addInstance = (
    centerX: number,
    centerZ: number,
    surfaceY: number,
    rotationY: number,
    worldX: number,
    worldZ: number
  ): void => {
    const variantIdx = tileHash(worldX, worldZ, 23, VARIANTS.length);
    const parts = VARIANTS[variantIdx]!;

    const cosR = Math.cos(rotationY);
    const sinR = Math.sin(rotationY);
    const rotate = (lx: number, lz: number): { x: number; z: number } => ({
      x: lx * cosR - lz * sinR,
      z: lx * sinR + lz * cosR
    });

    rotationMatrix.makeRotationY(rotationY);

    for (const part of parts) {
      const local = rotate(part.cx, part.cz);
      const px = centerX + local.x;
      const pz = centerZ + local.z;

      if (part.kind === "deck") {
        if (deckCount >= max) continue;
        scaleVec.set(part.width, part.height, part.depth);
        tempMatrix.copy(rotationMatrix);
        tempMatrix.scale(scaleVec);
        tempMatrix.setPosition(px, surfaceY + part.height * 0.5, pz);
        deckMesh.setMatrixAt(deckCount, tempMatrix);
        deckCount += 1;
      } else if (part.kind === "post") {
        if (postCount >= max) continue;
        scaleVec.set(1, part.height, 1);
        tempMatrix.makeScale(scaleVec.x, scaleVec.y, scaleVec.z);
        tempMatrix.setPosition(px, surfaceY + part.height * 0.5, pz);
        postMesh.setMatrixAt(postCount, tempMatrix);
        postCount += 1;
      } else if (part.kind === "crate") {
        if (crateCount >= max) continue;
        scaleVec.set(part.size, part.size, part.size);
        tempMatrix.copy(rotationMatrix);
        tempMatrix.scale(scaleVec);
        tempMatrix.setPosition(px, surfaceY + part.size * 0.5 + 0.07, pz);
        crateMesh.setMatrixAt(crateCount, tempMatrix);
        crateCount += 1;
      } else if (part.kind === "barrel") {
        if (barrelCount >= max) continue;
        scaleVec.set(1, part.height, 1);
        tempMatrix.makeScale(scaleVec.x, scaleVec.y, scaleVec.z);
        tempMatrix.setPosition(px, surfaceY + part.height * 0.5 + 0.07, pz);
        barrelMesh.setMatrixAt(barrelCount, tempMatrix);
        barrelCount += 1;
      } else if (part.kind === "mast") {
        if (mastCount >= max) continue;
        scaleVec.set(1, part.height, 1);
        tempMatrix.makeScale(scaleVec.x, scaleVec.y, scaleVec.z);
        tempMatrix.setPosition(px, surfaceY + part.height * 0.5 + 0.07, pz);
        mastMesh.setMatrixAt(mastCount, tempMatrix);
        mastCount += 1;
        if (flagCount < max) {
          tempMatrix.copy(rotationMatrix);
          tempMatrix.setPosition(px + Math.cos(rotationY) * 0.06, surfaceY + part.height + 0.03, pz + Math.sin(rotationY) * 0.06);
          flagMesh.setMatrixAt(flagCount, tempMatrix);
          flagCount += 1;
        }
      }
    }
  };

  const commit = (): void => {
    deckMesh.count = deckCount;
    postMesh.count = postCount;
    crateMesh.count = crateCount;
    barrelMesh.count = barrelCount;
    mastMesh.count = mastCount;
    flagMesh.count = flagCount;
    deckMesh.instanceMatrix.needsUpdate = true;
    postMesh.instanceMatrix.needsUpdate = true;
    crateMesh.instanceMatrix.needsUpdate = true;
    barrelMesh.instanceMatrix.needsUpdate = true;
    mastMesh.instanceMatrix.needsUpdate = true;
    flagMesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(group);
    deckGeometry.dispose();
    postGeometry.dispose();
    crateGeometry.dispose();
    barrelGeometry.dispose();
    mastGeometry.dispose();
    flagGeometry.dispose();
    deckMaterial.dispose();
    postMaterial.dispose();
    crateMaterial.dispose();
    barrelMaterial.dispose();
    mastMaterial.dispose();
    flagMaterial.dispose();
  };

  return { group, clear, addInstance, commit, dispose };
};
