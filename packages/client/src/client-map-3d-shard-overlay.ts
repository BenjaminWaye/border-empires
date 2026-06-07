import { ConeGeometry, Group, InstancedMesh, Matrix4, MeshStandardMaterial, OctahedronGeometry, Scene, Vector3 } from "three";

type ShardPart = {
  readonly kind: "spire" | "cluster" | "shattered";
  readonly ox: number;
  readonly oz: number;
  readonly size: number;
  readonly rotY?: number;
};

const VARIANT_SPIRE: ReadonlyArray<ShardPart> = [
  { kind: "spire", ox: 0, oz: 0, size: 0.38 },
  { kind: "cluster", ox: -0.16, oz: 0.11, size: 0.14 },
  { kind: "cluster", ox: 0.14, oz: -0.12, size: 0.12 }
];
const VARIANT_CLUSTER: ReadonlyArray<ShardPart> = [
  { kind: "cluster", ox: -0.16, oz: 0.12, size: 0.2 },
  { kind: "cluster", ox: 0.08, oz: 0.14, size: 0.16 },
  { kind: "cluster", ox: 0.14, oz: -0.08, size: 0.13 },
  { kind: "cluster", ox: -0.04, oz: -0.14, size: 0.15 }
];
const VARIANT_SHATTERED: ReadonlyArray<ShardPart> = [
  { kind: "shattered", ox: -0.2, oz: -0.08, size: 0.17, rotY: Math.PI * 0.3 },
  { kind: "shattered", ox: -0.04, oz: 0.14, size: 0.12, rotY: Math.PI * 0.75 },
  { kind: "shattered", ox: 0.12, oz: 0.03, size: 0.14, rotY: Math.PI * 1.1 },
  { kind: "shattered", ox: 0.2, oz: -0.1, size: 0.11, rotY: Math.PI * 1.6 }
];
const VARIANTS = [VARIANT_SPIRE, VARIANT_CLUSTER, VARIANT_SHATTERED] as const;

const tileHash = (worldX: number, worldZ: number, salt: number, mod: number): number => (((worldX * 73856093) ^ (worldZ * 19349663) ^ (salt * 83492791)) >>> 0) % mod;

export type ShardOverlay = {
  readonly group: Group;
  readonly clear: () => void;
  readonly addInstance: (centerX: number, centerZ: number, surfaceY: number, worldX: number, worldZ: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

const COUNT_PER_TILE_UPPER_BOUND = 6;

export const createShardOverlay = (scene: Scene, maxTiles: number): ShardOverlay => {
  const group = new Group();
  group.name = "shard-overlay";
  scene.add(group);

  const coneGeometry = new ConeGeometry(1, 1, 6, 1, false);
  const octaGeometry = new OctahedronGeometry(1, 0);
  const shardMaterial = new MeshStandardMaterial({
    color: "#32d2e9",
    emissive: "#32d2e9",
    emissiveIntensity: 0.5,
    roughness: 0.36,
    metalness: 0.12,
    flatShading: true
  });

  const max = maxTiles * COUNT_PER_TILE_UPPER_BOUND;
  const coneMesh = new InstancedMesh(coneGeometry, shardMaterial, max);
  const octaMesh = new InstancedMesh(octaGeometry, shardMaterial, max);
  coneMesh.frustumCulled = false;
  octaMesh.frustumCulled = false;
  group.add(coneMesh, octaMesh);

  const matrix = new Matrix4();
  const rotationMatrix = new Matrix4();
  const scale = new Vector3();
  let coneCount = 0;
  let octaCount = 0;

  const clear = (): void => {
    coneCount = 0;
    octaCount = 0;
  };

  const addInstance = (centerX: number, centerZ: number, surfaceY: number, worldX: number, worldZ: number): void => {
    const parts = VARIANTS[tileHash(worldX, worldZ, 71, VARIANTS.length)]!;
    for (const part of parts) {
      const y = surfaceY + part.size * 0.5 + 0.05;
      const rotY = part.rotY ?? 0;
      rotationMatrix.makeRotationY(rotY);
      scale.set(part.size, part.kind === "spire" ? part.size * 1.7 : part.size, part.size);
      matrix.copy(rotationMatrix);
      matrix.scale(scale);
      matrix.setPosition(centerX + part.ox, y, centerZ + part.oz);
      if (part.kind === "spire") {
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
    shardMaterial.dispose();
  };

  return { group, clear, addInstance, commit, dispose };
};
