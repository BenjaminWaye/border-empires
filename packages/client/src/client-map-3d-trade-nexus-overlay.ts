// 3D Trade Nexus overlay — a grand commercial hub where trade routes
// converge. A paved plaza ringed by six outgoing roads supports an
// octagonal stone plinth; an ornate trading hall with a brass dome
// rises at the centre, its portico ringed by columns and warm amber
// windows. Merchants' warehouses, a freight yard, brass jib cranes,
// pipes and hanging trade lamps crowd the plaza, while a large brass
// clockwork seal — a rotating spoke-and-gear financial apparatus —
// crowns the dome. Polished brass, dark iron, muted stone and amber
// aether lighting; no fortifications, cannons or military equipment.
// Call commit() after adding instances, then update(nowMs) each frame
// to wind the clockwork seal.

import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Euler,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3
} from "three";

export type TradeNexusOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number) => void;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

const PI_2 = Math.PI / 2;
const SEAL_SPEED = 0.00045;
const SEAL_Y = 0.64;
const SEAL_RADIUS = 0.085;
const SEAL_SPOKES = 4;
const GEARS_PER_SEAL = 4;

// The clockwork-seal pieces (spokes + exchange gears) are the only
// animated parts. Each stores its offset from the seal hub and the yaw
// it has when the seal angle is 0, so the whole apparatus winds as one
// rotating group around the dome apex.
type SealPiece = {
  readonly key: "sealSpoke" | "sealGear";
  readonly slotIndex: number;
  readonly lx: number;
  readonly ly: number;
  readonly lz: number;
  readonly baseYaw: number;
  readonly rotX: number;
  readonly rotZ: number;
};

const buildSealPieces = (): SealPiece[] => {
  const pieces: SealPiece[] = [];
  for (let i = 0; i < SEAL_SPOKES; i += 1) {
    const baseA = (i * Math.PI) / SEAL_SPOKES + Math.PI / 4;
    pieces.push({
      key: "sealSpoke",
      slotIndex: i,
      lx: Math.cos(baseA) * 0.045,
      ly: 0,
      lz: Math.sin(baseA) * 0.045,
      baseYaw: baseA + PI_2,
      rotX: 0,
      rotZ: 0
    });
    pieces.push({
      key: "sealGear",
      slotIndex: i,
      lx: Math.cos(baseA) * SEAL_RADIUS,
      ly: 0,
      lz: Math.sin(baseA) * SEAL_RADIUS,
      baseYaw: baseA + PI_2,
      rotX: 0,
      rotZ: 0
    });
  }
  return pieces;
};

const sealPieces = buildSealPieces();

type TradeNexusInstance = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly phase: number;
};

const makeMat = (color: string, roughness: number, metalness: number, emissive?: { color: string; intensity: number }): MeshStandardMaterial => {
  if (emissive === undefined) return new MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
  return new MeshStandardMaterial({ color, roughness, metalness, flatShading: true, emissive: emissive.color, emissiveIntensity: emissive.intensity });
};

export const createTradeNexusOverlay = (scene: Scene, maxTiles: number): TradeNexusOverlay => {
  const C = maxTiles;

  // ─── Materials (shared by piece type) ───────────────────────────────
  const plazaMaterial = makeMat("#6b6152", 0.92, 0.05);
  const roadMaterial = makeMat("#3c3a38", 0.85, 0.12);
  const stoneMaterial = makeMat("#a99b84", 0.9, 0);
  const stoneDarkMaterial = makeMat("#827763", 0.92, 0);
  const ironMaterial = makeMat("#2c2e34", 0.55, 0.55);
  const brassMaterial = makeMat("#8a6b3c", 0.42, 0.85);
  const brassBrightMaterial = makeMat("#a5864d", 0.3, 0.92);
  const brassDarkMaterial = makeMat("#6f5a33", 0.5, 0.8);
  const mechMaterial = makeMat("#4a443c", 0.72, 0.3);
  const woodMaterial = makeMat("#5a4632", 0.82, 0);
  const woodLightMaterial = makeMat("#7a5e3a", 0.78, 0);
  const windowMaterial = makeMat("#3a2a14", 0.4, 0.1, { color: "#ff9d3d", intensity: 0.55 });
  const lampGlowMaterial = makeMat("#4a2a10", 0.4, 0.15, { color: "#ff9d3d", intensity: 1.4 });
  const aetherGlowMaterial = makeMat("#14304a", 0.3, 0.35, { color: "#5fa8d8", intensity: 1.2 });

  // ─── Geometries (shared) ────────────────────────────────────────────
  const plazaGeo = new BoxGeometry(0.84, 0.02, 0.84);
  const roadGeo = new BoxGeometry(0.46, 0.02, 0.12);
  const plinthGeo = new CylinderGeometry(0.3, 0.33, 0.1, 8);
  const drumGeo = new CylinderGeometry(0.17, 0.17, 0.24, 8);
  const columnGeo = new CylinderGeometry(0.02, 0.025, 0.26, 8);
  const domeGeo = new SphereGeometry(0.2, 10, 6);
  const domeBandGeo = new TorusGeometry(0.175, 0.012, 6, 14);
  const sealHubGeo = new CylinderGeometry(0.07, 0.07, 0.03, 12);
  const sealWheelGeo = new TorusGeometry(SEAL_RADIUS, 0.012, 6, 14);
  const sealSpokeGeo = new BoxGeometry(0.09, 0.009, 0.018);
  const sealGearGeo = new CylinderGeometry(0.02, 0.02, 0.028, 8);
  const crateGeo = new BoxGeometry(0.06, 0.06, 0.06);
  const barrelGeo = new CylinderGeometry(0.028, 0.032, 0.05, 8);
  const buildingStepGeo = new BoxGeometry(0.2, 0.025, 0.17);
  const buildingBodyGeo = new BoxGeometry(0.16, 0.14, 0.14);
  const buildingRoofGeo = new CylinderGeometry(0.098, 0.098, 0.06, 4);
  const buildingWindowGeo = new BoxGeometry(0.12, 0.035, 0.02);
  const craneBaseGeo = new CylinderGeometry(0.028, 0.032, 0.035, 6);
  const craneMastGeo = new BoxGeometry(0.024, 0.3, 0.024);
  const craneBoomGeo = new BoxGeometry(0.018, 1, 0.018);
  const craneTieGeo = new BoxGeometry(0.012, 1, 0.012);
  const craneBlockGeo = new BoxGeometry(0.026, 0.028, 0.026);
  const pipeGeo = new CylinderGeometry(0.015, 0.015, 1, 6);
  const pipeJointGeo = new TorusGeometry(0.018, 0.009, 5, 8);
  const pipeBandGeo = new TorusGeometry(0.018, 0.006, 5, 8);
  const lampPostGeo = new CylinderGeometry(0.012, 0.014, 0.18, 6);
  const lampArmGeo = new BoxGeometry(0.012, 0.012, 0.18);
  const lampHousingGeo = new CylinderGeometry(0.03, 0.026, 0.05, 8);
  const lampGlowGeo = new SphereGeometry(0.02, 8, 6);
  const lampCageGeo = new TorusGeometry(0.036, 0.005, 5, 8);
  const aetherGlowGeo = new SphereGeometry(0.016, 8, 6);

  // ─── InstancedMesh registry ────────────────────────────────────────
  type Slot = { mesh: InstancedMesh; count: number; cap: number };
  const slots = new Map<string, Slot>();

  const make = (key: string, geo: BufferGeometry, mat: MeshStandardMaterial, cap: number): Slot => {
    const mesh = new InstancedMesh(geo, mat, cap);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    const slot: Slot = { mesh, count: 0, cap };
    slots.set(key, slot);
    return slot;
  };

  make("plaza", plazaGeo, plazaMaterial, C);
  make("road", roadGeo, roadMaterial, C * 6);
  make("plinth", plinthGeo, stoneMaterial, C);
  make("drum", drumGeo, ironMaterial, C);
  make("column", columnGeo, stoneDarkMaterial, C * 6);
  make("dome", domeGeo, brassMaterial, C);
  make("domeBand", domeBandGeo, brassBrightMaterial, C);
  make("sealHub", sealHubGeo, brassBrightMaterial, C);
  make("sealWheel", sealWheelGeo, brassMaterial, C);
  make("sealSpoke", sealSpokeGeo, brassBrightMaterial, C * SEAL_SPOKES);
  make("sealGear", sealGearGeo, brassDarkMaterial, C * GEARS_PER_SEAL);
  make("crate", crateGeo, woodMaterial, C * 3);
  make("barrel", barrelGeo, woodLightMaterial, C * 2);
  make("buildingStep", buildingStepGeo, stoneDarkMaterial, C * 2);
  make("buildingBody", buildingBodyGeo, stoneMaterial, C * 2);
  make("buildingRoof", buildingRoofGeo, brassDarkMaterial, C * 2);
  make("buildingWindow", buildingWindowGeo, windowMaterial, C * 2);
  make("craneBase", craneBaseGeo, ironMaterial, C * 2);
  make("craneMast", craneMastGeo, ironMaterial, C * 2);
  make("craneBoom", craneBoomGeo, mechMaterial, C * 2);
  make("craneTie", craneTieGeo, mechMaterial, C * 2);
  make("craneBlock", craneBlockGeo, woodMaterial, C * 2);
  make("pipe", pipeGeo, brassMaterial, C * 3);
  make("pipeJoint", pipeJointGeo, brassMaterial, C * 3);
  make("pipeBand", pipeBandGeo, brassMaterial, C);
  make("lampPost", lampPostGeo, ironMaterial, C * 2);
  make("lampArm", lampArmGeo, ironMaterial, C);
  make("lampHousing", lampHousingGeo, brassMaterial, C * 3);
  make("lampGlow", lampGlowGeo, lampGlowMaterial, C * 3);
  make("lampCage", lampCageGeo, ironMaterial, C * 2);
  make("aetherGlow", aetherGlowGeo, aetherGlowMaterial, C);

  // ─── Helpers ────────────────────────────────────────────────────────
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const identityQuat = new Quaternion();
  const tmpEuler = new Euler();
  const tmpQuat = new Quaternion();
  const tmpDir = new Vector3();
  const yAxis = new Vector3(0, 1, 0);
  const zAxis = new Vector3(0, 0, 1);

  const addPiece = (
    key: string,
    wx: number,
    sy: number,
    wz: number,
    ox: number,
    oy: number,
    oz: number,
    sx = 1,
    sz = 1,
    sy2 = 1,
    rotY = 0,
    rotX = 0,
    rotZ = 0
  ): void => {
    const slot = slots.get(key);
    if (!slot || slot.count >= slot.cap) return;
    position.set(wx + ox, sy + oy, wz + oz);
    scale.set(sx, sy2, sz);
    if (rotX === 0 && rotY === 0 && rotZ === 0) {
      matrix.compose(position, identityQuat, scale);
    } else {
      tmpEuler.set(rotX, rotY, rotZ, "XYZ");
      tmpQuat.setFromEuler(tmpEuler);
      matrix.compose(position, tmpQuat, scale);
    }
    slot.mesh.setMatrixAt(slot.count, matrix);
    slot.count += 1;
  };

  const eulerFromDir = (dx: number, dy: number, dz: number): { rx: number; ry: number; rz: number } => {
    tmpDir.set(dx, dy, dz).normalize();
    tmpQuat.setFromUnitVectors(yAxis, tmpDir);
    tmpEuler.setFromQuaternion(tmpQuat);
    return { rx: tmpEuler.x, ry: tmpEuler.y, rz: tmpEuler.z };
  };

  const eulerFromDirZ = (dx: number, dy: number, dz: number): { rx: number; ry: number; rz: number } => {
    tmpDir.set(dx, dy, dz).normalize();
    tmpQuat.setFromUnitVectors(zAxis, tmpDir);
    tmpEuler.setFromQuaternion(tmpQuat);
    return { rx: tmpEuler.x, ry: tmpEuler.y, rz: tmpEuler.z };
  };

  const addPieceAlong = (key: string, wx: number, sy: number, wz: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, len: number): void => {
    const e = eulerFromDir(dx, dy, dz);
    addPiece(key, wx, sy, wz, ox, oy, oz, 1, 1, len, e.ry, e.rx, e.rz);
  };

  const addTorusAlong = (key: string, wx: number, sy: number, wz: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): void => {
    const e = eulerFromDirZ(dx, dy, dz);
    addPiece(key, wx, sy, wz, ox, oy, oz, 1, 1, 1, e.ry, e.rx, e.rz);
  };

  // ─── Nexus placement ────────────────────────────────────────────────
  const addBuilding = (wx: number, sy: number, wz: number, bx: number, bz: number, yaw: number): void => {
    addPiece("buildingStep", wx, sy, wz, bx, 0.013, bz, 1, 1, 1, yaw);
    addPiece("buildingBody", wx, sy, wz, bx, 0.1, bz, 1, 1, 1, yaw);
    // Warm window band sits proud of the facade rather than inside the body:
    // the face at yaw faces world (sin(yaw), cos(yaw)), so push the sheet
    // out along that axis and rotate it to face the approach.
    const fdx = Math.sin(yaw);
    const fdz = Math.cos(yaw);
    addPiece("buildingWindow", wx, sy, wz, bx + fdx * 0.072, 0.1, bz + fdz * 0.072, 1, 1, 1, yaw);
    addPiece("buildingRoof", wx, sy, wz, bx, 0.2, bz, 1, 1, 1, yaw + Math.PI * 0.25);
  };

  const addCrane = (wx: number, sy: number, wz: number, cx: number, cz: number, yaw: number): void => {
    addPiece("craneBase", wx, sy, wz, cx, 0.018, cz);
    addPiece("craneMast", wx, sy, wz, cx, 0.175, cz, 1, 1, 1, yaw);
    // Boom/tie geometries are unit-length along Y, so addPieceAlong's len
    // is applied along the requested direction (matching the pipe pieces).
    const boomLen = 0.2;
    const bx = Math.sin(yaw) * boomLen;
    const bz = Math.cos(yaw) * boomLen;
    addPieceAlong("craneBoom", wx, sy, wz, cx, 0.3, cz, bx, 0.45, bz, boomLen);
    addPieceAlong("craneTie", wx, sy, wz, cx, 0.3, cz, -bx * 0.5, -0.5, -bz * 0.5, 0.16);
    addPiece("craneBlock", wx, sy, wz, cx + bx * 0.72, 0.14, cz + bz * 0.72);
  };

  const addLampPost = (wx: number, sy: number, wz: number, lx: number, lz: number): void => {
    addPiece("lampPost", wx, sy, wz, lx, 0.095, lz);
    addPiece("lampHousing", wx, sy, wz, lx, 0.18, lz);
    addPiece("lampGlow", wx, sy, wz, lx, 0.182, lz);
    addPiece("lampCage", wx, sy, wz, lx, 0.18, lz, 1, 1, 1, 0, PI_2, 0);
  };

  const addNexus = (wx: number, sy: number, wz: number): void => {
    addPiece("plaza", wx, sy, wz, 0, 0.015, 0);
    for (let r = 0; r < 6; r += 1) {
      const ang = (r * Math.PI) / 3;
      addPiece("road", wx, sy, wz, Math.cos(ang) * 0.19, 0.035, Math.sin(ang) * 0.19, 1, 1, 1, ang);
    }

    addPiece("plinth", wx, sy, wz, 0, 0.05, 0);
    addPiece("drum", wx, sy, wz, 0, 0.22, 0);
    for (let c = 0; c < 6; c += 1) {
      const ang = (c * Math.PI) / 3 + Math.PI / 6;
      addPiece("column", wx, sy, wz, Math.cos(ang) * 0.195, 0.23, Math.sin(ang) * 0.195);
    }
    addPiece("dome", wx, sy, wz, 0, 0.48, 0, 1, 1, 0.7);
    addPiece("domeBand", wx, sy, wz, 0, 0.345, 0, 1, 1, 1, 0, PI_2, 0);

    addPiece("sealHub", wx, sy, wz, 0, SEAL_Y, 0);
    addPiece("sealWheel", wx, sy, wz, 0, SEAL_Y + 0.004, 0, 1, 1, 1, 0, PI_2, 0);
    for (const piece of sealPieces) {
      addPiece(piece.key, wx, sy, wz, piece.lx, SEAL_Y + piece.ly, piece.lz, 1, 1, 1, piece.baseYaw, piece.rotX, piece.rotZ);
    }

    addBuilding(wx, sy, wz, -0.28, 0.2, Math.PI * 0.5);
    addBuilding(wx, sy, wz, 0.3, 0.06, 0);
    addPiece("crate", wx, sy, wz, -0.13, 0.035, -0.16);
    addPiece("crate", wx, sy, wz, -0.095, 0.095, -0.16);
    addPiece("crate", wx, sy, wz, 0.1, 0.035, -0.14);
    addPiece("barrel", wx, sy, wz, 0.16, 0.028, -0.2);
    addPiece("barrel", wx, sy, wz, 0.21, 0.028, -0.14);

    addCrane(wx, sy, wz, -0.17, -0.32, -Math.PI * 0.9);
    addCrane(wx, sy, wz, 0.32, -0.2, -0.25);

    addPieceAlong("pipe", wx, sy, wz, -0.22, 0.045, 0.2, 0, 0, -0.4, 0.4);
    addPieceAlong("pipe", wx, sy, wz, 0.24, 0.045, -0.2, 0, 0, 0.3, 0.3);
    addPieceAlong("pipe", wx, sy, wz, -0.05, 0.045, -0.38, 0.36, 0, 0, 0.36);
    addTorusAlong("pipeJoint", wx, sy, wz, -0.22, 0.045, 0.0, 0, 0, -1);
    addTorusAlong("pipeJoint", wx, sy, wz, 0.12, 0.045, -0.2, 0, 0, 1);
    addTorusAlong("pipeJoint", wx, sy, wz, 0.13, 0.045, -0.38, 0.36, 0, 0);
    addPiece("pipeBand", wx, sy, wz, -0.06, 0.045, 0.12, 1, 1, 1, 0, PI_2, 0);

    addPiece("lampArm", wx, sy, wz, 0, 0.44, -0.235);
    addPiece("lampHousing", wx, sy, wz, 0, 0.42, -0.3);
    addPiece("lampGlow", wx, sy, wz, 0, 0.422, -0.3);
    addLampPost(wx, sy, wz, -0.3, -0.3);
    addLampPost(wx, sy, wz, 0.3, -0.3);

    addPiece("aetherGlow", wx, sy, wz, 0, 0.67, 0);
  };

  const instances: TradeNexusInstance[] = [];

  // ─── Public API ─────────────────────────────────────────────────────
  const clear = (): void => {
    for (const slot of slots.values()) slot.count = 0;
    instances.length = 0;
  };

  const addInstance = (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number): void => {
    // The seal spoke/gear buffers are per-nexus indexed: instances beyond
    // C would write past their InstancedMesh typed arrays in update().
    if (instances.length >= C) return;
    const hash = ((worldTileX * 92_821) ^ (worldTileY * 68_917)) >>> 0;
    const phase = ((hash % 1000) / 1000) * Math.PI * 2;
    instances.push({ x: sceneX, y: surfaceY, z: sceneZ, phase });
    addNexus(sceneX, surfaceY, sceneZ);
  };

  const commit = (): void => {
    for (const slot of slots.values()) {
      const { mesh, count } = slot;
      mesh.count = count;
      if (count === 0) continue;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const update = (nowMs: number): void => {
    const count = instances.length;
    if (count === 0) return;
    const spokeSlot = slots.get("sealSpoke");
    const gearSlot = slots.get("sealGear");
    for (let i = 0; i < count; i += 1) {
      const t = instances[i]!;
      const angle = nowMs * SEAL_SPEED + t.phase;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const baseY = t.y + SEAL_Y;
      for (const piece of sealPieces) {
        const slot = piece.key === "sealSpoke" ? spokeSlot : gearSlot;
        if (!slot) continue;
        const wx = t.x + piece.lx * cosA - piece.lz * sinA;
        const wz = t.z + piece.lx * sinA + piece.lz * cosA;
        position.set(wx, baseY + piece.ly, wz);
        scale.set(1, 1, 1);
        tmpEuler.set(piece.rotX, piece.baseYaw + angle, piece.rotZ, "XYZ");
        tmpQuat.setFromEuler(tmpEuler);
        matrix.compose(position, tmpQuat, scale);
        const perKey = piece.key === "sealSpoke" ? SEAL_SPOKES : GEARS_PER_SEAL;
        slot.mesh.setMatrixAt(i * perKey + piece.slotIndex, matrix);
      }
    }
    if (spokeSlot && spokeSlot.count > 0) {
      spokeSlot.mesh.instanceMatrix.clearUpdateRanges();
      spokeSlot.mesh.instanceMatrix.addUpdateRange(0, spokeSlot.count * 16);
      spokeSlot.mesh.instanceMatrix.needsUpdate = true;
    }
    if (gearSlot && gearSlot.count > 0) {
      gearSlot.mesh.instanceMatrix.clearUpdateRanges();
      gearSlot.mesh.instanceMatrix.addUpdateRange(0, gearSlot.count * 16);
      gearSlot.mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    for (const slot of slots.values()) scene.remove(slot.mesh);
    [
      plazaGeo, roadGeo, plinthGeo, drumGeo, columnGeo, domeGeo, domeBandGeo,
      sealHubGeo, sealWheelGeo, sealSpokeGeo,
      sealGearGeo, crateGeo, barrelGeo, buildingStepGeo, buildingBodyGeo,
      buildingRoofGeo, buildingWindowGeo, craneBaseGeo,
      craneMastGeo, craneBoomGeo, craneTieGeo, craneBlockGeo, pipeGeo,
      pipeJointGeo, pipeBandGeo, lampPostGeo, lampArmGeo, lampHousingGeo,
      lampGlowGeo, lampCageGeo, aetherGlowGeo
    ].forEach((g) => g.dispose());
    [
      plazaMaterial, roadMaterial, stoneMaterial, stoneDarkMaterial, ironMaterial,
      brassMaterial, brassBrightMaterial, brassDarkMaterial, mechMaterial,
      woodMaterial, woodLightMaterial, windowMaterial, lampGlowMaterial,
      aetherGlowMaterial
    ].forEach((m) => m.dispose());
  };

  return { clear, addInstance, commit, update, dispose };
};