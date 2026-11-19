// The Holo-Locked Stack's opening, played once in true-3D where a collected
// waystation stood: the padlock unlatches and shatters, the front crate's door
// drops like a ramp, a reward core rises out of the light, sparks stream up,
// and as soon as it is open the whole site teleports out in a beam. Built from the same
// part list as the instanced overlay (holo-crate-model-3d.ts) so the swap from
// the dormant site to this effect is seamless. Timeline: holo-crate-open-fx.ts.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CircleGeometry, CylinderGeometry, DoubleSide, Group, Matrix4,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Points, PointsMaterial, Quaternion, TorusGeometry, Vector3,
  type Material, type Texture
} from "three";
import { beginWaystationOpening, waystationOpeningAge, waystationOpenPose, type WaystationOpenFxEntry } from "./holo-crate-open-fx.js";
import { isMapCoveredByRewardCard } from "./holo-crate-map-covered.js";
import {
  createHoloCrateGeometries, createHoloCrateMaterials, DOOR_HINGE, HOLO_CRATE_PARTS, LOCK_ANCHOR, OPENER, PAD_TOP,
  type HoloMaterialKey
} from "./holo-crate-model-3d.js";

const SPARKS = 36;
const SHARDS = 14;

type Opening = {
  readonly root: Group;
  readonly site: Group;
  readonly door: Object3D;
  readonly lock: Group;
  readonly shackle: Object3D[];
  readonly core: Mesh;
  readonly halo: Mesh;
  readonly shaft: Mesh;
  readonly spill: Mesh;
  readonly beam: Mesh;
  readonly scan: Mesh;
  readonly sparks: Points;
  readonly shards: Mesh[];
  readonly materials: Record<HoloMaterialKey, Material>;
  readonly fx: MeshBasicMaterial[];
  readonly sparkMaterial: PointsMaterial;
  readonly entry: WaystationOpenFxEntry;
  readonly seed: number;
  faded: boolean;
};

export type WaystationOpenFxLayer = {
  readonly group: Group;
  /** Plays `entry` (held at its first frame until the map is uncovered; wall-clock timeline). */
  readonly spawn: (sceneX: number, sceneZ: number, surfaceY: number, entry: WaystationOpenFxEntry, seed: number) => void;
  readonly update: (nowMs: number) => void;
  readonly clear: () => void;
  readonly dispose: () => void;
  readonly activeCount: () => number;
};

const additive = (color: string, opacity = 0, vertexColors = false): MeshBasicMaterial =>
  new MeshBasicMaterial({ toneMapped: false, color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, vertexColors });
const rand = (seed: number, i: number): number => {
  const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

export const createWaystationOpenFxLayer = (
  parent: Object3D, environment?: Texture,
  covered: () => boolean = isMapCoveredByRewardCard, wallNow: () => number = Date.now
): WaystationOpenFxLayer => {
  const group = new Group();
  group.name = "waystation-open-fx";
  parent.add(group);
  const geometries = createHoloCrateGeometries();
  // Additive light fades to nothing where its vertex colour reaches black.
  const fade = (geometry: BufferGeometry, brightness: (x: number, y: number, z: number) => number): BufferGeometry => {
    const position = geometry.getAttribute("position") as BufferAttribute;
    const colors = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i += 1) colors.fill(Math.max(0, Math.min(1, brightness(position.getX(i), position.getY(i), position.getZ(i)))), i * 3, i * 3 + 3);
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    return geometry;
  };
  const shaftGeometry = fade(new CylinderGeometry(0.045, 0.14, 0.75, 24, 6, true).translate(0, 0.375, 0), (_x, y) => Math.pow(1 - y / 0.75, 2.2));
  const spillGeometry = fade(new CircleGeometry(0.22, 28).rotateX(-Math.PI / 2), (x, _y, z) => 1 - Math.hypot(x, z) / 0.22);
  const beamGeometry = fade(new CylinderGeometry(0.46, 0.46, 2.6, 32, 6, true).translate(0, 1.3, 0), (_x, y) => Math.pow(1 - y / 2.6, 1.3));
  const scanGeometry = new TorusGeometry(0.5, 0.012, 4, 48).rotateX(Math.PI / 2);
  const shardGeometry = geometries.keyhole;
  const openings: Opening[] = [];
  const hingePosition = new Vector3();
  const hingeRotation = new Quaternion();
  const hingeScale = new Vector3();
  DOOR_HINGE.decompose(hingePosition, hingeRotation, hingeScale);
  const coreFrom = new Vector3(OPENER.x, PAD_TOP + 0.12, OPENER.z);
  const coreTo = new Vector3(OPENER.x + 0.01, PAD_TOP + 0.44, OPENER.z + 0.24);

  const spawn = (sceneX: number, sceneZ: number, surfaceY: number, entry: WaystationOpenFxEntry, seed: number): void => {
    const materials = createHoloCrateMaterials(environment);
    const root = new Group();
    root.position.set(sceneX, surfaceY, sceneZ);
    const site = new Group();
    root.add(site);
    const mesh = (geometry: keyof typeof geometries, material: HoloMaterialKey, matrix: Matrix4, into: Object3D): Mesh => {
      const m = new Mesh(geometries[geometry], materials[material]);
      matrix.decompose(m.position, m.quaternion, m.scale);
      if (material === "holo" || material === "holoBeam") m.renderOrder = 2;
      into.add(m);
      return m;
    };
    const hinge = new Object3D();
    hinge.position.copy(hingePosition);
    hinge.quaternion.copy(hingeRotation);
    const door = new Object3D();
    hinge.add(door);
    site.add(hinge);
    const lock = new Group();
    lock.position.copy(LOCK_ANCHOR);
    site.add(lock);
    const shackle: Object3D[] = [];
    for (const part of HOLO_CRATE_PARTS) {
      if (part.role === "door") mesh(part.geometry, part.material, part.matrix, door);
      else if (part.role === "lock") { const m = mesh(part.geometry, part.material, part.matrix, lock); if (part.geometry === "shackle") shackle.push(m); }
      else mesh(part.geometry, part.material, part.matrix, site);
    }
    const fx: MeshBasicMaterial[] = [];
    const fxMesh = (geometry: BufferGeometry, color: string, into: Object3D): Mesh => {
      const material = additive(color, 0, geometry.hasAttribute("color"));
      fx.push(material);
      const m = new Mesh(geometry, material);
      m.renderOrder = 3;
      into.add(m);
      return m;
    };
    const core = fxMesh(geometries.core, "#eafcff", site);
    const halo = fxMesh(geometries.core, "#58e4f5", core);
    halo.scale.setScalar(1.9);
    const shaft = fxMesh(shaftGeometry, "#58e4f5", site);
    shaft.position.set(coreTo.x, PAD_TOP + 0.1, coreTo.z - 0.06);
    const spill = fxMesh(spillGeometry, "#58e4f5", site);
    spill.position.set(OPENER.x, PAD_TOP + 0.004, OPENER.z + OPENER.d / 2 + 0.12);
    const beam = fxMesh(beamGeometry, "#58d8f0", root);
    const scan = fxMesh(scanGeometry, "#c9fbff", root);
    const shards: Mesh[] = [];
    for (let i = 0; i < SHARDS; i += 1) {
      const shard = fxMesh(shardGeometry, "#7beeff", lock);
      shard.scale.set(0.018, 0.018, 0.004);
      shards.push(shard);
    }
    const sparkGeometry = new BufferGeometry();
    sparkGeometry.setAttribute("position", new BufferAttribute(new Float32Array(SPARKS * 3), 3));
    const sparkMaterial = new PointsMaterial({ color: "#9ff3ff", size: 0.035, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    const sparks = new Points(sparkGeometry, sparkMaterial);
    sparks.frustumCulled = false;
    site.add(sparks);
    group.add(root);
    openings.push({ root, site, door, lock, shackle, core, halo, shaft, spill, beam, scan, sparks, shards, materials, fx, sparkMaterial, entry, seed, faded: false });
  };

  const disposeOpening = (opening: Opening): void => {
    group.remove(opening.root);
    for (const material of Object.values(opening.materials)) material.dispose();
    for (const material of opening.fx) material.dispose();
    opening.sparkMaterial.dispose();
    opening.sparks.geometry.dispose();
  };

  const opacity = (mesh: Mesh, value: number): void => { (mesh.material as MeshBasicMaterial).opacity = Math.max(0, value); };

  const update = (nowMs: number): void => {
    for (let i = openings.length - 1; i >= 0; i -= 1) {
      const o = openings[i]!;
      const wall = wallNow();
      beginWaystationOpening(o.entry, wall, covered);
      const age = waystationOpeningAge(o.entry, wall);
      if (age === undefined) { disposeOpening(o); openings.splice(i, 1); continue; }
      const pose = waystationOpenPose(age);
      const alpha = pose.alpha;
      const t = nowMs / 1000;

      // Padlock: shackle springs up, the lock swells and flickers out, shards fly.
      o.lock.visible = pose.lock < 1;
      for (const s of o.shackle) s.position.y = 0.02 + 0.03 * Math.min(1, pose.lock * 3);
      o.lock.scale.setScalar(1 + 0.45 * pose.lock * pose.lock);
      o.lock.rotation.y = pose.lock * 0.9;
      (o.materials.holo as MeshBasicMaterial).opacity = 0.5 * (1 - pose.lock) * (pose.lock > 0.3 && Math.sin(age * 0.09) > 0 ? 0.4 : 1);
      (o.materials.holoBeam as MeshBasicMaterial).opacity = 0.1 * (1 - pose.lock);
      o.shards.forEach((shard, j) => {
        const a = rand(o.seed, j) * Math.PI * 2, lift = rand(o.seed, j + 40) - 0.3, burst = pose.lock * 0.32;
        shard.position.set(Math.cos(a) * burst, lift * burst, Math.sin(a) * burst);
        shard.rotation.set(a * 3 + t * 6, a + t * 4, 0);
        opacity(shard, pose.lock > 0 ? 0.9 * (1 - pose.lock) * 1.6 : 0);
      });

      // Door drops toward the camera like a ramp; the cavity floods with light.
      o.door.rotation.x = pose.door * (Math.PI / 2);
      (o.materials.interior as MeshStandardMaterial).emissiveIntensity = 0.32 * pose.glow;
      (o.materials.glow as MeshStandardMaterial).emissiveIntensity = 1.0 + 0.7 * pose.glow + 0.2 * Math.sin(t * 5);

      // Reward core rises out of the crate, spins and bobs.
      o.core.position.lerpVectors(coreFrom, coreTo, pose.core);
      o.core.position.y += Math.sin(t * 2.6) * 0.012 * pose.core;
      o.core.rotation.set(t * 1.3, t * 2.1, 0);
      o.core.scale.setScalar(0.45 + 0.45 * pose.core);
      o.core.visible = pose.core > 0;
      opacity(o.core, pose.core * alpha);
      opacity(o.halo, (0.16 + 0.06 * Math.sin(t * 7)) * pose.core * alpha);
      opacity(o.shaft, 0.3 * Math.min(1, pose.glow) * alpha * (0.85 + 0.15 * Math.sin(t * 9)));
      opacity(o.spill, 0.55 * Math.min(1, pose.glow) * alpha);

      // Sparks stream up out of the open crate.
      const positions = o.sparks.geometry.getAttribute("position") as BufferAttribute;
      for (let j = 0; j < SPARKS; j += 1) {
        const life = (t * 0.6 + rand(o.seed, j + 90)) % 1;
        const swirl = rand(o.seed, j + 150) * Math.PI * 2 + t * 1.8;
        const radius = 0.05 + 0.12 * life;
        positions.setXYZ(j, coreTo.x + Math.cos(swirl) * radius, PAD_TOP + 0.15 + life * 0.9, coreTo.z - 0.04 + Math.sin(swirl) * radius);
      }
      positions.needsUpdate = true;
      o.sparkMaterial.opacity = 0.9 * Math.min(1, pose.glow) * alpha;

      // Teleport-out: a beam swallows the site, a scan ring sweeps up, the stack collapses into it.
      const out = pose.out;
      opacity(o.beam, Math.sin(Math.PI * out) * 0.28);
      opacity(o.scan, out > 0 ? (1 - out) * 0.7 : 0);
      o.scan.position.y = out * 1.6;
      const squeeze = 1 - out * out * 0.92;
      o.site.scale.set(squeeze, 1 + out * 0.35, squeeze);
      if (out > 0) {
        for (const material of Object.values(o.materials)) {
          if (!(material instanceof MeshStandardMaterial)) continue;
          if (!o.faded) { material.transparent = true; material.needsUpdate = true; }
          material.opacity = alpha;
        }
        o.faded = true;
      }
    }
  };

  const clear = (): void => { while (openings.length) disposeOpening(openings.pop()!); };
  return {
    group,
    spawn,
    update,
    clear,
    activeCount: () => openings.length,
    dispose() {
      clear();
      parent.remove(group);
      for (const geometry of Object.values(geometries)) geometry.dispose();
      for (const geometry of [shaftGeometry, spillGeometry, beamGeometry, scanGeometry]) geometry.dispose();
    }
  };
};

