import {
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
  Shape,
  SphereGeometry,
  type BufferGeometry
} from "three";
import { WATER_SURFACE_Y } from "./client-map-3d-water-surface.js";

// Troop transport for a muster company's sea crossing: when the march route
// (client-muster-transit-route.ts) reaches a dock, the company boards and this
// boat carries it along the dock pair's sea lane to the far shore, where the
// marching overlay picks the company up again. Built from primitives (no
// model asset): a dark iron-bound hull, a deckhouse, a smoking funnel, the
// company packed on deck in its empire's colour and a pennant in the same
// colour, so it reads as "our troops at sea" at map zoom.
//
// Owned by the muster transit overlay (client-map-3d-muster-transit-overlay.ts)
// rather than wired into client-map-3d.ts separately: same clear/add/tick
// lifecycle, driven from the same per-frame sync. At most MAX_BOATS sail at
// once; a pool of that many is built on first use.

export type MusterBoatVoyage = {
  // Sea-lane points in scene units (tile centres), departure dock first.
  path: ReadonlyArray<{ x: number; z: number }>;
  startAt: number;
  arriveAt: number;
  ownerColor: string;
};

export type MusterBoatOverlay = {
  readonly clear: () => void;
  readonly addVoyage: (voyage: MusterBoatVoyage) => void;
  readonly tick: (nowMs: number) => void;
  readonly dispose: () => void;
};

const MAX_BOATS = 10;
const HULL_LENGTH = 0.62;
const HULL_BEAM = 0.2;
const HULL_HEIGHT = 0.09;
const DECK_Y = HULL_HEIGHT;
const SMOKE_PUFFS = 3;
const SMOKE_CYCLE_MS = 1_800;
const TROOP_SLOTS: ReadonlyArray<[number, number]> = [[-0.05, 0.1], [0.05, 0.1], [-0.05, 0.02], [0.05, 0.02], [-0.05, -0.06], [0.05, -0.06]];

// Top-down hull outline, bow towards +Z: a square stern and a pointed bow.
const hullShape = (): Shape => {
  const half = HULL_BEAM / 2;
  const stern = -HULL_LENGTH / 2;
  const shoulder = HULL_LENGTH * 0.18;
  const bow = HULL_LENGTH / 2;
  const shape = new Shape();
  shape.moveTo(-half, stern);
  shape.lineTo(half, stern);
  shape.lineTo(half, shoulder);
  shape.quadraticCurveTo(half, bow * 0.85, 0, bow);
  shape.quadraticCurveTo(-half, bow * 0.85, -half, shoulder);
  shape.closePath();
  return shape;
};

const easeInOut = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;

type Boat = { root: Group; ownerMaterial: MeshStandardMaterial; smoke: Mesh[] };

export const createMusterBoatOverlay = (scene: Scene): MusterBoatOverlay => {
  const geometries: BufferGeometry[] = [];
  const sharedMaterials: MeshStandardMaterial[] = [];
  let boats: Boat[] = [];
  let voyages: MusterBoatVoyage[] = [];
  let disposed = false;

  const track = <T extends BufferGeometry>(geometry: T): T => {
    geometries.push(geometry);
    return geometry;
  };
  const material = (color: string, options: Partial<{ metalness: number; roughness: number; transparent: boolean; opacity: number }> = {}): MeshStandardMaterial => {
    const made = new MeshStandardMaterial({ color, roughness: options.roughness ?? 0.8, metalness: options.metalness ?? 0.1, ...(options.transparent ? { transparent: true, opacity: options.opacity ?? 1, depthWrite: false } : {}) });
    sharedMaterials.push(made);
    return made;
  };

  const buildPool = (): void => {
    // ExtrudeGeometry extrudes along +Z; turned a quarter about X it extrudes up instead.
    const hull = track(new ExtrudeGeometry(hullShape(), { depth: HULL_HEIGHT, bevelEnabled: false }));
    hull.rotateX(-Math.PI / 2);
    hull.rotateY(Math.PI);
    const rail = track(new BoxGeometry(HULL_BEAM * 1.02, 0.012, HULL_LENGTH * 0.62));
    const house = track(new BoxGeometry(0.12, 0.07, 0.12));
    const funnel = track(new CylinderGeometry(0.022, 0.026, 0.13, 10));
    const band = track(new CylinderGeometry(0.028, 0.028, 0.014, 10));
    const mast = track(new CylinderGeometry(0.005, 0.005, 0.2, 5));
    const pennant = track(new PlaneGeometry(0.08, 0.045));
    const troop = track(new BoxGeometry(0.03, 0.045, 0.03));
    const puff = track(new SphereGeometry(0.03, 8, 6));
    const hullMat = material("#3b2a1e");
    const railMat = material("#b08a46", { metalness: 0.6, roughness: 0.4 });
    const houseMat = material("#7a5a3a");
    const funnelMat = material("#262626", { metalness: 0.4, roughness: 0.6 });
    const smokeMat = material("#9a9a9a", { transparent: true, opacity: 0.45 });

    boats = Array.from({ length: MAX_BOATS }, () => {
      const root = new Group();
      const ownerMaterial = new MeshStandardMaterial({ color: "#ffffff", roughness: 0.7, side: DoubleSide });
      const add = (geometry: BufferGeometry, mat: MeshStandardMaterial, x: number, y: number, z: number): Mesh => {
        const mesh = new Mesh(geometry, mat);
        mesh.position.set(x, y, z);
        root.add(mesh);
        return mesh;
      };
      add(hull, hullMat, 0, -0.03, 0);
      add(rail, railMat, 0, DECK_Y - 0.024, -0.04);
      add(house, houseMat, 0, DECK_Y - 0.03 + 0.035, -0.19);
      add(funnel, funnelMat, 0, DECK_Y + 0.1, -0.19);
      add(band, railMat, 0, DECK_Y + 0.15, -0.19);
      add(mast, railMat, 0, DECK_Y + 0.07, 0.17);
      add(pennant, ownerMaterial, 0.04, DECK_Y + 0.14, 0.17).rotation.y = Math.PI / 2;
      for (const [x, z] of TROOP_SLOTS) add(troop, ownerMaterial, x, DECK_Y - 0.03 + 0.022, z);
      const smoke = Array.from({ length: SMOKE_PUFFS }, () => add(puff, smokeMat, 0, DECK_Y + 0.18, -0.19));
      root.visible = false;
      scene.add(root);
      return { root, ownerMaterial, smoke };
    });
  };

  const clear = (): void => { voyages = []; };
  const addVoyage = (voyage: MusterBoatVoyage): void => {
    if (voyages.length >= MAX_BOATS || voyage.path.length < 2) return;
    voyages.push(voyage);
  };

  const tick = (nowMs: number): void => {
    for (const boat of boats) boat.root.visible = false;
    if (voyages.length === 0 || disposed) return;
    if (boats.length === 0) buildPool();
    voyages.forEach((voyage, index) => {
      const boat = boats[index]!;
      // Distance-paced along the lane, so a bend doesn't change the speed.
      const lengths = voyage.path.slice(1).map((point, i) => Math.hypot(point.x - voyage.path[i]!.x, point.z - voyage.path[i]!.z));
      const total = lengths.reduce((sum, length) => sum + length, 0) || 1;
      const t = easeInOut(Math.min(1, Math.max(0, (nowMs - voyage.startAt) / Math.max(1, voyage.arriveAt - voyage.startAt))));
      let along = t * total;
      let seg = 0;
      while (seg < lengths.length - 1 && along > lengths[seg]!) along -= lengths[seg++]!;
      const from = voyage.path[seg]!;
      const to = voyage.path[seg + 1]!;
      const local = lengths[seg]! > 0 ? Math.min(1, along / lengths[seg]!) : 1;
      const x = from.x + (to.x - from.x) * local;
      const z = from.z + (to.z - from.z) * local;
      const bob = Math.sin(nowMs / 420 + index) * 0.008;
      boat.root.position.set(x, WATER_SURFACE_Y + bob, z);
      boat.root.rotation.set(Math.sin(nowMs / 610 + index) * 0.03, Math.atan2(to.x - from.x, to.z - from.z), 0);
      boat.ownerMaterial.color.set(voyage.ownerColor);
      boat.smoke.forEach((puff, i) => {
        const phase = ((nowMs / SMOKE_CYCLE_MS) + i / SMOKE_PUFFS) % 1;
        puff.position.set(0, DECK_Y + 0.17 + phase * 0.16, -0.19 - phase * 0.08);
        puff.scale.setScalar(0.6 + phase * 1.1);
      });
      boat.root.visible = true;
    });
  };

  const dispose = (): void => {
    disposed = true;
    voyages = [];
    for (const boat of boats) {
      scene.remove(boat.root);
      boat.ownerMaterial.dispose();
    }
    boats = [];
    for (const geometry of geometries) geometry.dispose();
    for (const made of sharedMaterials) made.dispose();
    geometries.length = 0;
    sharedMaterials.length = 0;
  };

  return { clear, addVoyage, tick, dispose };
};
