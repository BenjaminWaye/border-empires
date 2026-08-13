// 3D Umbrite Weapons Factory overlay — a heavy military-industrial complex
// that processes volatile Umbrite into ordnance. A dark-iron central hall
// with riveted plating and angled buttresses houses a tall central Umbrite
// reactor: a steel cylinder with brass bands and a cone cap whose ember
// inspection window shows the dark violet-black core inside, leaking narrow
// orange fissures. Twin brass-banded smokestacks vent the rear, chunky pipes
// with coupling joints run from the reactor to a mechanical press (base,
// vertical arm, hammer) and a small production platform carrying standing
// ammunition shells, plus a storage tank, magazines and crates on the other
// flank. Raw Umbrite lumps sit at the reactor foot, reusing the deposit
// palette. Reads at gameplay distance as reactor + industrial machinery +
// ammunition = Umbrite weapons production.

import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  Scene,
  TorusGeometry,
  Vector3
} from "three";

export type UmbriteWeaponsFactoryOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number) => void;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createUmbriteWeaponsFactoryOverlay = (scene: Scene, maxTiles: number): UmbriteWeaponsFactoryOverlay => {
  const C = maxTiles;
  const PI_2 = Math.PI / 2;
  // Reactor-core pulse rate — a slow beat (several seconds per cycle) so the
  // ember glow reads as contained power rather than a flickering light.
  const PULSE_SPEED = 0.001;

  // ─── Materials (shared by piece type) ───────────────────────────────
  // Dark gunmetal iron — the dominant structural material.
  const ironMaterial = new MeshStandardMaterial({
    color: "#2b2d33",
    roughness: 0.5,
    metalness: 0.55,
    flatShading: true
  });
  // Charcoal steel — plating, roof and reactor shell.
  const steelMaterial = new MeshStandardMaterial({
    color: "#191a1e",
    roughness: 0.62,
    metalness: 0.5,
    flatShading: true
  });
  // Weathered brass — bands, couplings, mechanical joints.
  const brassMaterial = new MeshStandardMaterial({
    color: "#7d6a41",
    roughness: 0.42,
    metalness: 0.85,
    flatShading: true
  });
  // Muted grey metal — loading platforms, crates, anvil.
  const mechMaterial = new MeshStandardMaterial({
    color: "#46413a",
    roughness: 0.75,
    metalness: 0.3,
    flatShading: true
  });
  // Umbrite matches the deposit overlay so the factory and the mineral agree.
  const bodyMaterial = new MeshStandardMaterial({
    color: "#0b0911",
    roughness: 0.42,
    metalness: 0.45,
    flatShading: true,
    emissive: "#251a4e",
    emissiveIntensity: 0.36
  });
  const sheenMaterial = new MeshStandardMaterial({
    color: "#171125",
    roughness: 0.16,
    metalness: 0.8,
    flatShading: true,
    emissive: "#472a96",
    emissiveIntensity: 0.44
  });
  // Ember-orange energy under containment — reads as heat, not magic.
  const fissureMaterial = new MeshStandardMaterial({
    color: "#331304",
    roughness: 0.5,
    metalness: 0.1,
    flatShading: true,
    emissive: "#ff7720",
    emissiveIntensity: 2.6
  });
  const emberMaterial = new MeshStandardMaterial({
    color: "#260d05",
    roughness: 0.5,
    metalness: 0.1,
    flatShading: true,
    emissive: "#ff9434",
    emissiveIntensity: 2.0
  });

  // ─── Geometries (shared) ────────────────────────────────────────────
  const foundationGeo = new BoxGeometry(0.72, 0.1, 0.56);
  const platingGeo = new BoxGeometry(0.58, 0.025, 0.44);
  const rivetGeo = new BoxGeometry(0.014, 0.008, 0.014);
  const hallGeo = new BoxGeometry(0.5, 0.22, 0.3);
  const hallRoofGeo = new BoxGeometry(0.54, 0.04, 0.34);
  const buttressGeo = new CylinderGeometry(0.02, 0.02, 1, 6);
  const stackGeo = new CylinderGeometry(0.035, 0.035, 0.3, 10);
  const stackCapGeo = new ConeGeometry(0.04, 0.05, 8);
  const stackBandGeo = new TorusGeometry(0.038, 0.009, 6, 10);
  const reactorShellGeo = new CylinderGeometry(0.078, 0.078, 0.4, 12);
  const reactorBandGeo = new TorusGeometry(0.082, 0.011, 6, 12);
  const reactorCapGeo = new ConeGeometry(0.085, 0.06, 12);
  const reactorCoreGeo = new OctahedronGeometry(0.05, 0);
  const reactorWindowGeo = new BoxGeometry(0.04, 0.12, 0.02);
  const coreFissureGeo = new BoxGeometry(0.018, 0.03, 0.012);
  const pipeGeo = new CylinderGeometry(0.026, 0.026, 1, 8);
  const pipeJointGeo = new TorusGeometry(0.028, 0.011, 6, 10);
  const pipeValveGeo = new CylinderGeometry(0.018, 0.018, 0.05, 6);
  const platformGeo = new BoxGeometry(0.2, 0.05, 0.12);
  const anvilGeo = new BoxGeometry(0.07, 0.05, 0.05);
  const pressBaseGeo = new BoxGeometry(0.08, 0.08, 0.07);
  const pressArmGeo = new CylinderGeometry(0.02, 0.02, 0.18, 6);
  const pressHeadGeo = new BoxGeometry(0.08, 0.03, 0.08);
  const hammerGeo = new BoxGeometry(0.05, 0.05, 0.05);
  const rackPostGeo = new CylinderGeometry(0.008, 0.008, 0.16, 6);
  const rackRailGeo = new BoxGeometry(0.1, 0.012, 0.012);
  const shellGeo = new CylinderGeometry(0.02, 0.02, 0.12, 8);
  const shellTipGeo = new ConeGeometry(0.022, 0.04, 8);
  const tankGeo = new CylinderGeometry(0.05, 0.05, 0.16, 10);
  const tankBandGeo = new TorusGeometry(0.052, 0.009, 6, 10);
  const magazineGeo = new CylinderGeometry(0.03, 0.03, 0.12, 8);
  const crateGeo = new BoxGeometry(0.06, 0.05, 0.06);
  const missileGeo = new CylinderGeometry(0.018, 0.018, 0.12, 8);
  const missileTipGeo = new ConeGeometry(0.02, 0.04, 8);
  const veinBodyGeo = new IcosahedronGeometry(0.16, 0);
  const emberGeo = new OctahedronGeometry(0.034, 0);

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

  make("foundation", foundationGeo, ironMaterial, C);
  make("plating", platingGeo, steelMaterial, C);
  make("rivet", rivetGeo, mechMaterial, C * 4);
  make("hall", hallGeo, ironMaterial, C);
  make("hallRoof", hallRoofGeo, steelMaterial, C);
  make("buttress", buttressGeo, steelMaterial, C * 2);
  make("stack", stackGeo, ironMaterial, C * 2);
  make("stackCap", stackCapGeo, steelMaterial, C * 2);
  make("stackBand", stackBandGeo, brassMaterial, C * 2);
  make("reactorShell", reactorShellGeo, steelMaterial, C);
  make("reactorBand", reactorBandGeo, brassMaterial, C * 2);
  make("reactorCap", reactorCapGeo, steelMaterial, C);
  make("reactorCore", reactorCoreGeo, bodyMaterial, C);
  make("reactorWindow", reactorWindowGeo, fissureMaterial, C);
  make("coreFissure", coreFissureGeo, fissureMaterial, C * 2);
  make("pipe", pipeGeo, ironMaterial, C * 3);
  make("pipeJoint", pipeJointGeo, brassMaterial, C * 6);
  make("pipeValve", pipeValveGeo, mechMaterial, C);
  make("platform", platformGeo, mechMaterial, C);
  make("anvil", anvilGeo, steelMaterial, C);
  make("pressBase", pressBaseGeo, ironMaterial, C);
  make("pressArm", pressArmGeo, brassMaterial, C);
  make("pressHead", pressHeadGeo, steelMaterial, C);
  make("hammer", hammerGeo, steelMaterial, C);
  make("rackPost", rackPostGeo, steelMaterial, C * 2);
  make("rackRail", rackRailGeo, ironMaterial, C);
  make("shell", shellGeo, steelMaterial, C * 2);
  make("shellTip", shellTipGeo, steelMaterial, C * 2);
  make("tank", tankGeo, ironMaterial, C);
  make("tankBand", tankBandGeo, brassMaterial, C * 2);
  make("magazine", magazineGeo, mechMaterial, C);
  make("crate", crateGeo, mechMaterial, C);
  make("missile", missileGeo, steelMaterial, C * 2);
  make("missileTip", missileTipGeo, steelMaterial, C * 2);
  make("veinBody", veinBodyGeo, bodyMaterial, C * 2);
  make("veinSheen", veinBodyGeo, sheenMaterial, C);
  make("ember", emberGeo, emberMaterial, C * 2);

  // ─── Helpers ────────────────────────────────────────────────────────
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const identityQuat = new Quaternion();
  const tmpEuler = new Euler();
  const tmpQuat = new Quaternion();

  // Overall factory model is scaled down 25% from its original design size.
  const FACTORY_SCALE = 0.75;

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
    position.set(wx + ox * FACTORY_SCALE, sy + oy * FACTORY_SCALE, wz + oz * FACTORY_SCALE);
    scale.set(sx * FACTORY_SCALE, sy2 * FACTORY_SCALE, sz * FACTORY_SCALE);
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

  // ─── Factory placement ──────────────────────────────────────────────
  const addFactory = (wx: number, sy: number, wz: number): void => {
    // Heavy reinforced base + top plating with corner rivets.
    addPiece("foundation", wx, sy, wz, 0, 0.05, 0);
    addPiece("plating", wx, sy, wz, 0, 0.1125, 0);
    addPiece("rivet", wx, sy, wz, -0.26, 0.135, 0.2);
    addPiece("rivet", wx, sy, wz, 0.26, 0.135, 0.2);
    addPiece("rivet", wx, sy, wz, -0.26, 0.135, -0.2);
    addPiece("rivet", wx, sy, wz, 0.26, 0.135, -0.2);

    // Central dark-iron hall with overhanging roof and angled buttresses.
    addPiece("hall", wx, sy, wz, 0, 0.245, -0.04);
    addPiece("hallRoof", wx, sy, wz, 0, 0.375, -0.04);
    addPiece("buttress", wx, sy, wz, 0.24, 0.16, 0.04, 1, 1, 0.16, 0, 0, -0.7854);
    addPiece("buttress", wx, sy, wz, -0.24, 0.16, 0.04, 1, 1, 0.16, 0, 0, 0.7854);

    // Twin brass-banded smokestacks on the rear roof.
    addPiece("stack", wx, sy, wz, -0.15, 0.55, -0.17);
    addPiece("stackCap", wx, sy, wz, -0.15, 0.75, -0.17);
    addPiece("stackBand", wx, sy, wz, -0.15, 0.5, -0.17, 1, 1, 1, 0, PI_2, 0);
    addPiece("stack", wx, sy, wz, 0.15, 0.55, -0.17);
    addPiece("stackCap", wx, sy, wz, 0.15, 0.75, -0.17);
    addPiece("stackBand", wx, sy, wz, 0.15, 0.5, -0.17, 1, 1, 1, 0, PI_2, 0);

    // Tall central Umbrite reactor: steel shell, brass bands, cone cap,
    // ember inspection window revealing the violet-black core.
    addPiece("reactorShell", wx, sy, wz, 0, 0.33, 0);
    addPiece("reactorBand", wx, sy, wz, 0, 0.21, 0, 1, 1, 1, 0, PI_2, 0);
    addPiece("reactorBand", wx, sy, wz, 0, 0.45, 0, 1, 1, 1, 0, PI_2, 0);
    addPiece("reactorCap", wx, sy, wz, 0, 0.58, 0);
    addPiece("reactorCore", wx, sy, wz, 0, 0.33, 0.03);
    addPiece("reactorWindow", wx, sy, wz, 0, 0.33, 0.078);
    addPiece("coreFissure", wx, sy, wz, 0.06, 0.24, 0.055, 1, 1, 1, 0, 0.4, 0);
    addPiece("coreFissure", wx, sy, wz, -0.06, 0.46, 0.055, 1, 1, 1, 0, -0.4, 0);

    // Chunky pipes with coupling joints: reactor to the press, reactor to
    // the storage flank, and a cross-pipe between the smokestacks.
    addPiece("pipe", wx, sy, wz, -0.16, 0.24, 0.14, 1, 1, 0.3, 0, 0, PI_2);
    addPiece("pipeJoint", wx, sy, wz, -0.02, 0.24, 0.14, 1, 1, 1, 0, PI_2, 0);
    addPiece("pipeJoint", wx, sy, wz, -0.3, 0.24, 0.14, 1, 1, 1, 0, PI_2, 0);
    addPiece("pipeValve", wx, sy, wz, -0.16, 0.29, 0.14);
    addPiece("pipe", wx, sy, wz, 0.1, 0.26, 0.08, 1, 1, 0.16, 0, PI_2, 0);
    addPiece("pipeJoint", wx, sy, wz, 0.1, 0.26, 0.0);
    addPiece("pipeJoint", wx, sy, wz, 0.1, 0.26, 0.16);
    addPiece("pipe", wx, sy, wz, 0, 0.46, -0.17, 1, 1, 0.28, 0, 0, PI_2);
    addPiece("pipeJoint", wx, sy, wz, -0.14, 0.46, -0.17, 1, 1, 1, 0, PI_2, 0);
    addPiece("pipeJoint", wx, sy, wz, 0.14, 0.46, -0.17, 1, 1, 1, 0, PI_2, 0);

    // Weapons-production platform: loading deck, anvil, and the mechanical
    // press (housing, vertical brass arm, head, hammer) forging ordnance.
    addPiece("platform", wx, sy, wz, -0.3, 0.15, 0.18);
    addPiece("anvil", wx, sy, wz, -0.3, 0.225, 0.18);
    addPiece("pressBase", wx, sy, wz, -0.41, 0.19, 0.18);
    addPiece("pressArm", wx, sy, wz, -0.41, 0.34, 0.18);
    addPiece("pressHead", wx, sy, wz, -0.41, 0.43, 0.18);
    addPiece("hammer", wx, sy, wz, -0.41, 0.28, 0.18);

    // Ammunition rack with standing shells.
    addPiece("rackPost", wx, sy, wz, -0.2, 0.24, 0.2);
    addPiece("rackPost", wx, sy, wz, -0.12, 0.24, 0.22);
    addPiece("rackRail", wx, sy, wz, -0.16, 0.32, 0.21);
    addPiece("shell", wx, sy, wz, -0.16, 0.19, 0.2);
    addPiece("shellTip", wx, sy, wz, -0.16, 0.27, 0.2);
    addPiece("shell", wx, sy, wz, -0.12, 0.17, 0.24);
    addPiece("shellTip", wx, sy, wz, -0.12, 0.25, 0.24);

    // Missile-like ordnance waiting at the hall front.
    addPiece("missile", wx, sy, wz, -0.26, 0.19, 0.05);
    addPiece("missileTip", wx, sy, wz, -0.26, 0.27, 0.05);
    addPiece("missile", wx, sy, wz, -0.22, 0.16, -0.02);
    addPiece("missileTip", wx, sy, wz, -0.22, 0.24, -0.02);

    // Storage flank: horizontal tank with brass bands, vertical magazine,
    // and ammunition crates.
    addPiece("tank", wx, sy, wz, 0.28, 0.17, 0.1, 1, 1, 1, 0, PI_2, 0);
    addPiece("tankBand", wx, sy, wz, 0.28, 0.17, 0.07);
    addPiece("tankBand", wx, sy, wz, 0.28, 0.17, 0.13);
    addPiece("magazine", wx, sy, wz, 0.2, 0.19, 0.16);
    addPiece("crate", wx, sy, wz, 0.24, 0.15, 0.03);

    // Raw Umbrite at the reactor foot, reusing the deposit palette.
    addPiece("veinBody", wx, sy, wz, 0.09, 0.15, 0.06, 0.35, 0.35, 0.35, 0.4);
    addPiece("veinBody", wx, sy, wz, -0.05, 0.14, 0.1, 0.3, 0.3, 0.3, 1.9);
    addPiece("veinSheen", wx, sy, wz, 0.13, 0.13, 0.08, 0.26, 0.26, 0.26, 3.1);
    addPiece("ember", wx, sy, wz, 0.09, 0.17, 0.05, 0.5, 0.5, 0.5);
    addPiece("ember", wx, sy, wz, -0.05, 0.16, 0.09, 0.4, 0.4, 0.4);
  };

  // ─── Reactor-core pulse animation ────────────────────────────────────
  // The emissive materials are shared across factories, so the pulse can't
  // vary per instance — instead the core, fissure and ember pieces breathe by
  // scaling about their resting size. Offsets/scales mirror exactly what
  // addPiece wrote (FACTORY_SCALE applied), and slotIndex addresses the piece
  // within its per-factory slot run (reactorCore = 1, coreFissure/ember = 2).
  type PulsePiece = {
    readonly key: string;
    readonly perKey: number;
    readonly slotIndex: number;
    readonly ox: number;
    readonly oy: number;
    readonly oz: number;
    readonly sx: number;
    readonly sy: number;
    readonly sz: number;
    readonly rotX: number;
    readonly rotY: number;
    readonly rotZ: number;
    readonly amp: number;
  };
  const FS = FACTORY_SCALE;
  const pulsePieces: readonly PulsePiece[] = [
    { key: "reactorCore", perKey: 1, slotIndex: 0, ox: 0, oy: 0.33 * FS, oz: 0.03 * FS, sx: FS, sy: FS, sz: FS, rotX: 0, rotY: 0, rotZ: 0, amp: 0.15 },
    { key: "coreFissure", perKey: 2, slotIndex: 0, ox: 0.06 * FS, oy: 0.24 * FS, oz: 0.055 * FS, sx: FS, sy: FS, sz: FS, rotX: 0.4, rotY: 0, rotZ: 0, amp: 0.25 },
    { key: "coreFissure", perKey: 2, slotIndex: 1, ox: -0.06 * FS, oy: 0.46 * FS, oz: 0.055 * FS, sx: FS, sy: FS, sz: FS, rotX: -0.4, rotY: 0, rotZ: 0, amp: 0.25 },
    { key: "ember", perKey: 2, slotIndex: 0, ox: 0.09 * FS, oy: 0.17 * FS, oz: 0.05 * FS, sx: 0.5 * FS, sy: 0.5 * FS, sz: 0.5 * FS, rotX: 0, rotY: 0, rotZ: 0, amp: 0.3 },
    { key: "ember", perKey: 2, slotIndex: 1, ox: -0.05 * FS, oy: 0.16 * FS, oz: 0.09 * FS, sx: 0.4 * FS, sy: 0.4 * FS, sz: 0.4 * FS, rotX: 0, rotY: 0, rotZ: 0, amp: 0.3 }
  ];
  type FactoryRecord = { readonly x: number; readonly y: number; readonly z: number; readonly phase: number };
  const records: FactoryRecord[] = [];

  // ─── Public API ─────────────────────────────────────────────────────
  const clear = (): void => {
    for (const slot of slots.values()) slot.count = 0;
    records.length = 0;
  };

  const addInstance = (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number): void => {
    // The pulse slots are capped at C factories (1 core, 2 fissures, 2 embers
    // per factory); drop factories beyond that up front so `records` and the
    // piece buffers stay in lockstep (same trick as the relay beacon).
    if (records.length >= C) return;
    const hash = ((worldTileX * 92_821) ^ (worldTileY * 68_917)) >>> 0;
    const phase = ((hash % 1000) / 1000) * Math.PI * 2;
    records.push({ x: sceneX, y: surfaceY, z: sceneZ, phase });
    addFactory(sceneX, surfaceY, sceneZ);
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
    const count = records.length;
    if (count === 0) return;
    for (let i = 0; i < count; i += 1) {
      const rec = records[i]!;
      const pulse = Math.sin(nowMs * PULSE_SPEED + rec.phase);
      for (const piece of pulsePieces) {
        const slot = slots.get(piece.key);
        if (!slot) continue;
        const breathe = 1 + piece.amp * pulse;
        position.set(rec.x + piece.ox, rec.y + piece.oy, rec.z + piece.oz);
        scale.set(piece.sx * breathe, piece.sy * breathe, piece.sz * breathe);
        if (piece.rotX === 0 && piece.rotY === 0 && piece.rotZ === 0) {
          matrix.compose(position, identityQuat, scale);
        } else {
          tmpEuler.set(piece.rotX, piece.rotY, piece.rotZ, "XYZ");
          tmpQuat.setFromEuler(tmpEuler);
          matrix.compose(position, tmpQuat, scale);
        }
        slot.mesh.setMatrixAt(i * piece.perKey + piece.slotIndex, matrix);
      }
    }
    // Partial re-upload of just the breathing slots' used prefixes.
    for (const key of ["reactorCore", "coreFissure", "ember"]) {
      const slot = slots.get(key);
      if (!slot || slot.count === 0) continue;
      slot.mesh.instanceMatrix.clearUpdateRanges();
      slot.mesh.instanceMatrix.addUpdateRange(0, slot.count * 16);
      slot.mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    for (const slot of slots.values()) scene.remove(slot.mesh);
    [
      foundationGeo, platingGeo, rivetGeo, hallGeo, hallRoofGeo, buttressGeo,
      stackGeo, stackCapGeo, stackBandGeo, reactorShellGeo, reactorBandGeo,
      reactorCapGeo, reactorCoreGeo, reactorWindowGeo, coreFissureGeo, pipeGeo,
      pipeJointGeo, pipeValveGeo, platformGeo, anvilGeo, pressBaseGeo, pressArmGeo,
      pressHeadGeo, hammerGeo, rackPostGeo, rackRailGeo, shellGeo, shellTipGeo,
      tankGeo, tankBandGeo, magazineGeo, crateGeo, missileGeo, missileTipGeo,
      veinBodyGeo, emberGeo
    ].forEach((g) => g.dispose());
    [
      ironMaterial, steelMaterial, brassMaterial, mechMaterial, bodyMaterial,
      sheenMaterial, fissureMaterial, emberMaterial
    ].forEach((m) => m.dispose());
  };

  return { clear, addInstance, commit, update, dispose };
};
