import { CircleGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial, OctahedronGeometry, Scene } from "three";

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
// Shimmer base radius — pulses slightly with the bob
const SHIMMER_R = 0.34;

export const createShardOverlay = (scene: Scene, maxTiles: number): ShardOverlay => {
  const group = new Group();
  group.name = "shard-overlay";
  scene.add(group);

  // Tall faceted crystal
  const shardGeometry = new OctahedronGeometry(1, 0);
  const shardMaterial = new MeshStandardMaterial({
    color: "#ffffff",
    emissive: "#ccefff",
    emissiveIntensity: 0.9,
    roughness: 0.1,
    metalness: 0.0,
    flatShading: true
  });

  // Soft blue shimmer projected on the ground beneath the shard.
  // MeshBasicMaterial keeps it unlit so the glow reads consistently
  // regardless of scene lighting. depthWrite: false prevents z-fighting
  // with the tile surface.
  const shimmerGeometry = new CircleGeometry(1, 24);
  const shimmerMaterial = new MeshBasicMaterial({
    color: "#32d2e9",
    transparent: true,
    opacity: 0.28,
    depthWrite: false
  });

  const shardMesh = new InstancedMesh(shardGeometry, shardMaterial, maxTiles);
  const shimmerMesh = new InstancedMesh(shimmerGeometry, shimmerMaterial, maxTiles);
  shardMesh.frustumCulled = false;
  shimmerMesh.frustumCulled = false;
  // Draw shimmer first so the shard renders on top
  group.add(shimmerMesh, shardMesh);

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
    shimmerMesh.count = count;

    for (let i = 0; i < count; i += 1) {
      const s = shards[i]!;
      const t = nowMs * BOB_SPEED + s.phase;
      const bob = Math.sin(t) * BOB_AMP;
      const rotY = t * 0.28;

      // Shard: bobs + slow spin
      rot.makeRotationY(rotY);
      scl.makeScale(SHARD_SX, SHARD_SY, SHARD_SZ);
      m.multiplyMatrices(rot, scl);
      m.setPosition(s.centerX, s.surfaceY + FLOAT_Y + bob, s.centerZ);
      shardMesh.setMatrixAt(i, m);

      // Shimmer: flat circle lying on the ground, fixed size
      const r = SHIMMER_R;
      // CircleGeometry faces +Y by default; rotate -90° around X so it lies flat
      rot.makeRotationX(-Math.PI / 2);
      scl.makeScale(r, r, 1);
      m.multiplyMatrices(rot, scl);
      m.setPosition(s.centerX, s.surfaceY + 0.01, s.centerZ);
      shimmerMesh.setMatrixAt(i, m);
    }

    shardMesh.instanceMatrix.needsUpdate = true;
    shimmerMesh.instanceMatrix.needsUpdate = true;
  };

  const commit = (): void => { update(0); };

  const dispose = (): void => {
    scene.remove(group);
    shardGeometry.dispose();
    shimmerGeometry.dispose();
    shardMaterial.dispose();
    shimmerMaterial.dispose();
  };

  return { group, clear, addInstance, commit, update, dispose };
};
