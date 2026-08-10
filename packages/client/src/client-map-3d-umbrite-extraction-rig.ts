// 3D Umbrite Extraction Rig overlay — a squat, heavily reinforced imperial
// drilling platform that sinks a rotating iron auger into an exposed Umbrite
// vein and bleeds the volatile mineral straight into a riveted containment
// tank. Dark gunmetal base with a charcoal steel deck and heavy anchor feet,
// a vertical brass-ringed drilling column braced by three angled brass
// struts, and a containment collar around the drill head with restrained
// orange seams. Chunky iron pipes (with brass coupling rings) run from the
// extraction point into a horizontal pressure vessel whose inspection window
// shows a faint ember glow. The exposed vein reuses the Umbrite deposit
// palette: deep violet-black mineral, violet sheen, broken purple-black
// faces and sparse orange fissures. Reads at gameplay distance as heavy
// drill + pipes + pressure vessel = Umbrite extraction.

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

export type UmbriteExtractionRigOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createUmbriteExtractionRigOverlay = (scene: Scene, maxTiles: number): UmbriteExtractionRigOverlay => {
  const C = maxTiles;
  const PI_2 = Math.PI / 2;

  // ─── Materials (shared by piece type) ───────────────────────────────
  const ironMaterial = new MeshStandardMaterial({
    color: "#2b2d33",
    roughness: 0.5,
    metalness: 0.55,
    flatShading: true
  });
  const steelMaterial = new MeshStandardMaterial({
    color: "#191a1e",
    roughness: 0.62,
    metalness: 0.5,
    flatShading: true
  });
  const brassMaterial = new MeshStandardMaterial({
    color: "#7d6a41",
    roughness: 0.42,
    metalness: 0.85,
    flatShading: true
  });
  const mechMaterial = new MeshStandardMaterial({
    color: "#46413a",
    roughness: 0.75,
    metalness: 0.3,
    flatShading: true
  });
  // Umbrite matches the deposit overlay so the rig and the mineral agree.
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
  const brokenMaterial = new MeshStandardMaterial({
    color: "#27143f",
    roughness: 0.3,
    metalness: 0.72,
    flatShading: true,
    emissive: "#55268c",
    emissiveIntensity: 0.42
  });
  // Restrained orange energy under containment — reads as heat, not magic.
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
  const deckGeo = new BoxGeometry(0.8, 0.1, 0.62);
  const plateGeo = new BoxGeometry(0.66, 0.03, 0.48);
  const footGeo = new BoxGeometry(0.12, 0.05, 0.12);
  const spikeGeo = new ConeGeometry(0.03, 0.08, 6);
  const columnLowGeo = new CylinderGeometry(0.058, 0.072, 0.3, 10);
  const ringBigGeo = new TorusGeometry(0.068, 0.012, 6, 12);
  const columnUpGeo = new CylinderGeometry(0.048, 0.048, 0.13, 10);
  const ringSmallGeo = new TorusGeometry(0.057, 0.01, 6, 10);
  const headGeo = new BoxGeometry(0.14, 0.07, 0.14);
  const strutGeo = new CylinderGeometry(0.02, 0.02, 1, 6);
  const collarGeo = new CylinderGeometry(0.085, 0.095, 0.09, 10);
  const collarRingGeo = new TorusGeometry(0.087, 0.012, 6, 12);
  const ventGeo = new BoxGeometry(0.02, 0.035, 0.014);
  const drillGeo = new CylinderGeometry(0.028, 0.05, 0.16, 8);
  const drillBandGeo = new TorusGeometry(0.042, 0.009, 6, 10);
  const augerGeo = new ConeGeometry(0.05, 0.12, 8);
  const tipGeo = new ConeGeometry(0.024, 0.06, 6);
  const tankGeo = new CylinderGeometry(0.095, 0.095, 0.36, 12);
  const tankBandGeo = new TorusGeometry(0.1, 0.013, 6, 12);
  const tankCapGeo = new CylinderGeometry(0.1, 0.1, 0.02, 12);
  const tankValveGeo = new CylinderGeometry(0.022, 0.022, 0.05, 6);
  const valveWheelGeo = new BoxGeometry(0.05, 0.012, 0.05);
  const windowGeo = new CylinderGeometry(0.028, 0.028, 0.02, 10);
  const cradleGeo = new BoxGeometry(0.09, 0.06, 0.3);
  const pipeGeo = new CylinderGeometry(0.026, 0.026, 1, 8);
  const pipeJointGeo = new TorusGeometry(0.028, 0.011, 6, 10);
  const pipeValveGeo = new CylinderGeometry(0.018, 0.018, 0.05, 6);
  const bodyGeo = new IcosahedronGeometry(0.16, 0);
  const brokenGeo = new OctahedronGeometry(0.16, 0);
  const fissureGeo = new BoxGeometry(0.022, 0.014, 0.09);
  const fissureShortGeo = new BoxGeometry(0.02, 0.012, 0.05);
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

  make("deck", deckGeo, ironMaterial, C);
  make("plate", plateGeo, steelMaterial, C);
  make("foot", footGeo, steelMaterial, C * 4);
  make("spike", spikeGeo, steelMaterial, C * 4);
  make("columnLow", columnLowGeo, ironMaterial, C);
  make("ringBig", ringBigGeo, brassMaterial, C * 2);
  make("columnUp", columnUpGeo, ironMaterial, C);
  make("ringSmall", ringSmallGeo, brassMaterial, C);
  make("head", headGeo, steelMaterial, C);
  make("strut", strutGeo, brassMaterial, C * 3);
  make("collar", collarGeo, steelMaterial, C);
  make("collarRing", collarRingGeo, brassMaterial, C);
  make("vent", ventGeo, emberMaterial, C * 3);
  make("drill", drillGeo, ironMaterial, C);
  make("drillBand", drillBandGeo, brassMaterial, C);
  make("auger", augerGeo, ironMaterial, C);
  make("tip", tipGeo, steelMaterial, C);
  make("tank", tankGeo, ironMaterial, C);
  make("tankBand", tankBandGeo, brassMaterial, C * 2);
  make("tankCap", tankCapGeo, steelMaterial, C * 2);
  make("tankValve", tankValveGeo, steelMaterial, C);
  make("valveWheel", valveWheelGeo, brassMaterial, C);
  make("window", windowGeo, emberMaterial, C);
  make("cradle", cradleGeo, mechMaterial, C);
  make("pipe", pipeGeo, ironMaterial, C * 2);
  make("pipeJoint", pipeJointGeo, brassMaterial, C * 4);
  make("pipeValve", pipeValveGeo, mechMaterial, C);
  make("body", bodyGeo, bodyMaterial, C * 3);
  make("sheen", bodyGeo, sheenMaterial, C);
  make("broken", brokenGeo, brokenMaterial, C);
  make("fissure", fissureGeo, fissureMaterial, C * 2);
  make("fissureShort", fissureShortGeo, fissureMaterial, C);
  make("ember", emberGeo, emberMaterial, C * 2);

  // ─── Helpers ────────────────────────────────────────────────────────
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const identityQuat = new Quaternion();
  const tmpEuler = new Euler();
  const tmpQuat = new Quaternion();

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

  // ─── Rig placement ──────────────────────────────────────────────────
  const addRig = (wx: number, sy: number, wz: number): void => {
    // Heavy squat base + anchor feet.
    addPiece("deck", wx, sy, wz, 0, 0.05, 0);
    addPiece("plate", wx, sy, wz, 0, 0.095, 0);
    for (const fx of [-0.33, 0.33]) {
      for (const fz of [-0.235, 0.235]) {
        addPiece("foot", wx, sy, wz, fx, 0.025, fz);
        addPiece("spike", wx, sy, wz, fx, -0.03, fz, 1, 1, 1, 0, Math.PI, 0);
      }
    }

    // Vertical reinforced drilling column (slightly rear of centre).
    addPiece("columnLow", wx, sy, wz, 0, 0.21, -0.04);
    addPiece("ringBig", wx, sy, wz, 0, 0.13, -0.04, 1, 1, 1, 0, PI_2, 0);
    addPiece("ringBig", wx, sy, wz, 0, 0.33, -0.04, 1, 1, 1, 0, PI_2, 0);
    addPiece("columnUp", wx, sy, wz, 0, 0.42, -0.04);
    addPiece("ringSmall", wx, sy, wz, 0, 0.47, -0.04, 1, 1, 1, 0, PI_2, 0);
    addPiece("head", wx, sy, wz, 0, 0.52, -0.04);

    // Angled brass support struts from the column top to the deck.
    addPiece("strut", wx, sy, wz, 0.14, 0.23, 0.1, 1, 1, 0.5219, -0.9715, 1.2567, -1.2567);
    addPiece("strut", wx, sy, wz, -0.14, 0.23, 0.1, 1, 1, 0.5219, 0.9715, 1.2567, 1.2567);
    addPiece("strut", wx, sy, wz, 0, 0.23, -0.15, 1, 1, 0.405, 0, -2.5673, 0);

    // Containment collar + rotating drill descending into the vein.
    addPiece("collar", wx, sy, wz, 0, 0.145, 0.34);
    addPiece("collarRing", wx, sy, wz, 0, 0.185, 0.34, 1, 1, 1, 0, PI_2, 0);
    for (let i = 0; i < 3; i += 1) {
      const a = (i * Math.PI * 2) / 3;
      addPiece("vent", wx, sy, wz, Math.cos(a) * 0.098, 0.145, 0.34 + Math.sin(a) * 0.098, 1, 1, 1, a);
    }
    addPiece("drill", wx, sy, wz, 0, 0.04, 0.34);
    addPiece("drillBand", wx, sy, wz, 0, -0.01, 0.34, 1, 1, 1, 0, PI_2, 0);
    addPiece("auger", wx, sy, wz, 0, -0.12, 0.34, 1, 1, 1, 0, Math.PI, 0);
    addPiece("tip", wx, sy, wz, 0, -0.22, 0.34, 1, 1, 1, 0, Math.PI, 0);

    // Horizontal pressure/containment vessel on the left side.
    addPiece("cradle", wx, sy, wz, -0.36, 0.145, 0);
    addPiece("tank", wx, sy, wz, -0.36, 0.27, 0, 1, 1, 1, 0, PI_2, 0);
    addPiece("tankBand", wx, sy, wz, -0.36, 0.27, -0.12);
    addPiece("tankBand", wx, sy, wz, -0.36, 0.27, 0.12);
    addPiece("tankCap", wx, sy, wz, -0.36, 0.27, -0.185, 1, 1, 1, 0, PI_2, 0);
    addPiece("tankCap", wx, sy, wz, -0.36, 0.27, 0.185, 1, 1, 1, 0, PI_2, 0);
    addPiece("tankValve", wx, sy, wz, -0.36, 0.395, 0);
    addPiece("valveWheel", wx, sy, wz, -0.36, 0.421, 0);
    addPiece("window", wx, sy, wz, -0.36, 0.27, 0.2, 1, 1, 1, 0, PI_2, 0);

    // Thick pipes from the extraction point into the vessel.
    addPiece("pipe", wx, sy, wz, -0.17, 0.285, 0.195, 1, 1, 0.501, -0.3447, -0.6624, 0.9372);
    addPiece("pipeJoint", wx, sy, wz, 0.02, 0.21, 0.34, 1, 1, 1, 0, PI_2, 0);
    addPiece("pipeJoint", wx, sy, wz, -0.36, 0.36, 0.05, 1, 1, 1, 0, PI_2, 0);
    addPiece("pipeValve", wx, sy, wz, -0.17, 0.29, 0.195);
    addPiece("pipe", wx, sy, wz, -0.1, 0.16, 0.16, 1, 1, 0.4477, -0.3921, -0.5046, 1.3128);
    addPiece("pipeJoint", wx, sy, wz, 0.1, 0.15, 0.26, 1, 1, 1, 0, PI_2, 0);
    addPiece("pipeJoint", wx, sy, wz, -0.3, 0.17, 0.06, 1, 1, 1, 0, PI_2, 0);

    // Exposed Umbrite vein the drill pierces, reusing the deposit palette.
    addPiece("body", wx, sy, wz, 0, -0.16, 0.34, 0.45, 0.45, 1.1, 0.15);
    addPiece("body", wx, sy, wz, 0.26, -0.02, 0.37, 0.5, 0.5, 0.55, 1.2);
    addPiece("body", wx, sy, wz, -0.2, -0.04, 0.36, 0.42, 0.46, 0.5, 2.1);
    addPiece("sheen", wx, sy, wz, 0.14, -0.06, 0.44, 0.4, 0.4, 0.5, 4.4);
    addPiece("broken", wx, sy, wz, 0.32, -0.04, 0.47, 0.34, 0.34, 0.48, 0.9);
    addPiece("fissure", wx, sy, wz, 0.26, 0.02, 0.4, 1, 1, 1, 0, 1.0, 0);
    addPiece("fissure", wx, sy, wz, 0.14, 0, 0.43, 1, 1, 1, 0, 1.0, 0);
    addPiece("fissureShort", wx, sy, wz, -0.2, 0, 0.41, 1, 1, 1, 0, 0.95, 0);
    addPiece("ember", wx, sy, wz, 0, -0.02, 0.33, 0.9, 0.9, 0.9);
    addPiece("ember", wx, sy, wz, 0.1, -0.04, 0.38, 1.0, 1.0, 1.0);
  };

  // ─── Public API ─────────────────────────────────────────────────────
  const clear = (): void => {
    for (const slot of slots.values()) slot.count = 0;
  };

  const addInstance = (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number): void => {
    addRig(sceneX, surfaceY, sceneZ);
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

  const dispose = (): void => {
    for (const slot of slots.values()) scene.remove(slot.mesh);
    [
      deckGeo, plateGeo, footGeo, spikeGeo, columnLowGeo, ringBigGeo, columnUpGeo,
      ringSmallGeo, headGeo, strutGeo, collarGeo, collarRingGeo, ventGeo, drillGeo,
      drillBandGeo, augerGeo, tipGeo, tankGeo, tankBandGeo, tankCapGeo, tankValveGeo,
      valveWheelGeo, windowGeo, cradleGeo, pipeGeo, pipeJointGeo, pipeValveGeo,
      bodyGeo, brokenGeo, fissureGeo, fissureShortGeo, emberGeo
    ].forEach((g) => g.dispose());
    [
      ironMaterial, steelMaterial, brassMaterial, mechMaterial, bodyMaterial,
      sheenMaterial, brokenMaterial, fissureMaterial, emberMaterial
    ].forEach((m) => m.dispose());
  };

  return { clear, addInstance, commit, dispose };
};
