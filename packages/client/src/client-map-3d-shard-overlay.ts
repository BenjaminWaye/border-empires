import { ConeGeometry, Group, InstancedMesh, Matrix4, MeshStandardMaterial, OctahedronGeometry, Scene, Vector3 } from "three";

type ShardPart = {
  readonly shape: "cone" | "octa";
  readonly ox: number;
  readonly oz: number;
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  readonly ry?: number;
};

const VARIANT_SPIRE: ReadonlyArray<ShardPart> = [
  { shape: "cone", ox: 0, oz: 0, sx: 0.2, sy: 0.58, sz: 0.2 },
  { shape: "octa", ox: -0.12, oz: 0.1, sx: 0.12, sy: 0.12, sz: 0.12 },
  { shape: "octa", ox: 0.12, oz: -0.1, sx: 0.1, sy: 0.1, sz: 0.1 }
];
const VARIANT_CLUSTER: ReadonlyArray<ShardPart> = [
  { shape: "octa", ox: -0.16, oz: 0.08, sx: 0.16, sy: 0.16, sz: 0.16 },
  { shape: "octa", ox: 0, oz: 0.14, sx: 0.14, sy: 0.14, sz: 0.14 },
  { shape: "octa", ox: 0.12, oz: -0.02, sx: 0.13, sy: 0.13, sz: 0.13 },
  { shape: "octa", ox: -0.02, oz: -0.14, sx: 0.12, sy: 0.12, sz: 0.12 }
];
const VARIANT_SHATTERED: ReadonlyArray<ShardPart> = [
  { shape: "cone", ox: -0.18, oz: -0.06, sx: 0.12, sy: 0.22, sz: 0.12, ry: Math.PI * 0.3 },
  { shape: "octa", ox: -0.02, oz: 0.14, sx: 0.1, sy: 0.1, sz: 0.1, ry: Math.PI * 0.7 },
  { shape: "cone", ox: 0.12, oz: 0.04, sx: 0.1, sy: 0.2, sz: 0.1, ry: Math.PI * 1.2 },
  { shape: "octa", ox: 0.2, oz: -0.12, sx: 0.08, sy: 0.08, sz: 0.08, ry: Math.PI * 1.6 }
];
const VARIANTS = [VARIANT_SPIRE, VARIANT_CLUSTER, VARIANT_SHATTERED] as const;

const COUNT_PER_TILE_UPPER_BOUND = 6;
const tileHash = (worldX: number, worldZ: number, salt: number, mod: number): number => {
  const h = ((worldX * 73856093) ^ (worldZ * 19349663) ^ (salt * 83492791)) >>> 0;
  return h % mod;
};

export type ShardOverlay = {
  readonly group: Group;
  readonly clear: () => void;
  readonly addInstance: (centerX: number, centerZ: number, surfaceY: number, worldX: number, worldZ: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createShardOverlay = (scene: Scene, maxTiles: number): ShardOverlay => {
  const group = new Group();
  group.name = "shard-overlay";
  scene.add(group);

  const coneGeometry = new ConeGeometry(1, 1, 6);
  const octaGeometry = new OctahedronGeometry(1, 0);
  const material = new MeshStandardMaterial({
    color: "#32d2e9",
    emissive: "#32d2e9",
    emissiveIntensity: 0.45,
    roughness: 0.4,
    metalness: 0.1,
    flatShading: true
  });

  const max = Math.max(1, maxTiles * COUNT_PER_TILE_UPPER_BOUND);
  const coneMesh = new InstancedMesh(coneGeometry, material, max);
  const octaMesh = new InstancedMesh(octaGeometry, material, max);
  coneMesh.frustumCulled = false;
  octaMesh.frustumCulled = false;
  group.add(coneMesh, octaMesh);

  const matrix = new Matrix4();
  const rotation = new Matrix4();
  const scale = new Vector3();
  let coneCount = 0;
  let octaCount = 0;

  const clear = (): void => {
    coneCount = 0;
    octaCount = 0;
  };

  const addInstance = (centerX: number, centerZ: number, surfaceY: number, worldX: number, worldZ: number): void => {
    const parts = VARIANTS[tileHash(worldX, worldZ, 41, 3)]!;
    for (const part of parts) {
      const y = surfaceY + part.sy * 0.5 + 0.04;
      rotation.makeRotationY(part.ry ?? 0);
      scale.set(part.sx, part.sy, part.sz);
      matrix.copy(rotation);
      matrix.scale(scale);
      matrix.setPosition(centerX + part.ox, y, centerZ + part.oz);
      if (part.shape === "cone") {
        if (coneCount >= max) continue;
        coneMesh.setMatrixAt(coneCount, matrix);
        coneCount += 1;
      } else {
        if (octaCount >= max) continue;
        octaMesh.setMatrixAt(octaCount, matrix);
        octaCount += 1;
      }
    }
  };

  const commit = (): void => {
    coneMesh.count = coneCount;
    octaMesh.count = octaCount;
    coneMesh.instanceMatrix.needsUpdate = true;
    octaMesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(group);
    coneGeometry.dispose();
    octaGeometry.dispose();
    material.dispose();
  };

  return { group, clear, addInstance, commit, dispose };
};
