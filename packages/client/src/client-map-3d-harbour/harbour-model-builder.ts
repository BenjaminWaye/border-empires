// Builds the harbour pieces (client-map-3d-harbour-parts.ts) once, as merged
// geometry per material, in the piece's own frame: tile units, x and z across
// -0.5..0.5, y up from the land surface, facing +z (the sea). The overlay then
// draws each placed piece as ONE instance per material mesh, so the model's
// detail costs triangles, never per-tile instance slots.
import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Material keys, matched by createDockOverlay's material table. */
export const HARBOUR_MATERIALS = [
  "blackMarble", "charcoalMarble", "stone", "plate", "iron", "ironDark", "brass",
  "brassDark", "glass", "crate", "hull", "lampGlow", "status"
] as const;
export type HarbourMaterial = (typeof HARBOUR_MATERIALS)[number];

export type Vec3 = readonly [number, number, number];

export type HarbourModelBuilder = {
  /** Box centred at (x, y, z); `rot` is [rx, ry, rz] (YXZ order). */
  readonly box: (m: HarbourMaterial, x: number, y: number, z: number, w: number, h: number, d: number, rot?: Vec3) => void;
  /** Upright cylinder centred at (x, y, z). */
  readonly cylinder: (m: HarbourMaterial, x: number, y: number, z: number, radius: number, height: number, rot?: Vec3) => void;
  /** Hemisphere standing on y. */
  readonly dome: (m: HarbourMaterial, x: number, y: number, z: number, radius: number) => void;
  /** Horizontal torus (a band round a post or tank). */
  readonly ring: (m: HarbourMaterial, x: number, y: number, z: number, radius: number, tube: number) => void;
  /** Cylinder of the given radius from a to b. */
  readonly rod: (m: HarbourMaterial, a: Vec3, b: Vec3, radius: number) => void;
  /** Draw in a local frame moved to (x, y, z), turned ry about y and then pitched rx about x. */
  readonly frame: (x: number, y: number, z: number, ry: number, draw: () => void, rx?: number) => void;
  /** Mark what `draw` adds as core: kept on a shrunk slipway. */
  readonly core: (draw: () => void) => void;
};

type Item = { readonly material: HarbourMaterial; readonly geometry: BufferGeometry; readonly core: boolean };

// Fewer sides on thin parts: they read the same and keep the 2D projection small.
const sidesFor = (radius: number): number => (radius < 0.015 ? 6 : radius < 0.035 ? 10 : 16);

const UP = new Vector3(0, 1, 0);

export const buildHarbourModel = (draw: (b: HarbourModelBuilder) => void): readonly Item[] => {
  const items: Item[] = [];
  let frame = new Matrix4();
  let core = false;
  const euler = new Euler(0, 0, 0, "YXZ");
  const quaternion = new Quaternion();
  const local = new Matrix4();

  const add = (material: HarbourMaterial, geometry: BufferGeometry, position: Vector3, rotation: Quaternion, scale: Vector3): void => {
    local.compose(position, rotation, scale);
    geometry.applyMatrix4(local).applyMatrix4(frame);
    items.push({ material, geometry, core });
  };
  const rotationOf = (rot: Vec3 | undefined): Quaternion =>
    quaternion.setFromEuler(euler.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0, "YXZ"));

  const builder: HarbourModelBuilder = {
    box: (m, x, y, z, w, h, d, rot) => add(m, new BoxGeometry(1, 1, 1), new Vector3(x, y, z), rotationOf(rot), new Vector3(w, h, d)),
    cylinder: (m, x, y, z, radius, height, rot) =>
      add(m, new CylinderGeometry(1, 1, 1, sidesFor(radius)), new Vector3(x, y, z), rotationOf(rot), new Vector3(radius, height, radius)),
    dome: (m, x, y, z, radius) =>
      add(m, new SphereGeometry(1, sidesFor(radius), 5, 0, Math.PI * 2, 0, Math.PI / 2), new Vector3(x, y, z), rotationOf(undefined), new Vector3(radius, radius, radius)),
    ring: (m, x, y, z, radius, tube) =>
      add(m, new TorusGeometry(1, tube / radius, 5, sidesFor(radius) + 4).rotateX(Math.PI / 2), new Vector3(x, y, z), rotationOf(undefined), new Vector3(radius, radius, radius)),
    rod: (m, a, b, radius) => {
      const from = new Vector3(...a);
      const along = new Vector3(...b).sub(from);
      const length = along.length();
      const turn = new Quaternion().setFromUnitVectors(UP, along.clone().normalize());
      add(m, new CylinderGeometry(1, 1, 1, sidesFor(radius)), from.addScaledVector(along, 0.5), turn, new Vector3(radius, length, radius));
    },
    frame: (x, y, z, ry, drawInFrame, rx = 0) => {
      const outer = frame;
      const turn = new Matrix4().makeRotationY(ry).multiply(new Matrix4().makeRotationX(rx)).setPosition(x, y, z);
      frame = outer.clone().multiply(turn);
      drawInFrame();
      frame = outer;
    },
    core: (drawCore) => {
      const outer = core;
      core = true;
      drawCore();
      core = outer;
    }
  };
  draw(builder);
  return items;
};

/** Merges the items `keep` selects into one geometry per material, after `post` (the shrunk slipway's scale and offset). */
export const mergeByMaterial = (
  items: readonly Item[],
  keep: (item: Item) => boolean = () => true,
  post?: Matrix4
): Map<HarbourMaterial, BufferGeometry> => {
  const merged = new Map<HarbourMaterial, BufferGeometry>();
  for (const material of HARBOUR_MATERIALS) {
    const parts = items.filter((item) => item.material === material && keep(item)).map((item) => (post ? item.geometry.clone().applyMatrix4(post) : item.geometry));
    if (parts.length === 0) continue;
    const geometry = mergeGeometries(parts, false);
    if (!geometry) throw new Error(`harbour: could not merge ${material}`);
    if (post) for (const part of parts) part.dispose();
    geometry.computeBoundingSphere();
    merged.set(material, geometry);
  }
  return merged;
};

export const disposeHarbourItems = (items: readonly Item[]): void => {
  for (const item of items) item.geometry.dispose();
};
