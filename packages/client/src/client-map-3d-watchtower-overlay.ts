import { CircleGeometry, CylinderGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Scene, SphereGeometry, TorusGeometry } from "three";

/**
 * 3D representation for watchtower sites (see server-worldgen-watchtowers.ts
 * / Tile["watchtower"]). Steampunk-styled: a riveted brass tower body with a
 * copper pipe-band, a slowly-rotating brass gear plate, and a warm-glowing
 * lantern beacon on top (brighter once activated). A ground "reveal ring"
 * flares amber and pulses outward during the ~10s window right after a
 * player expands onto the tile (tile.watchtower.revealUntil), matching the
 * 2D minimap's pulse (see client-minimap.ts).
 */
type ActiveWatchtower = {
  readonly centerX: number;
  readonly centerZ: number;
  readonly surfaceY: number;
  readonly phase: number;
  readonly activated: boolean;
  readonly revealUntil: number | undefined;
};

export type WatchtowerOverlay = {
  readonly group: Group;
  readonly clear: () => void;
  readonly addInstance: (
    centerX: number,
    centerZ: number,
    surfaceY: number,
    worldX: number,
    worldZ: number,
    watchtower: { activated: boolean; revealUntil?: number }
  ) => void;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

const TOWER_HEIGHT = 0.6;
const TOWER_RADIUS = 0.11;
const BAND_Y = TOWER_HEIGHT * 0.62;
const GEAR_Y = TOWER_HEIGHT * 0.85;
const GEAR_RADIUS = TOWER_RADIUS * 1.35;
const LANTERN_Y = TOWER_HEIGHT + 0.11;
const GEAR_SPEED = 0.00065;
const PULSE_SPEED = 0.0018;

export const createWatchtowerOverlay = (scene: Scene, maxTiles: number): WatchtowerOverlay => {
  const group = new Group();
  group.name = "watchtower-overlay";
  scene.add(group);

  // Riveted brass tower body — slightly tapered, warm metallic sheen.
  const towerGeometry = new CylinderGeometry(TOWER_RADIUS * 0.72, TOWER_RADIUS, TOWER_HEIGHT, 8);
  const towerMaterial = new MeshStandardMaterial({ color: "#8a6a3a", roughness: 0.45, metalness: 0.75 });

  // Copper pipe-band wrapped around the tower, riveted look via a torus.
  const bandGeometry = new TorusGeometry(TOWER_RADIUS * 0.95, TOWER_RADIUS * 0.14, 6, 10);
  const bandMaterial = new MeshStandardMaterial({ color: "#b5722f", roughness: 0.35, metalness: 0.85 });

  // Flat brass gear plate that slowly rotates — the steampunk "clockwork" tell.
  const gearGeometry = new CylinderGeometry(GEAR_RADIUS, GEAR_RADIUS, TOWER_RADIUS * 0.3, 8);
  const gearMaterial = new MeshStandardMaterial({ color: "#c98d3f", roughness: 0.3, metalness: 0.9 });

  // Warm lantern beacon on top — dim while dormant, glows once activated.
  const lanternGeometry = new SphereGeometry(TOWER_RADIUS * 0.8, 10, 8);
  const lanternMaterial = new MeshStandardMaterial({
    color: "#ffb347",
    emissive: "#ff9d3d",
    emissiveIntensity: 0.4,
    roughness: 0.3,
    metalness: 0.2
  });

  // Ground reveal pulse — amber flare matching the lantern, unlit for a
  // consistent glow regardless of scene lighting.
  const ringGeometry = new CircleGeometry(1, 32);
  const ringMaterial = new MeshBasicMaterial({ toneMapped: false, color: "#ffb347", transparent: true, opacity: 0, depthWrite: false });

  const towerMesh = new InstancedMesh(towerGeometry, towerMaterial, maxTiles);
  const bandMesh = new InstancedMesh(bandGeometry, bandMaterial, maxTiles);
  const gearMesh = new InstancedMesh(gearGeometry, gearMaterial, maxTiles);
  const lanternMesh = new InstancedMesh(lanternGeometry, lanternMaterial, maxTiles);
  const ringMesh = new InstancedMesh(ringGeometry, ringMaterial, maxTiles);
  for (const mesh of [towerMesh, bandMesh, gearMesh, lanternMesh, ringMesh]) mesh.frustumCulled = false;
  group.add(ringMesh, towerMesh, bandMesh, gearMesh, lanternMesh);

  const towers: ActiveWatchtower[] = [];
  const m = new Matrix4();
  const rot = new Matrix4();
  const scl = new Matrix4();

  const clear = (): void => { towers.length = 0; };

  const addInstance = (
    centerX: number,
    centerZ: number,
    surfaceY: number,
    worldX: number,
    worldZ: number,
    watchtower: { activated: boolean; revealUntil?: number }
  ): void => {
    const hash = (((worldX * 92_821) ^ (worldZ * 68_917)) >>> 0);
    const phase = ((hash % 1000) / 1000) * Math.PI * 2;
    towers.push({ centerX, centerZ, surfaceY, phase, activated: watchtower.activated, revealUntil: watchtower.revealUntil });
  };

  const update = (nowMs: number): void => {
    const count = towers.length;
    towerMesh.count = count;
    bandMesh.count = count;
    gearMesh.count = count;
    lanternMesh.count = count;
    ringMesh.count = count;

    for (let i = 0; i < count; i += 1) {
      const t = towers[i]!;

      scl.makeScale(1, 1, 1);
      m.copy(scl);
      m.setPosition(t.centerX, t.surfaceY + TOWER_HEIGHT / 2, t.centerZ);
      towerMesh.setMatrixAt(i, m);

      rot.makeRotationX(Math.PI / 2);
      m.copy(rot);
      m.setPosition(t.centerX, t.surfaceY + BAND_Y, t.centerZ);
      bandMesh.setMatrixAt(i, m);

      // Gear plate: slow continuous rotation, phase-offset per instance so a
      // field of towers doesn't spin in lockstep.
      rot.makeRotationY(nowMs * GEAR_SPEED + t.phase);
      m.copy(rot);
      m.setPosition(t.centerX, t.surfaceY + GEAR_Y, t.centerZ);
      gearMesh.setMatrixAt(i, m);

      m.identity();
      m.setPosition(t.centerX, t.surfaceY + LANTERN_Y, t.centerZ);
      lanternMesh.setMatrixAt(i, m);
      lanternMaterial.emissiveIntensity = t.activated ? 1.1 : 0.4;

      const revealing = typeof t.revealUntil === "number" && t.revealUntil > nowMs;
      if (revealing) {
        const elapsed = nowMs * PULSE_SPEED + t.phase;
        const pulse = 0.5 + 0.5 * Math.sin(elapsed);
        const radius = 0.5 + pulse * 0.5;
        rot.makeRotationX(-Math.PI / 2);
        scl.makeScale(radius, radius, 1);
        m.multiplyMatrices(rot, scl);
        m.setPosition(t.centerX, t.surfaceY + 0.015, t.centerZ);
        ringMesh.setMatrixAt(i, m);
        ringMaterial.opacity = 0.35 + pulse * 0.25;
      } else {
        scl.makeScale(0, 0, 0);
        ringMesh.setMatrixAt(i, scl);
      }
    }

    towerMesh.instanceMatrix.clearUpdateRanges();
    towerMesh.instanceMatrix.addUpdateRange(0, towerMesh.count * 16);
    towerMesh.instanceMatrix.needsUpdate = true;
    bandMesh.instanceMatrix.clearUpdateRanges();
    bandMesh.instanceMatrix.addUpdateRange(0, bandMesh.count * 16);
    bandMesh.instanceMatrix.needsUpdate = true;
    gearMesh.instanceMatrix.clearUpdateRanges();
    gearMesh.instanceMatrix.addUpdateRange(0, gearMesh.count * 16);
    gearMesh.instanceMatrix.needsUpdate = true;
    lanternMesh.instanceMatrix.clearUpdateRanges();
    lanternMesh.instanceMatrix.addUpdateRange(0, lanternMesh.count * 16);
    lanternMesh.instanceMatrix.needsUpdate = true;
    ringMesh.instanceMatrix.clearUpdateRanges();
    ringMesh.instanceMatrix.addUpdateRange(0, ringMesh.count * 16);
    ringMesh.instanceMatrix.needsUpdate = true;
  };

  const commit = (): void => { update(0); };

  const dispose = (): void => {
    scene.remove(group);
    towerGeometry.dispose();
    bandGeometry.dispose();
    gearGeometry.dispose();
    lanternGeometry.dispose();
    ringGeometry.dispose();
    towerMaterial.dispose();
    bandMaterial.dispose();
    gearMaterial.dispose();
    lanternMaterial.dispose();
    ringMaterial.dispose();
  };

  return { group, clear, addInstance, commit, update, dispose };
};
