// Portable Survey Rig: three splayed iron legs, brass instrument head with a
// cyan lens, a strapped equipment case, canvas lean-to and rolled bedroll.
// All pieces are instanced; only the unclaimed, visible lens pulses per frame.
import {
  BoxGeometry, BufferGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group,
  IcosahedronGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion,
  Scene, Texture, TorusGeometry, Vector3
} from "three";
import { applyBuildingEnvMap } from "./client-map-3d-building-envmap/client-map-3d-building-envmap.js";

export type WaystationOverlay = {
  readonly group: Group;
  readonly clear: () => void;
  readonly addInstance: (centerX: number, centerZ: number, surfaceY: number,
    worldX: number, worldZ: number, waystation: { activated: boolean }, frozen?: boolean) => void;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createWaystationOverlay = (scene: Scene, maxTiles: number, buildingEnvironmentTexture?: Texture): WaystationOverlay => {
  const group = new Group();
  group.name = "waystation-overlay";
  scene.add(group);
  const material = (color: string, metalness: number): MeshStandardMaterial => {
    const result = new MeshStandardMaterial({ color, roughness: 0.6, metalness, flatShading: true });
    applyBuildingEnvMap(result, buildingEnvironmentTexture);
    return result;
  };
  const iron = material("#30343b", 0.6);
  const brass = material("#af8545", 0.8);
  const canvas = material("#ad9062", 0.02);
  canvas.side = DoubleSide;
  const straps = material("#695338", 0.05);
  const glass = material("#193b43", 0.35);
  const dormant = material("#123a40", 0.2);
  dormant.emissive.set("#39c4dd");
  dormant.emissiveIntensity = 1;
  const active = dormant.clone();
  active.emissiveIntensity = 0.3;
  const remembered = dormant.clone();
  remembered.emissiveIntensity = 1.175;
  const materials = [iron, brass, canvas, straps, glass, dormant, active, remembered];

  // Two pitched cloth panels, open at both ends so it reads as a packed camp.
  const shelter = new BufferGeometry();
  shelter.setAttribute("position", new Float32BufferAttribute([
    -0.19, 0, -0.15, 0, 0.3, -0.15, -0.19, 0, 0.15,
    -0.19, 0, 0.15, 0, 0.3, -0.15, 0, 0.3, 0.15,
    0, 0.3, -0.15, 0.19, 0, -0.15, 0.19, 0, 0.15,
    0, 0.3, -0.15, 0.19, 0, 0.15, 0, 0.3, 0.15
  ], 3));
  shelter.computeVertexNormals();
  const unitBar = new CylinderGeometry(0.018, 0.024, 1, 6);
  const foot = new BoxGeometry(0.09, 0.035, 0.09);
  const collar = new CylinderGeometry(0.065, 0.09, 0.1, 8);
  const head = new BoxGeometry(0.23, 0.2, 0.17);
  const lensBarrel = new CylinderGeometry(0.104, 0.104, 0.16, 12);
  lensBarrel.rotateX(Math.PI / 2);
  const rim = new TorusGeometry(0.09, 0.018, 6, 12);
  const lens = new IcosahedronGeometry(0.077, 1);
  const dial = new CylinderGeometry(0.035, 0.035, 0.04, 8);
  dial.rotateZ(Math.PI / 2);
  const caseBody = new BoxGeometry(0.29, 0.16, 0.2);
  const caseBand = new BoxGeometry(0.025, 0.175, 0.215);
  const bedroll = new CylinderGeometry(0.06, 0.06, 0.25, 10);
  bedroll.rotateZ(Math.PI / 2);
  const bedrollBand = new TorusGeometry(0.061, 0.01, 5, 10);
  bedrollBand.rotateY(Math.PI / 2);
  const geometries = [shelter, unitBar, foot, collar, head, lensBarrel, rim, lens, dial, caseBody, caseBand, bedroll, bedrollBand];
  type Slot = { mesh: InstancedMesh; count: number; capacity: number };
  const slots = new Map<string, Slot>();
  const make = (name: string, geometry: BufferGeometry, mat: MeshStandardMaterial, perSite = 1): void => {
    const capacity = Math.max(1, maxTiles * perSite);
    const mesh = new InstancedMesh(geometry, mat, capacity);
    mesh.name = `survey-rig-${name}`;
    mesh.count = 0;
    mesh.frustumCulled = false;
    group.add(mesh);
    slots.set(name, { mesh, count: 0, capacity });
  };
  make("legs", unitBar, iron, 3);
  make("feet", foot, iron, 3);
  make("leg-bands", unitBar, brass, 3);
  make("collar", collar, brass);
  make("head", head, brass);
  make("lens-barrel", lensBarrel, iron);
  make("lens-rim", rim, brass);
  make("lensDormant", lens, dormant);
  make("lensActive", lens, active);
  make("lensRemembered", lens, remembered);
  make("lens-back", head, glass);
  make("dial", dial, brass);
  make("case", caseBody, iron);
  make("case-bands", caseBand, brass, 2);
  make("shelter", shelter, canvas);
  make("bedroll", bedroll, canvas);
  make("bedroll-bands", bedrollBand, straps, 2);
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const rotation = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const direction = new Vector3();
  const identity = new Quaternion();
  let sites = 0;

  const piece = (name: string, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, quaternion = identity): void => {
    const slot = slots.get(name);
    if (!slot || slot.count >= slot.capacity) return;
    matrix.compose(position.set(x, y, z), quaternion, scale.set(sx, sy, sz));
    slot.mesh.setMatrixAt(slot.count++, matrix);
  };
  const bar = (name: string, x: number, y: number, z: number, dx: number, dy: number, dz: number, thickness = 1): void => {
    direction.set(dx, dy, dz);
    const length = direction.length();
    rotation.setFromUnitVectors(up, direction.normalize());
    piece(name, x, y, z, thickness, length, thickness, rotation);
  };
  return {
    group,
    clear() { sites = 0; for (const slot of slots.values()) slot.count = 0; },
    addInstance(x, z, y, _worldX, _worldZ, waystation, frozen = false) {
      if (sites >= maxTiles) return;
      sites += 1;
      // Instrument slightly left of centre, packed camp to the right.
      const tx = x - 0.12;
      for (const angle of [Math.PI / 2, Math.PI * 7 / 6, Math.PI * 11 / 6]) {
        const dx = Math.cos(angle) * 0.24;
        const dz = Math.sin(angle) * 0.24;
        bar("legs", tx + dx / 2, y + 0.29, z + dz / 2, -dx, 0.53, -dz);
        piece("feet", tx + dx, y + 0.025, z + dz);
        bar("leg-bands", tx + dx * 0.65, y + 0.2, z + dz * 0.65, -dx * 0.1, 0.053, -dz * 0.1, 1.35);
      }
      piece("collar", tx, y + 0.58, z);
      piece("head", tx, y + 0.73, z);
      piece("lens-back", tx, y + 0.73, z - 0.02, 0.7, 0.7, 1);
      piece("lens-barrel", tx, y + 0.74, z + 0.11);
      piece("lens-rim", tx, y + 0.74, z + 0.195);
      piece(waystation.activated ? "lensActive" : frozen ? "lensRemembered" : "lensDormant", tx, y + 0.74, z + 0.19, 1, 1, 0.35);
      piece("dial", tx - 0.14, y + 0.72, z);
      piece("case", x + 0.2, y + 0.085, z + 0.24);
      for (const dx of [0.12, 0.28]) piece("case-bands", x + dx, y + 0.085, z + 0.24);
      piece("shelter", x + 0.26, y + 0.02, z - 0.18);
      piece("bedroll", x + 0.26, y + 0.08, z - 0.16);
      for (const dx of [0.19, 0.33]) piece("bedroll-bands", x + dx, y + 0.08, z - 0.16);
    },
    commit() {
      for (const { mesh, count } of slots.values()) {
        mesh.count = count;
        if (!count) continue;
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0, count * 16);
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
    update(nowMs) { dormant.emissiveIntensity = 1 + 0.35 * (0.5 + 0.5 * Math.sin(nowMs * 0.0016)); },
    dispose() {
      scene.remove(group);
      for (const slot of slots.values()) slot.mesh.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const mat of materials) mat.dispose();
      slots.clear();
    }
  };
};
