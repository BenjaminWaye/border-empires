// Holo-Locked Stack: the waystation's 3D model, described once as a list of
// parts so the instanced map overlay (client-map-3d-waystation-overlay.ts)
// and the one-shot opening effect (holo-crate-open-fx-3d.ts) build exactly
// the same thing. Site-local units: one tile = 1, y up from the ground, the
// camera-facing front is +z.
//
// Three armoured supply crates (gunmetal hulls, brass corner guards, a dark
// belt with a cyan light strip and an amber status light) sit on a hexagonal
// anti-grav pad. A hologram padlock floats above the stack, projected from an
// emitter on the top crate. The front-left crate is the one that opens: its
// door is tagged "door" (relative to its bottom hinge), the padlock "lock"
// (relative to LOCK_ANCHOR), and the lit cavity behind the door "interior".
import {
  AdditiveBlending, BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, DoubleSide, Euler,
  IcosahedronGeometry, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Quaternion, TorusGeometry, Vector3,
  type Material, type Texture
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyBuildingEnvMap } from "../client-map-3d-building-envmap/client-map-3d-building-envmap.js";

export type HoloGeometryKey = "hull" | "box" | "padBase" | "padDeck" | "ring" | "shackle" | "lockRing" | "keyhole" | "beam" | "core";
export type HoloMaterialKey = "hull" | "panel" | "brass" | "band" | "deck" | "glow" | "led" | "holo" | "holoBeam" | "interior";
export type HoloPartRole = "static" | "door" | "lock" | "interior";
export type HoloCratePart = {
  readonly geometry: HoloGeometryKey;
  readonly material: HoloMaterialKey;
  readonly role: HoloPartRole;
  /** Site-local for "static"/"interior", hinge-local for "door", anchor-local for "lock". */
  readonly matrix: Matrix4;
};

export const PAD_TOP = 0.075;
/** Where the padlock floats (site-local); it bobs and turns about this point. */
export const LOCK_ANCHOR = new Vector3(0.02, PAD_TOP + 0.66, 0.02);

type CratePose = { x: number; y: number; z: number; yaw: number; w: number; h: number; d: number };
/** The crate that opens, front-left on the pad. */
export const OPENER: CratePose = { x: -0.15, y: PAD_TOP, z: 0.1, yaw: 0.1, w: 0.34, h: 0.27, d: 0.3 };
const BACK: CratePose = { x: 0.17, y: PAD_TOP, z: -0.05, yaw: -0.14, w: 0.32, h: 0.27, d: 0.3 };
const TOP: CratePose = { x: 0.02, y: PAD_TOP + 0.27, z: 0.0, yaw: 0.06, w: 0.27, h: 0.21, d: 0.25 };

const poseMatrix = (pose: CratePose): Matrix4 =>
  new Matrix4().compose(new Vector3(pose.x, pose.y, pose.z), new Quaternion().setFromEuler(new Euler(0, pose.yaw, 0)), new Vector3(1, 1, 1));

/** The opener's door hinge: bottom front edge, site-local. Door parts are relative to this. */
export const DOOR_HINGE: Matrix4 = poseMatrix(OPENER).multiply(new Matrix4().makeTranslation(0, 0.035, OPENER.d / 2 + 0.006));
export const DOOR_W = OPENER.w * 0.8;
export const DOOR_H = OPENER.h * 0.74;

const local = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rotation?: Euler): Matrix4 =>
  new Matrix4().compose(new Vector3(x, y, z), rotation ? new Quaternion().setFromEuler(rotation) : new Quaternion(), new Vector3(sx, sy, sz));

const buildParts = (): HoloCratePart[] => {
  const parts: HoloCratePart[] = [];
  const add = (geometry: HoloGeometryKey, material: HoloMaterialKey, matrix: Matrix4, role: HoloPartRole = "static"): void => {
    parts.push({ geometry, material, role, matrix });
  };

  // Anti-grav pad: hex plinth, recessed deck, glowing ring and three brass emitters.
  add("padBase", "band", local(0, 0.025, 0, 1, 1, 1));
  add("padDeck", "deck", local(0, 0.062, 0, 1, 1, 1));
  add("ring", "glow", local(0, 0.052, 0, 1, 1, 1, new Euler(Math.PI / 2, 0, 0)));
  for (const angle of [Math.PI / 6, (Math.PI * 5) / 6, (Math.PI * 3) / 2]) {
    const ex = Math.cos(angle) * 0.4, ez = Math.sin(angle) * 0.4;
    add("box", "brass", local(ex, 0.08, ez, 0.06, 0.05, 0.06, new Euler(0, -angle, 0)));
    add("box", "glow", local(ex, 0.11, ez, 0.03, 0.012, 0.03));
  }

  const crate = (pose: CratePose, opener: boolean): void => {
    const at = poseMatrix(pose);
    const put = (geometry: HoloGeometryKey, material: HoloMaterialKey, m: Matrix4, role: HoloPartRole = "static"): void =>
      add(geometry, material, at.clone().multiply(m), role);
    const { w, h, d } = pose;
    put("hull", "hull", local(0, h / 2, 0, w, h, d));
    // Side and back armour panels (the opener's front is its door).
    put("box", "panel", local(w / 2 + 0.004, h * 0.52, 0, 0.012, h * 0.62, d * 0.7));
    put("box", "panel", local(-w / 2 - 0.004, h * 0.52, 0, 0.012, h * 0.62, d * 0.7));
    if (!opener) put("box", "panel", local(0, h * 0.52, d / 2 + 0.004, w * 0.78, h * 0.62, 0.012));
    // Belt with a cyan light strip on the front and the right side.
    // The opener's belt stops short of its front so it never shows through the open door.
    put("box", "band", local(0, h * 0.5, opener ? -0.006 : 0, w + 0.012, 0.034, opener ? d : d + 0.012));
    if (!opener) put("box", "glow", local(0, h * 0.5, d / 2 + 0.008, w * 0.56, 0.009, 0.006));
    put("box", "glow", local(w / 2 + 0.008, h * 0.5, 0, 0.006, 0.009, d * 0.5));
    put("box", "led", local(w / 2 - 0.045, h * 0.84, d / 2 + 0.005, 0.022, 0.016, 0.006));
    // Brass corner guards.
    const k = 0.04;
    for (const sx of [-1, 1]) for (const sy of [0, 1]) for (const sz of [-1, 1]) {
      put("hull", "brass", local(sx * (w / 2 - k / 2 + 0.005), sy ? h - k / 2 + 0.005 : k / 2 - 0.005, sz * (d / 2 - k / 2 + 0.005), k, k, k));
    }
    if (!opener) return;
    // Lit cavity behind the door, then the door itself (relative to its bottom hinge).
    put("box", "interior", local(0, h * 0.52, d / 2 + 0.003, DOOR_W * 0.96, DOOR_H * 0.94, 0.004), "interior");
    add("box", "panel", local(0, DOOR_H / 2, 0, DOOR_W, DOOR_H, 0.014), "door");
    add("box", "band", local(0, DOOR_H * 0.53, 0.009, DOOR_W * 0.92, 0.03, 0.006), "door");
    add("box", "glow", local(0, DOOR_H * 0.53, 0.013, DOOR_W * 0.6, 0.009, 0.004), "door");
    add("box", "brass", local(-DOOR_W / 2 + 0.03, DOOR_H - 0.03, 0.01, 0.03, 0.03, 0.008), "door");
    add("box", "brass", local(DOOR_W / 2 - 0.03, DOOR_H - 0.03, 0.01, 0.03, 0.03, 0.008), "door");
  };
  crate(BACK, false);
  crate(OPENER, true);
  crate(TOP, false);
  // Carry handles and the hologram emitter on the top crate.
  const topAt = poseMatrix(TOP);
  for (const hx of [-0.07, 0.07]) add("box", "brass", topAt.clone().multiply(local(hx, TOP.h + 0.012, 0, 0.018, 0.018, 0.13)));
  add("padDeck", "brass", topAt.clone().multiply(local(0, TOP.h + 0.008, 0, 0.13, 0.4, 0.13)));
  add("box", "glow", topAt.clone().multiply(local(0, TOP.h + 0.02, 0, 0.03, 0.01, 0.03)));
  // Projection cone from the emitter up to the padlock.
  add("beam", "holoBeam", local(LOCK_ANCHOR.x, (PAD_TOP + 0.5 + LOCK_ANCHOR.y - 0.06) / 2, LOCK_ANCHOR.z, 1, 1, 1));

  // Hologram padlock (anchor-local): body, shackle and a slow halo ring.
  add("box", "holo", local(0, -0.03, 0, 0.13, 0.1, 0.03), "lock");
  add("keyhole", "interior", local(0, -0.035, 0.016, 0.022, 0.04, 0.004), "lock");
  add("shackle", "holo", local(0, 0.02, 0, 1, 1, 1), "lock");
  add("lockRing", "holo", local(0, -0.01, 0, 1, 1, 1, new Euler(Math.PI / 2, 0, 0)), "lock");
  return parts;
};

export const HOLO_CRATE_PARTS: readonly HoloCratePart[] = buildParts();
export const holoPartSlot = (part: Pick<HoloCratePart, "geometry" | "material">): string => `${part.geometry}:${part.material}`;

export const createHoloCrateGeometries = (): Record<HoloGeometryKey, BufferGeometry> => {
  const shackle = new TorusGeometry(0.04, 0.009, 6, 18, Math.PI);
  const beamHeight = LOCK_ANCHOR.y - 0.06 - (PAD_TOP + 0.5);
  return {
    hull: new RoundedBoxGeometry(1, 1, 1, 2, 0.07),
    box: new BoxGeometry(1, 1, 1),
    padBase: new CylinderGeometry(0.45, 0.48, 0.05, 6),
    padDeck: new CylinderGeometry(0.4, 0.42, 0.025, 6),
    ring: new TorusGeometry(0.41, 0.011, 6, 42),
    shackle,
    lockRing: new TorusGeometry(0.1, 0.004, 4, 32),
    keyhole: new BoxGeometry(1, 1, 1),
    beam: new ConeGeometry(0.11, beamHeight, 16, 1, true).rotateX(Math.PI),
    core: new IcosahedronGeometry(0.045, 1)
  };
};

export const createHoloCrateMaterials = (environment?: Texture): Record<HoloMaterialKey, Material> => {
  const standard = (color: string, metalness: number, roughness: number): MeshStandardMaterial => {
    const material = new MeshStandardMaterial({ color, metalness, roughness });
    applyBuildingEnvMap(material, environment);
    return material;
  };
  const glow = standard("#0d3238", 0.2, 0.4);
  glow.emissive.set("#3fd8ee");
  glow.emissiveIntensity = 1.0;
  const led = standard("#3a2408", 0.2, 0.4);
  led.emissive.set("#ffaa33");
  led.emissiveIntensity = 1.6;
  const interior = standard("#06090c", 0.3, 0.8);
  interior.emissive.set("#3fd8ee");
  interior.emissiveIntensity = 0;
  const additive = (color: string, opacity: number): MeshBasicMaterial =>
    new MeshBasicMaterial({ toneMapped: false, color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
  return {
    hull: standard("#39414b", 0.74, 0.34),
    panel: standard("#4c5662", 0.6, 0.4),
    brass: standard("#b98d4a", 0.9, 0.3),
    band: standard("#1b1f24", 0.6, 0.5),
    deck: standard("#262c33", 0.55, 0.55),
    glow,
    led,
    holo: additive("#46d2e6", 0.42),
    holoBeam: additive("#46d2e6", 0.1),
    interior
  };
};
