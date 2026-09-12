import {
  BoxGeometry,
  CylinderGeometry,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3
} from "three";

// SIEGE_OUTPOST 3D overlay — a compact futuristic armored siege machine,
// the kind of heavy forward-deployed artillery platform that gets planted
// on a battlefield rather than built as a camp. It replaces the old wooden
// watchtower + catapult: a black-iron hull with aged-brass trim sits on a
// heavy mechanical undercarriage braced by four angled stabilizer struts
// with outrigger feet. The hero feature is a large forward-facing siege
// cannon (pointing +z, the tile-local "south") rising out of a revolving
// mount on the nose, upstaged only by the small rotating aether targeting
// head on the rear deck — a brass hub with a cyan lens and a violet ring
// that slowly spins every frame (driven by the fort overlay's tick).
// Exposed engine vents, rivets, recoil rods and a few cyan aether lamps
// complete the "blackened iron, aged brass, exposed mechanicals" steampunk
// look. Modelled tile-local facing +z ("south"); addInstance takes an
// optional facingRad yaw (see siegeBatteryFacingRadiansForTile) that turns
// the whole machine -- hull, legs, and cannon together -- toward the
// nearest known rival tile, falling back to the model's built-in south pose
// when no target is in range.

const PIO2 = Math.PI / 2;
const HEAD_SPIN_RAD_PER_S = 0.9;

const tileHash = (wx: number, wy: number, salt: number, mod: number): number => {
  const h = ((wx * 73856093) ^ (wy * 19349663) ^ (salt * 83492791)) >>> 0;
  return h % mod;
};

// Transform that orients a +Y cylinder from point a to point b, so one
// geometry serves every diagonal piece (stabilizer struts, cannon barrel,
// recoil rods) with the midpoint and the two-angle solve.
const between = (
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number
): { readonly cx: number; readonly cy: number; readonly cz: number; readonly sy: number; readonly rx: number; readonly ry: number } => {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  return {
    cx: (ax + bx) / 2,
    cy: (ay + by) / 2,
    cz: (az + bz) / 2,
    sy: len,
    rx: Math.acos(Math.min(1, Math.max(-1, dy / len))),
    ry: Math.atan2(dx, dz)
  };
};

const geometries = {
  box: new BoxGeometry(1, 1, 1),
  foot: new CylinderGeometry(0.045, 0.06, 1, 8),
  strut: new CylinderGeometry(0.028, 0.028, 1, 7),
  hub: new CylinderGeometry(0.09, 0.1, 1, 10),
  vent: new CylinderGeometry(0.03, 0.034, 1, 8),
  ring: new TorusGeometry(0.06, 0.008, 6, 14),
  rivet: new CylinderGeometry(0.012, 0.012, 1, 6),
  barrel: new CylinderGeometry(0.05, 0.062, 1, 10),
  rod: new CylinderGeometry(0.013, 0.013, 1, 6),
  antenna: new CylinderGeometry(0.008, 0.008, 1, 5),
  glow: new SphereGeometry(0.026, 10, 8),
  headHub: new CylinderGeometry(0.035, 0.045, 1, 8),
  headDish: new CylinderGeometry(0.05, 0.018, 1, 8),
  headLens: new SphereGeometry(0.017, 8, 6),
  headRing: new TorusGeometry(0.052, 0.005, 6, 14)
} as const;
type GeomId = keyof typeof geometries;

const materials = {
  blackIron: new MeshStandardMaterial({ color: 0x101116, roughness: 0.5, metalness: 0.8, flatShading: true }),
  darkIron: new MeshStandardMaterial({ color: 0x23262e, roughness: 0.55, metalness: 0.7, flatShading: true }),
  plate: new MeshStandardMaterial({ color: 0x3a3f49, roughness: 0.6, metalness: 0.6, flatShading: true }),
  brass: new MeshStandardMaterial({ color: 0x8a7440, roughness: 0.42, metalness: 0.85, flatShading: true }),
  brightBrass: new MeshStandardMaterial({ color: 0xb3924f, roughness: 0.36, metalness: 0.9, flatShading: true }),
  steel: new MeshStandardMaterial({ color: 0x525a66, roughness: 0.45, metalness: 0.8, flatShading: true }),
  cyan: new MeshStandardMaterial({ color: 0x0b2530, roughness: 0.35, metalness: 0.2, flatShading: true, emissive: 0x3fd8ff, emissiveIntensity: 1.5 }),
  violet: new MeshStandardMaterial({ color: 0x221338, roughness: 0.4, metalness: 0.2, flatShading: true, emissive: 0x9a6bff, emissiveIntensity: 1.2 })
} as const;
type MatId = keyof typeof materials;

type Part = {
  readonly g: GeomId;
  readonly m: MatId;
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  readonly rx: number;
  readonly ry: number;
  readonly rz: number;
  readonly spin: boolean;
  readonly animIndex: number;
};

const p = (
  g: GeomId,
  m: MatId,
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
  rx = 0,
  ry = 0,
  rz = 0,
  spin = false,
  animIndex = 0
): Part => ({ g, m, cx, cy, cz, sx, sy, sz, rx, ry, rz, spin, animIndex });

const strut = (sx: number, sz: number) => between(sx * 0.26, 0.16, sz * 0.27, sx * 0.34, 0.045, sz * 0.37);
const strutFL = strut(-1, 1);
const strutFR = strut(1, 1);
const strutBL = strut(-1, -1);
const strutBR = strut(1, -1);
const barrel = between(0, 0.53, 0.18, 0, 0.61, 0.58);
const rodL = between(0.13, 0.47, 0.15, 0.13, 0.55, 0.4);
const rodR = between(-0.13, 0.47, 0.15, -0.13, 0.55, 0.4);

const parts: Part[] = [
  // Heavy mechanical undercarriage: chassis, belly plate, side skirts, nose apron.
  p("box", "darkIron", 0, 0.1, 0, 0.72, 0.12, 0.78),
  p("box", "plate", 0, 0.058, 0, 0.62, 0.045, 0.74),
  p("box", "blackIron", -0.35, 0.09, 0, 0.05, 0.12, 0.76),
  p("box", "blackIron", 0.35, 0.09, 0, 0.05, 0.12, 0.76),
  p("box", "blackIron", 0, 0.135, 0.33, 0.5, 0.06, 0.09),
  // Corner outrigger feet with angled brass stabilizer struts.
  p("foot", "darkIron", -0.335, 0.03, 0.35, 1, 0.07, 1),
  p("foot", "darkIron", 0.335, 0.03, 0.35, 1, 0.07, 1),
  p("foot", "darkIron", -0.335, 0.03, -0.35, 1, 0.07, 1),
  p("foot", "darkIron", 0.335, 0.03, -0.35, 1, 0.07, 1),
  p("strut", "brass", strutFL.cx, strutFL.cy, strutFL.cz, 1, strutFL.sy, 1, strutFL.rx, strutFL.ry),
  p("strut", "brass", strutFR.cx, strutFR.cy, strutFR.cz, 1, strutFR.sy, 1, strutFR.rx, strutFR.ry),
  p("strut", "brass", strutBL.cx, strutBL.cy, strutBL.cz, 1, strutBL.sy, 1, strutBL.rx, strutBL.ry),
  p("strut", "brass", strutBR.cx, strutBR.cy, strutBR.cz, 1, strutBR.sy, 1, strutBR.rx, strutBR.ry),
  // Armored hull: black iron body, sloped front glacis, rear deck.
  p("box", "darkIron", 0, 0.27, 0, 0.56, 0.22, 0.6),
  p("box", "plate", 0, 0.3, 0.24, 0.52, 0.03, 0.28, 0.35),
  p("box", "blackIron", 0, 0.385, -0.04, 0.5, 0.1, 0.42),
  // Aged-brass trim: nose bumper, rear rail, rivet row on the glacis.
  p("box", "brass", 0, 0.16, 0.325, 0.54, 0.04, 0.05),
  p("box", "brass", 0, 0.29, -0.315, 0.56, 0.03, 0.03),
  p("rivet", "brightBrass", -0.2, 0.305, 0.335, 1, 1, 1),
  p("rivet", "brightBrass", 0.2, 0.305, 0.335, 1, 1, 1),
  p("rivet", "brightBrass", -0.28, 0.305, 0.02, 1, 1, 1),
  p("rivet", "brightBrass", -0.28, 0.305, -0.12, 1, 1, 1),
  p("rivet", "brightBrass", 0.28, 0.305, 0.02, 1, 1, 1),
  p("rivet", "brightBrass", 0.28, 0.305, -0.12, 1, 1, 1),
  p("rivet", "brightBrass", 0, 0.22, 0.315, 1, 1, 1),
  // Rear engine rack: block, vent stacks, brass collars.
  p("box", "darkIron", 0, 0.455, -0.24, 0.34, 0.05, 0.1),
  p("vent", "steel", -0.08, 0.51, -0.24, 1, 0.09, 1),
  p("vent", "steel", 0.08, 0.51, -0.24, 1, 0.09, 1),
  p("ring", "brass", -0.08, 0.555, -0.24, 0.7, 0.7, 0.7, PIO2),
  p("ring", "brass", 0.08, 0.555, -0.24, 0.7, 0.7, 0.7, PIO2),
  // Forward siege cannon: revolving mount, cradle, big barrel, brass bands, muzzle brake, breech, recoil rods.
  p("hub", "darkIron", 0, 0.475, 0.16, 1, 0.09, 1),
  p("box", "darkIron", 0, 0.52, 0.2, 0.4, 0.09, 0.18),
  p("barrel", "steel", barrel.cx, barrel.cy, barrel.cz, 1, barrel.sy, 1, barrel.rx, barrel.ry),
  p("ring", "brass", 0, 0.554, 0.3, 1, 1, 1, barrel.rx, barrel.ry),
  p("ring", "brass", 0, 0.588, 0.468, 1, 1, 1, barrel.rx, barrel.ry),
  p("ring", "darkIron", 0, 0.604, 0.552, 0.9, 0.9, 0.9, barrel.rx, barrel.ry),
  p("box", "blackIron", 0, 0.555, 0.1, 0.3, 0.12, 0.16),
  p("rod", "steel", rodL.cx, rodL.cy, rodL.cz, 1, rodL.sy, 1, rodL.rx, rodL.ry),
  p("rod", "steel", rodR.cx, rodR.cy, rodR.cz, 1, rodR.sy, 1, rodR.rx, rodR.ry),
  // Rear targeting pedestal (static) plus antenna with an aether lamp.
  p("hub", "darkIron", 0, 0.465, -0.14, 0.8, 0.07, 0.8),
  p("hub", "darkIron", 0, 0.5, -0.14, 1, 0.03, 1),
  p("antenna", "steel", 0.19, 0.5, -0.08, 1, 0.18, 1),
  p("glow", "cyan", 0.19, 0.6, -0.08, 1, 1, 1),
  p("glow", "cyan", -0.2, 0.34, 0.3, 1, 1, 1),
  p("glow", "cyan", 0.2, 0.34, 0.3, 1, 1, 1),
  // Rotating aether targeting head: hub, dish, cyan lens, violet ring.
  p("headHub", "brass", 0, 0.545, -0.14, 1, 0.05, 1, 0, 0, 0, true, 0),
  p("headDish", "brass", 0, 0.6, -0.14, 1, 0.075, 1, 0, 0, 0, true, 1),
  p("headLens", "cyan", 0, 0.615, -0.085, 1, 1, 1, 0, 0, 0, true, 2),
  p("headRing", "violet", 0, 0.575, -0.14, 1, 1, 1, 0, 0, 0, true, 3)
];

const HEAD_COUNT = 4;

export type SiegeMachineOverlay = {
  readonly clear: () => void;
  readonly addInstance: (
    worldX: number,
    worldZ: number,
    surfaceY: number,
    wx: number,
    wy: number,
    /** Yaw in radians, aiming the machine at its nearest known rival tile
     *  (see siegeBatteryFacingRadiansForTile). Defaults to 0 -- the model's
     *  built-in south-facing pose -- for demo/story callers that don't
     *  track a facing. */
    facingRad?: number
  ) => void;
  readonly commit: () => void;
  readonly tick: (nowMs: number) => void;
  readonly dispose: () => void;
};

type ActiveMachine = {
  readonly worldX: number;
  readonly worldZ: number;
  readonly surfaceY: number;
  readonly jitter: number;
  readonly facing: number;
  readonly phase: number;
};

export const createSiegeMachineOverlay = (scene: Scene, maxTiles: number): SiegeMachineOverlay => {
  const group = new Group();
  group.name = "siege-machine-overlay";
  scene.add(group);

  // Several parts of a single machine share the same geometry+material (e.g.
  // 7 separate "box:darkIron" pieces), and all instances of one key are
  // packed into one shared InstancedMesh. That mesh's capacity therefore
  // needs room for every machine's occurrences of the key, not just one
  // slot per machine -- undersizing it silently corrupts the instance
  // matrix buffer once writes run past its allocated capacity.
  const keyOccurrences = new Map<string, number>();
  for (const part of parts) {
    const key = `${part.g}:${part.m}`;
    keyOccurrences.set(key, (keyOccurrences.get(key) ?? 0) + 1);
  }

  const groupMap = new Map<string, { mesh: InstancedMesh; parts: Part[]; count: number }>();
  const headGroups: Array<{ mesh: InstancedMesh; parts: Part[]; count: number } | undefined> = Array.from({ length: HEAD_COUNT });
  for (const part of parts) {
    const key = `${part.g}:${part.m}`;
    let slot = groupMap.get(key);
    if (!slot) {
      const capacity = maxTiles * (keyOccurrences.get(key) ?? 1);
      slot = { mesh: new InstancedMesh(geometries[part.g], materials[part.m], capacity), parts: [], count: 0 };
      slot.mesh.name = `siege-${key}`;
      slot.mesh.frustumCulled = false;
      slot.mesh.castShadow = true;
      slot.mesh.receiveShadow = true;
      group.add(slot.mesh);
      groupMap.set(key, slot);
    }
    slot.parts.push(part);
    if (part.spin) headGroups[part.animIndex] = slot;
  }

  const machines: ActiveMachine[] = [];
  const matrix = new Matrix4();
  const localMatrix = new Matrix4();
  const rotationMatrix = new Matrix4();
  const scaleVec = new Vector3();
  const localEuler = new Euler(0, 0, 0, "YXZ");

  const writePart = (
    mesh: InstancedMesh,
    index: number,
    part: Part,
    worldX: number,
    worldZ: number,
    surfaceY: number,
    rotY: number,
    spin: number
  ): void => {
    // Final = T(world) * R_y(jitter) * R(spin/part angles) * S * T(local offset).
    // The tilt/jitter rotation is applied about the tile center (worldX, worldZ),
    // so the machine stays planted on its tile no matter how far from the
    // world origin it sits.
    localEuler.set(part.rx, part.ry + spin, part.rz, "YXZ");
    localMatrix.makeRotationFromEuler(localEuler);
    scaleVec.set(part.sx, part.sy, part.sz);
    localMatrix.scale(scaleVec);
    localMatrix.setPosition(part.cx, surfaceY + part.cy, part.cz);
    rotationMatrix.makeRotationY(rotY);
    matrix.makeTranslation(worldX, 0, worldZ);
    matrix.multiply(rotationMatrix);
    matrix.multiply(localMatrix);
    mesh.setMatrixAt(index, matrix);
  };

  const clear = (): void => {
    for (const slot of groupMap.values()) slot.count = 0;
    machines.length = 0;
  };

  const addInstance = (worldX: number, worldZ: number, surfaceY: number, wx: number, wy: number, facingRad = 0): void => {
    const index = machines.length;
    if (index >= maxTiles) return;
    const jitter = (tileHash(wx, wy, 13, 49) - 24) * 0.0065;
    const phase = (tileHash(wx, wy, 7, 1000) / 1000) * Math.PI * 2;
    const yaw = facingRad + jitter;
    for (const slot of groupMap.values()) {
      for (const part of slot.parts) {
        writePart(slot.mesh, slot.count, part, worldX, worldZ, surfaceY, yaw, part.spin ? phase : 0);
        slot.count += 1;
      }
    }
    machines.push({ worldX, worldZ, surfaceY, jitter, facing: facingRad, phase });
  };

  const commit = (): void => {
    for (const slot of groupMap.values()) {
      slot.mesh.count = slot.count;
      slot.mesh.instanceMatrix.clearUpdateRanges();
      if (slot.count > 0) {
        slot.mesh.instanceMatrix.addUpdateRange(0, slot.count * 16);
        slot.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  };

  const tick = (nowMs: number): void => {
    const count = machines.length;
    if (count === 0) return;
    const spin = nowMs / 1000 * HEAD_SPIN_RAD_PER_S;
    for (let i = 0; i < count; i += 1) {
      const m = machines[i]!;
      const headSpin = m.phase + spin;
      for (let j = 0; j < HEAD_COUNT; j += 1) {
        const slot = headGroups[j]!;
        const base = i * slot.parts.length;
        for (let k = 0; k < slot.parts.length; k += 1) {
          writePart(slot.mesh, base + k, slot.parts[k]!, m.worldX, m.worldZ, m.surfaceY, m.facing + m.jitter, headSpin);
        }
      }
    }
    for (let j = 0; j < HEAD_COUNT; j += 1) {
      const slot = headGroups[j]!;
      const entryCount = machines.length * slot.parts.length;
      slot.mesh.instanceMatrix.clearUpdateRanges();
      slot.mesh.instanceMatrix.addUpdateRange(0, entryCount * 16);
      slot.mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    scene.remove(group);
    for (const geo of Object.values(geometries)) geo.dispose();
    for (const mat of Object.values(materials)) mat.dispose();
  };

  return { clear, addInstance, commit, tick, dispose };
};