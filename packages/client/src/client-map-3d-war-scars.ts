// True-3D battle scars (shared war-scars.ts): scorched craters, broken stakes
// and scattered stones on ground where garrisons were taken in battle. More
// marks and darker scorch with every battle (level 1..WAR_SCAR_MAX_LEVEL);
// they go when the 24h fade ends. Owned by client-map-3d-capture-aftermath-fx.ts,
// which feeds it each visible tile on a terrain rebuild. 2D counterpart:
// client-map-2d-war-scars.ts.
import { BoxGeometry, CircleGeometry, Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Quaternion, Scene, Vector3 } from "three";
import { WAR_SCAR_MAX_LEVEL } from "@border-empires/shared";

const MAX_SCARRED_TILES = 512;
const CRATERS_PER_LEVEL = 2;
const DEBRIS_PER_LEVEL = 3;
const MAX_CRATERS = MAX_SCARRED_TILES * CRATERS_PER_LEVEL * WAR_SCAR_MAX_LEVEL;
const MAX_DEBRIS = MAX_SCARRED_TILES * DEBRIS_PER_LEVEL * WAR_SCAR_MAX_LEVEL;
const SCORCH_COLORS = ["#2a2420", "#1f1b18", "#3a3029"] as const;
const DEBRIS_COLORS = ["#4b3a2b", "#6b5a48", "#5c5f63", "#8a3f22", "#3d3631"] as const;

export type WarScarLayer3D = {
  readonly clear: () => void;
  readonly addTile: (level: number, x: number, z: number, surfaceY: number, seed: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

const seededRandom = (seed: number): (() => number) => {
  let state = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => {
    state = (state * 48271) % 2147483647;
    return (state - 1) / 2147483646;
  };
};

export const createWarScarLayer3D = (scene: Scene): WarScarLayer3D => {
  const craterGeometry = new CircleGeometry(1, 14).rotateX(-Math.PI / 2);
  // Flat decals hugging the ground: no depth writes and a polygon offset so
  // they neither z-fight the terrain nor hide what stands on the tile.
  const craterMaterial = new MeshBasicMaterial({ transparent: true, opacity: 0.72, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const craters = new InstancedMesh(craterGeometry, craterMaterial, MAX_CRATERS);
  const debrisGeometry = new BoxGeometry(1, 1, 1);
  const debrisMaterial = new MeshStandardMaterial({ roughness: 0.95, metalness: 0.05 });
  const debris = new InstancedMesh(debrisGeometry, debrisMaterial, MAX_DEBRIS);
  for (const mesh of [craters, debris]) {
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  const matrix = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const axis = new Vector3();
  const color = new Color();
  let craterCount = 0;
  let debrisCount = 0;
  let tiles = 0;

  const addTile = (level: number, x: number, z: number, surfaceY: number, seed: number): void => {
    if (level <= 0 || tiles >= MAX_SCARRED_TILES) return;
    tiles += 1;
    const random = seededRandom(seed * 7919 + 13);
    const depth = Math.min(level, WAR_SCAR_MAX_LEVEL) / WAR_SCAR_MAX_LEVEL;
    for (let i = 0; i < level * CRATERS_PER_LEVEL && craterCount < MAX_CRATERS; i += 1) {
      const radius = 0.07 + random() * 0.1 + depth * 0.05;
      position.set(x + (random() - 0.5) * 0.8, surfaceY + 0.015, z + (random() - 0.5) * 0.8);
      scale.set(radius * (0.8 + random() * 0.5), 1, radius * (0.8 + random() * 0.5));
      rotation.setFromAxisAngle(axis.set(0, 1, 0), random() * Math.PI);
      matrix.compose(position, rotation, scale);
      craters.setMatrixAt(craterCount, matrix);
      craters.setColorAt(craterCount, color.set(SCORCH_COLORS[Math.floor(random() * SCORCH_COLORS.length)]!));
      craterCount += 1;
    }
    for (let i = 0; i < level * DEBRIS_PER_LEVEL && debrisCount < MAX_DEBRIS; i += 1) {
      // Every third piece is a broken stake or spear shaft, leaning over;
      // the rest are stones and shattered timber lying flat.
      const stake = i % 3 === 0;
      const size = 0.03 + random() * 0.04;
      if (stake) scale.set(0.018, 0.12 + random() * 0.1, 0.018);
      else scale.set(size * (1 + random()), size * 0.6, size * (0.8 + random()));
      position.set(x + (random() - 0.5) * 0.82, surfaceY + scale.y * 0.4, z + (random() - 0.5) * 0.82);
      axis.set(random() - 0.5, stake ? 0.15 : 1, random() - 0.5).normalize();
      rotation.setFromAxisAngle(axis, stake ? 0.5 + random() * 0.6 : random() * Math.PI);
      matrix.compose(position, rotation, scale);
      debris.setMatrixAt(debrisCount, matrix);
      debris.setColorAt(debrisCount, color.set(DEBRIS_COLORS[Math.floor(random() * DEBRIS_COLORS.length)]!));
      debrisCount += 1;
    }
  };

  const clear = (): void => {
    craterCount = 0;
    debrisCount = 0;
    tiles = 0;
  };

  const commit = (): void => {
    craters.count = craterCount;
    debris.count = debrisCount;
    for (const mesh of [craters, debris]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    for (const mesh of [craters, debris]) {
      scene.remove(mesh);
      mesh.dispose();
    }
    craterGeometry.dispose();
    craterMaterial.dispose();
    debrisGeometry.dispose();
    debrisMaterial.dispose();
  };

  return { clear, addTile, commit, dispose };
};
