import {
  AdditiveBlending,
  CanvasTexture,
  CircleGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  Scene,
  SRGBColorSpace
} from "three";

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

// Cheap glow, no post-processing: a radial-gradient texture on the
// shimmer's own already-instanced ground decal, blended additively so it
// reads as light bleeding into the ground rather than a flat translucent
// disc. Same technique as the aether bridge pylon's aura sprite
// (makeAuraTexture in client-map-3d-aether-bridge-pylon-overlay.ts) — but
// applied to an existing InstancedMesh instead of one Sprite per instance.
// Shard sites share the same MAX_VISIBLE_TILES budget as every other
// overlay (unlike bridge pylons, capped at a small MAX_BRIDGE_PYLONS), so a
// non-instanced Sprite per shard wouldn't be safe to assume cheap at scale
// the way it is for a pylon — reusing the instanced mesh keeps this
// draw-call-count-independent of how many shards are actually on screen.
//
// A flat color with additive blending would look wrong (a hard-edged
// colored disc popping in, not a soft glow) — additive blending only reads
// as "glow" when the source already fades to nothing at its edge, which is
// what the gradient texture's alpha does.
const SHIMMER_CORE = "50, 210, 233"; // #32d2e9 as r,g,b — same hue the flat shimmer used before
const makeShimmerGlowTexture = (): CanvasTexture | null => {
  // Node test env has no `document`; the overlay still builds (no texture).
  if (typeof document === "undefined") return null;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${SHIMMER_CORE}, 0.85)`);
  grad.addColorStop(0.5, `rgba(${SHIMMER_CORE}, 0.32)`);
  grad.addColorStop(1, `rgba(${SHIMMER_CORE}, 0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};

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
  // with the tile surface. AdditiveBlending + the radial-gradient map (see
  // makeShimmerGlowTexture above) is what makes this read as glow rather
  // than a flat translucent disc.
  const shimmerGeometry = new CircleGeometry(1, 24);
  const shimmerTexture = makeShimmerGlowTexture();
  const shimmerMaterial = new MeshBasicMaterial({ toneMapped: false,
    color: "#ffffff",
    ...(shimmerTexture ? { map: shimmerTexture } : {}),
    blending: AdditiveBlending,
    transparent: true,
    opacity: 0.55,
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

    shardMesh.instanceMatrix.clearUpdateRanges();
    shardMesh.instanceMatrix.addUpdateRange(0, shardMesh.count * 16);
    shardMesh.instanceMatrix.needsUpdate = true;
    shimmerMesh.instanceMatrix.clearUpdateRanges();
    shimmerMesh.instanceMatrix.addUpdateRange(0, shimmerMesh.count * 16);
    shimmerMesh.instanceMatrix.needsUpdate = true;
  };

  const commit = (): void => { update(0); };

  const dispose = (): void => {
    scene.remove(group);
    shardGeometry.dispose();
    shimmerGeometry.dispose();
    shardMaterial.dispose();
    shimmerMaterial.dispose();
    shimmerTexture?.dispose();
  };

  return { group, clear, addInstance, commit, update, dispose };
};
