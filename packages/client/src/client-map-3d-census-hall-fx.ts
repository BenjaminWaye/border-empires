import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Scene,
  SphereGeometry
} from "three";

// Animated companion to the static CENSUS_HALL mesh in
// client-map-3d-structure-civic.ts. The static layout builds a brass
// gearbox housing on the west wall and a chimney on the roof; this file
// owns everything that needs to move every frame on top of those
// anchors: two meshing brass gears, a rising steam plume, and a
// pulsing brass beacon on the dome finial (the "tally just ticked"
// flourish). Kept as its own instanced layer — same shape as
// client-map-3d-village-fx.ts — so the static piece-builder in
// client-map-3d-structure-civic.ts stays purely static (rebuilt only on
// tile-loop rebuilds, never per frame).

const MAX_CENSUS_HALLS = 512;

// ─── Gear cluster (mounted on the gearbox housing, west wall) ─────────
const GEAR_LOCAL = { x: -0.165, y: 0.10, z: -0.07 } as const;
const BIG_GEAR_RADIUS = 0.052;
const SMALL_GEAR_RADIUS = 0.030;
const SMALL_GEAR_OFFSET = { y: 0.052, z: 0.046 } as const;
const GEAR_HUB_THICKNESS = 0.014;
const TEETH_PER_GEAR = 8;
const BIG_GEAR_SPEED = 0.00028; // rad/ms
const SMALL_GEAR_SPEED = -0.00065; // meshes opposite direction, faster (smaller radius)

// ─── Steam plume (rises from the roof chimney) ─────────────────────────
const STEAM_LOCAL = { x: 0.12, y: 0.43, z: -0.08 } as const;
const STEAM_PUFFS_PER_HALL = 3;
const STEAM_PUFF_RADIUS = 0.028;
const STEAM_RISE_HEIGHT = 0.55;
const STEAM_CYCLE_MS = 3400;

// ─── Dome finial beacon (pulses on every "tally tick") ─────────────────
const BEACON_LOCAL = { x: 0, y: 0.46, z: -0.01 } as const;
const BEACON_RADIUS = 0.014;
const BEACON_CYCLE_MS = 1400;

export type CensusHallFx = {
  readonly clear: () => void;
  readonly addInstance: (worldX: number, worldZ: number, surfaceY: number, seed: number) => void;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

type HallRecord = {
  worldX: number;
  worldZ: number;
  surfaceY: number;
  seed: number;
};

const buildGearTeethGeometry = (radius: number): BoxGeometry => {
  // A single tooth block; per-instance matrices place it radially.
  return new BoxGeometry(GEAR_HUB_THICKNESS * 0.9, radius * 0.34, radius * 0.34);
};

export const createCensusHallFx = (scene: Scene): CensusHallFx => {
  const brassMaterial = new MeshStandardMaterial({ color: "#c8943f", roughness: 0.3, metalness: 0.8, flatShading: true });
  const brassDarkMaterial = new MeshStandardMaterial({ color: "#8a6526", roughness: 0.35, metalness: 0.75, flatShading: true });
  const steamMaterial = new MeshBasicMaterial({
    color: "#e8e2d4",
    transparent: true,
    opacity: 0.4,
    blending: AdditiveBlending,
    depthWrite: false
  });
  const beaconMaterial = new MeshBasicMaterial({
    color: "#ffcf6a",
    transparent: true,
    opacity: 0.95,
    blending: AdditiveBlending,
    depthWrite: false
  });

  const bigHubGeo = new CylinderGeometry(BIG_GEAR_RADIUS, BIG_GEAR_RADIUS, GEAR_HUB_THICKNESS, 10);
  const smallHubGeo = new CylinderGeometry(SMALL_GEAR_RADIUS, SMALL_GEAR_RADIUS, GEAR_HUB_THICKNESS, 8);
  const bigToothGeo = buildGearTeethGeometry(BIG_GEAR_RADIUS);
  const smallToothGeo = buildGearTeethGeometry(SMALL_GEAR_RADIUS);
  const steamGeo = new SphereGeometry(STEAM_PUFF_RADIUS, 7, 5);
  const beaconGeo = new SphereGeometry(BEACON_RADIUS, 8, 6);

  const bigHubMesh = new InstancedMesh(bigHubGeo, brassMaterial, MAX_CENSUS_HALLS);
  const smallHubMesh = new InstancedMesh(smallHubGeo, brassDarkMaterial, MAX_CENSUS_HALLS);
  const bigTeethMesh = new InstancedMesh(bigToothGeo, brassMaterial, MAX_CENSUS_HALLS * TEETH_PER_GEAR);
  const smallTeethMesh = new InstancedMesh(smallToothGeo, brassDarkMaterial, MAX_CENSUS_HALLS * TEETH_PER_GEAR);
  const steamMesh = new InstancedMesh(steamGeo, steamMaterial, MAX_CENSUS_HALLS * STEAM_PUFFS_PER_HALL);
  const beaconMesh = new InstancedMesh(beaconGeo, beaconMaterial, MAX_CENSUS_HALLS);

  for (const mesh of [bigHubMesh, smallHubMesh, bigTeethMesh, smallTeethMesh, steamMesh, beaconMesh]) {
    mesh.frustumCulled = false;
    mesh.count = 0;
  }
  scene.add(bigHubMesh, smallHubMesh, bigTeethMesh, smallTeethMesh, steamMesh, beaconMesh);

  const halls: HallRecord[] = [];
  const tempMatrix = new Matrix4();
  const tempSpinMatrix = new Matrix4();
  const tempColor = new Color();

  const clear = (): void => {
    halls.length = 0;
  };

  const addInstance = (worldX: number, worldZ: number, surfaceY: number, seed: number): void => {
    if (halls.length >= MAX_CENSUS_HALLS) return;
    halls.push({ worldX, worldZ, surfaceY, seed });
  };

  const commit = (): void => {
    // Per-frame `update` writes every instance matrix every tick (gears
    // rotate continuously), so commit only needs to size the meshes —
    // it is still required so dispose/clear-then-no-update frames don't
    // render stale leftover instances from a larger previous frame.
    bigHubMesh.count = halls.length;
    smallHubMesh.count = halls.length;
    bigTeethMesh.count = halls.length * TEETH_PER_GEAR;
    smallTeethMesh.count = halls.length * TEETH_PER_GEAR;
    steamMesh.count = halls.length * STEAM_PUFFS_PER_HALL;
    beaconMesh.count = halls.length;
  };

  const placeGear = (
    mesh: InstancedMesh,
    teethMesh: InstancedMesh,
    teethStartIndex: number,
    index: number,
    centerX: number,
    centerY: number,
    centerZ: number,
    radius: number,
    angle: number
  ): void => {
    // Disk axis along world X (visible from the west, where the gearbox
    // housing sits) — rotate the cylinder's default Y-axis onto X via a
    // Z rotation, then spin it about its own X axis over time.
    tempMatrix.makeRotationZ(Math.PI * 0.5);
    tempSpinMatrix.makeRotationX(angle);
    tempMatrix.premultiply(tempSpinMatrix);
    tempMatrix.setPosition(centerX, centerY, centerZ);
    mesh.setMatrixAt(index, tempMatrix);

    for (let t = 0; t < TEETH_PER_GEAR; t += 1) {
      const toothAngle = angle + (t / TEETH_PER_GEAR) * Math.PI * 2;
      const ty = Math.cos(toothAngle) * radius;
      const tz = Math.sin(toothAngle) * radius;
      tempMatrix.makeRotationX(toothAngle);
      tempMatrix.setPosition(centerX, centerY + ty, centerZ + tz);
      teethMesh.setMatrixAt(teethStartIndex + t, tempMatrix);
    }
  };

  const update = (nowMs: number): void => {
    let steamPuff = 0;
    for (let i = 0; i < halls.length; i += 1) {
      const h = halls[i]!;
      const baseX = h.worldX + GEAR_LOCAL.x;
      const baseY = h.surfaceY + GEAR_LOCAL.y;
      const baseZ = h.worldZ + GEAR_LOCAL.z;
      const phase = h.seed % 1000;

      const bigAngle = (nowMs + phase) * BIG_GEAR_SPEED;
      placeGear(bigHubMesh, bigTeethMesh, i * TEETH_PER_GEAR, i, baseX, baseY, baseZ, BIG_GEAR_RADIUS, bigAngle);

      const smallAngle = (nowMs + phase * 1.7) * SMALL_GEAR_SPEED;
      placeGear(
        smallHubMesh,
        smallTeethMesh,
        i * TEETH_PER_GEAR,
        i,
        baseX,
        baseY + SMALL_GEAR_OFFSET.y,
        baseZ + SMALL_GEAR_OFFSET.z,
        SMALL_GEAR_RADIUS,
        smallAngle
      );

      // Steam plume rising from the chimney cap.
      for (let p = 0; p < STEAM_PUFFS_PER_HALL; p += 1) {
        const phaseOffset = (h.seed * 41 + p * 1300) % STEAM_CYCLE_MS;
        const t = ((nowMs + phaseOffset) % STEAM_CYCLE_MS) / STEAM_CYCLE_MS;
        const rise = t * STEAM_RISE_HEIGHT;
        const drift = Math.sin(t * Math.PI * 2 + h.seed) * 0.05 * t;
        const fade = 0.5 * (1 - t) + 0.08;
        const scale = 0.5 + t * 1.5;
        tempMatrix.makeScale(scale, scale, scale);
        tempMatrix.setPosition(
          h.worldX + STEAM_LOCAL.x + drift,
          h.surfaceY + STEAM_LOCAL.y + rise,
          h.worldZ + STEAM_LOCAL.z
        );
        steamMesh.setMatrixAt(steamPuff, tempMatrix);
        tempColor.copy(steamMaterial.color).multiplyScalar(fade);
        steamMesh.setColorAt(steamPuff, tempColor);
        steamPuff += 1;
      }

      // Beacon pulse on the dome finial — a soft brass flash that reads
      // as "the tally just incremented."
      const beaconPhase = ((nowMs + phase) % BEACON_CYCLE_MS) / BEACON_CYCLE_MS;
      const pulse = 0.35 + 0.65 * Math.max(0, Math.sin(beaconPhase * Math.PI * 2));
      const beaconScale = 0.7 + pulse * 0.6;
      tempMatrix.makeScale(beaconScale, beaconScale, beaconScale);
      tempMatrix.setPosition(
        h.worldX + BEACON_LOCAL.x,
        h.surfaceY + BEACON_LOCAL.y,
        h.worldZ + BEACON_LOCAL.z
      );
      beaconMesh.setMatrixAt(i, tempMatrix);
      tempColor.copy(beaconMaterial.color).multiplyScalar(pulse);
      beaconMesh.setColorAt(i, tempColor);
    }

    bigHubMesh.count = halls.length;
    smallHubMesh.count = halls.length;
    bigTeethMesh.count = halls.length * TEETH_PER_GEAR;
    smallTeethMesh.count = halls.length * TEETH_PER_GEAR;
    steamMesh.count = steamPuff;
    beaconMesh.count = halls.length;

    bigHubMesh.instanceMatrix.needsUpdate = true;
    smallHubMesh.instanceMatrix.needsUpdate = true;
    bigTeethMesh.instanceMatrix.needsUpdate = true;
    smallTeethMesh.instanceMatrix.needsUpdate = true;
    steamMesh.instanceMatrix.needsUpdate = true;
    beaconMesh.instanceMatrix.needsUpdate = true;
    if (steamMesh.instanceColor) steamMesh.instanceColor.needsUpdate = true;
    if (beaconMesh.instanceColor) beaconMesh.instanceColor.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(bigHubMesh, smallHubMesh, bigTeethMesh, smallTeethMesh, steamMesh, beaconMesh);
    bigHubGeo.dispose();
    smallHubGeo.dispose();
    bigToothGeo.dispose();
    smallToothGeo.dispose();
    steamGeo.dispose();
    beaconGeo.dispose();
    brassMaterial.dispose();
    brassDarkMaterial.dispose();
    steamMaterial.dispose();
    beaconMaterial.dispose();
  };

  return { clear, addInstance, commit, update, dispose };
};
