import { CylinderGeometry, Group, InstancedMesh, Matrix4, MeshStandardMaterial, OctahedronGeometry, Scene, TorusGeometry } from "three";

type ActiveShard = {
  readonly centerX: number;
  readonly centerZ: number;
  readonly surfaceY: number;
  readonly phase: number;
};

export type ShardOverlay = {
  readonly group: Group;
  readonly clear: () => void;
  readonly addInstance: (centerX: number, centerZ: number, surfaceY: number, worldX: number, worldZ: number) => void;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

const BOB_AMP = 0.055;
const BOB_SPEED = 0.0011;
const FLOAT_Y = 0.40;
const SHARD_SX = 0.13;
const SHARD_SY = 0.38;
const SHARD_SZ = 0.13;

export const createShardOverlay = (scene: Scene, maxTiles: number): ShardOverlay => {
  const group = new Group();
  group.name = "shard-overlay";
  scene.add(group);

  // Tall faceted crystal — OctahedronGeometry gives the pointed-diamond shard look
  const shardGeometry = new OctahedronGeometry(1, 0);
  const shardMaterial = new MeshStandardMaterial({
    color: "#2fd0ea",
    emissive: "#1ab4cc",
    emissiveIntensity: 0.6,
    roughness: 0.22,
    metalness: 0.15,
    flatShading: true
  });

  // Glowing platform ring lying flat on the tile surface
  const ringGeometry = new TorusGeometry(0.28, 0.045, 6, 22);
  const ringMaterial = new MeshStandardMaterial({
    color: "#92f5ff",
    emissive: "#92f5ff",
    emissiveIntensity: 1.1,
    roughness: 0.2,
    metalness: 0.0
  });

  // Dark stone base disc
  const baseGeometry = new CylinderGeometry(0.3, 0.32, 0.05, 16);
  const baseMaterial = new MeshStandardMaterial({
    color: "#0e1822",
    roughness: 0.85,
    metalness: 0.0
  });

  const shardMesh = new InstancedMesh(shardGeometry, shardMaterial, maxTiles);
  const ringMesh = new InstancedMesh(ringGeometry, ringMaterial, maxTiles);
  const baseMesh = new InstancedMesh(baseGeometry, baseMaterial, maxTiles);
  shardMesh.frustumCulled = false;
  ringMesh.frustumCulled = false;
  baseMesh.frustumCulled = false;
  group.add(baseMesh, ringMesh, shardMesh);

  const shards: ActiveShard[] = [];
  const m = new Matrix4();
  const rot = new Matrix4();
  const scl = new Matrix4();

  const clear = (): void => { shards.length = 0; };

  const addInstance = (centerX: number, centerZ: number, surfaceY: number, worldX: number, worldZ: number): void => {
    const hash = (((worldX * 73856093) ^ (worldZ * 19349663)) >>> 0);
    const phase = (hash % 1000) / 1000 * Math.PI * 2;
    shards.push({ centerX, centerZ, surfaceY, phase });
  };

  const update = (nowMs: number): void => {
    const count = shards.length;
    shardMesh.count = count;
    ringMesh.count = count;
    baseMesh.count = count;

    for (let i = 0; i < count; i += 1) {
      const s = shards[i]!;
      const t = nowMs * BOB_SPEED + s.phase;
      const bob = Math.sin(t) * BOB_AMP;
      const rotY = t * 0.28;

      // Shard: slowly spins + bobs
      rot.makeRotationY(rotY);
      scl.makeScale(SHARD_SX, SHARD_SY, SHARD_SZ);
      m.multiplyMatrices(rot, scl);
      m.setPosition(s.centerX, s.surfaceY + FLOAT_Y + bob, s.centerZ);
      shardMesh.setMatrixAt(i, m);

      // Platform ring (TorusGeometry already lies flat in XZ plane)
      m.identity();
      m.setPosition(s.centerX, s.surfaceY + 0.06, s.centerZ);
      ringMesh.setMatrixAt(i, m);

      // Base disc
      m.identity();
      m.setPosition(s.centerX, s.surfaceY + 0.03, s.centerZ);
      baseMesh.setMatrixAt(i, m);
    }

    shardMesh.instanceMatrix.needsUpdate = true;
    ringMesh.instanceMatrix.needsUpdate = true;
    baseMesh.instanceMatrix.needsUpdate = true;
  };

  const commit = (): void => { update(0); };

  const dispose = (): void => {
    scene.remove(group);
    shardGeometry.dispose();
    ringGeometry.dispose();
    baseGeometry.dispose();
    shardMaterial.dispose();
    ringMaterial.dispose();
    baseMaterial.dispose();
  };

  return { group, clear, addInstance, commit, update, dispose };
};
