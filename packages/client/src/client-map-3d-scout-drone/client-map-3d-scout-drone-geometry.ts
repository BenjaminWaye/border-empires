import { BoxGeometry, BufferGeometry, CircleGeometry, CylinderGeometry, Matrix4, Quaternion, TorusGeometry, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { buildShell, type ShellStation } from "./client-map-3d-scout-drone-shell.js";
import { applyTopDownUvs, bakeOcclusion, smoothstep } from "./client-map-3d-scout-drone-surface.js";

// Geometry for the scout drone, the "Survey Quad" (client-map-3d-scout-drone-model.ts): a
// realistic, high-end mapping drone in drone-local units -- nose toward +Z, up +Y, about 0.6
// across the props. A sculpted body: a smooth domed shell, higher at the rear and middle and
// sloping to a pair of round obstacle-sensor lenses on the nose, a fine dark seam following the
// shell's outline, and a rounded battery pack tucked up into the shell (a small brass latch and
// four charge LEDs on its back). Four carbon arms, each one clean tapered
// tube rising from the shoulders with a little dihedral, end in short, wide brushed-aluminium
// outrunner motors with brass caps; thin guard arcs follow the props. Ambient occlusion is baked
// into vertex colours (the shell's lower rim, the chassis under the shell, the arm roots). Static
// parts are merged per material. A single-instance hero asset: the shell is densely tessellated
// so the dome stays smooth up close. Props, gimbal and legs: -parts.ts. Built once.

export const SCOUT_ROTOR_COUNT = 4;
/** Body centre to motor centre, along each diagonal. */
export const SCOUT_ARM_REACH = 0.2;
export const SCOUT_PROP_RADIUS = 0.085;
/** Height of the props' plane above the body centre. */
export const SCOUT_PROP_Y = 0.086;
/** Height of the arm tips (the motor bells' bases), set by the arms' dihedral. */
export const SCOUT_MOTOR_Y = 0.05;
export const SCOUT_GIMBAL = { y: -0.074, z: 0.09 } as const;
export const SCOUT_STROBE = { y: 0.03, z: -0.124 } as const;
export const SCOUT_STATUS_LIGHT = { y: 0.068, z: -0.075 } as const;
/** Where each leg's hinge sits on the chassis side (X is mirrored). */
export const SCOUT_LEG_HINGE = { x: 0.046, y: -0.03 } as const;
/** The four charge LEDs on the chassis's back face: x positions, and their shared y/z. */
export const SCOUT_CHARGE_LEDS = { xs: [-0.012, -0.004, 0.004, 0.012], y: -0.011, z: -0.0907 } as const;

const SHELL_Z = { min: -0.125, max: 0.125 } as const;
/** The upper shell: a dome rising toward the rear and middle, sloping down to the nose, where the rim drops into a chin over the battery. */
const SHELL: readonly ShellStation[] = [
  { z: -0.118, halfWidth: 0.05, top: 0.05, rim: 0.0 },
  { z: -0.085, halfWidth: 0.064, top: 0.064, rim: 0.0 },
  { z: -0.02, halfWidth: 0.068, top: 0.068, rim: 0.0 },
  { z: 0.045, halfWidth: 0.064, top: 0.058, rim: -0.006 },
  { z: 0.09, halfWidth: 0.053, top: 0.04, rim: -0.02 },
  { z: 0.112, halfWidth: 0.04, top: 0.028, rim: -0.018 },
  { z: 0.127, halfWidth: 0.008, top: 0.002, rim: -0.008 }
];

/** Motor centres in drone-local X/Z (front-right, front-left, rear-left, rear-right). */
export const scoutRotorCentres = (): Array<{ x: number; z: number; angle: number }> => {
  const centres: Array<{ x: number; z: number; angle: number }> = [];
  for (let k = 0; k < SCOUT_ROTOR_COUNT; k += 1) {
    const angle = Math.PI / 4 + (k * Math.PI) / 2;
    centres.push({ x: Math.sin(angle) * SCOUT_ARM_REACH, z: Math.cos(angle) * SCOUT_ARM_REACH, angle });
  }
  return centres;
};

const scratch = new Matrix4();
const unit = new Vector3(1, 1, 1);
export const up = new Vector3(0, 1, 0);

/** A non-indexed copy placed at `pos` with `rot`, ready to merge; drops UVs unless `keepUv`. */
export const placed = (geometry: BufferGeometry, pos: Vector3, rot: Quaternion = new Quaternion(), keepUv = false): BufferGeometry => {
  const clone = (geometry.index ? geometry.toNonIndexed() : geometry.clone()).applyMatrix4(scratch.compose(pos, rot, unit));
  if (!keepUv && clone.getAttribute("uv")) clone.deleteAttribute("uv");
  return clone;
};

/** Merges parts (all with the same attributes) and disposes them and any `sources`. */
export const merge = (parts: BufferGeometry[], sources: BufferGeometry[] = []): BufferGeometry => {
  const merged = mergeGeometries(parts, false);
  for (const part of [...parts, ...sources]) part.dispose();
  if (!merged) throw new Error("scout drone: geometry merge failed");
  merged.computeBoundingSphere();
  return merged;
};

/** A rod from `from` to `to`, `radius` at `from` tapering to `tipRadius` at `to`. */
export const rod = (from: Vector3, to: Vector3, radius: number, tipRadius = radius, segments = 8, keepUv = false): BufferGeometry => {
  const dir = to.clone().sub(from);
  const cylinder = new CylinderGeometry(tipRadius, radius, dir.length(), segments);
  const part = placed(cylinder, from.clone().add(to).multiplyScalar(0.5), new Quaternion().setFromUnitVectors(up, dir.normalize()), keepUv);
  cylinder.dispose();
  return part;
};

// The battery pack: a rounded pack, narrower and shorter than the shell, tucked up into it.
const BATTERY = { width: 0.08, height: 0.034, length: 0.135, radius: 0.016, y: -0.013, z: -0.0225 } as const;
const BATTERY_REAR_Z = BATTERY.z - BATTERY.length / 2;

export type ScoutAirframeGeometry = {
  /** Satin graphite shell and GPS puck: top-down UVs (grain, hatch seam) and baked occlusion. */
  readonly shell: BufferGeometry;
  /** Matte battery pack: UVs (grain) and baked occlusion where it tucks into the shell. */
  readonly chassis: BufferGeometry;
  /** Carbon arms: cylinder UVs (weave) and occlusion at the roots. */
  readonly arms: BufferGeometry;
  /** Machined aluminium motor bells: cylinder UVs (brushing, cooling slots). */
  readonly bells: BufferGeometry;
  /** Satin black: the shell-to-battery seam, rear vent slats, sensor bezels and prop guards. */
  readonly frame: BufferGeometry;
  /** Brass: motor caps and the battery latch. */
  readonly brass: BufferGeometry;
  /** Dark glass: the two obstacle-sensor lenses on the nose. */
  readonly glass: BufferGeometry;
  /** The four charge LEDs. */
  readonly leds: BufferGeometry;
};

export const buildScoutAirframe = (): ScoutAirframeGeometry => {
  // Shell and puck: grain/hatch UVs, and occlusion darkening toward the shell's lower rim.
  const shellAo = (_x: number, y: number): number => 0.55 + 0.45 * smoothstep(0, 0.03, y);
  const shellParts = [buildShell(SHELL), placed(new CylinderGeometry(0.016, 0.018, 0.008, 16), new Vector3(0, 0.069, -0.045))];
  const shell = merge(shellParts.map((g) => bakeOcclusion(applyTopDownUvs(g, 0.07, SHELL_Z.min, SHELL_Z.max), shellAo)));
  // Battery pack: occluded where it tucks up into the shell.
  const pack = new RoundedBoxGeometry(BATTERY.width, BATTERY.height, BATTERY.length, 4, BATTERY.radius);
  const chassis = bakeOcclusion(placed(pack, new Vector3(0, BATTERY.y, BATTERY.z), undefined, true), (_x, y) => 0.5 + 0.5 * smoothstep(-0.004, -0.02, y));
  pack.dispose();
  // The seam: a thin dark lip just inside the shell's outline, where shell meets battery.
  const frame: BufferGeometry[] = [buildShell(SHELL.map((s) => ({ ...s, halfWidth: s.halfWidth * 0.965, top: 0.0005, rim: -0.004 })))];
  const slat = new BoxGeometry(0.046, 0.0035, 0.006);
  for (let v = 0; v < 3; v += 1) frame.push(placed(slat, new Vector3(0, 0.012 + v * 0.011, -0.12)));
  const brass: BufferGeometry[] = [placed(new BoxGeometry(0.014, 0.005, 0.003), new Vector3(0, -0.021, BATTERY_REAR_Z - 0.0012))]; // battery latch
  const ledBox = new BoxGeometry(0.0045, 0.0028, 0.0016);
  const leds = merge(SCOUT_CHARGE_LEDS.xs.map((x) => placed(ledBox, new Vector3(x, SCOUT_CHARGE_LEDS.y, SCOUT_CHARGE_LEDS.z))), [ledBox]);
  // Two round obstacle-sensor lenses side by side on the nose slope, each in a thin dark bezel.
  const slope = new Vector3(0, 0.86, 0.51).normalize();
  const facing = new Quaternion().setFromUnitVectors(up, slope);
  const bezel = new CylinderGeometry(0.0088, 0.0088, 0.004, 20);
  const lensDisc = new CircleGeometry(0.0066, 20);
  lensDisc.rotateX(-Math.PI / 2); // face +Y, then turn with the bezel onto the slope
  const lenses: BufferGeometry[] = [];
  for (const x of [-0.016, 0.016]) {
    const at = new Vector3(x, 0.0315, 0.1035);
    frame.push(placed(bezel, at, facing));
    lenses.push(placed(lensDisc, at.clone().addScaledVector(slope, 0.0021), facing));
  }
  const glass = merge(lenses, [bezel, lensDisc]);
  // Arms: a short downward bend at the root, then up with about 10 degrees of dihedral.
  const arms: BufferGeometry[] = [];
  const bells: BufferGeometry[] = [];
  // Outrunner motors: short, wide bells.
  const bell = new CylinderGeometry(0.0205, 0.022, 0.026, 28, 1, true);
  const cap = new CylinderGeometry(0.012, 0.0185, 0.006, 24);
  const guard = new TorusGeometry(SCOUT_PROP_RADIUS + 0.012, 0.0028, 3, 16, Math.PI * 0.85);
  guard.rotateX(Math.PI / 2);
  const armAo = (x: number, _y: number, z: number): number => 0.55 + 0.45 * smoothstep(0.05, 0.11, Math.hypot(x, z));
  for (const { x, z, angle } of scoutRotorCentres()) {
    const dir = (r: number, y: number): Vector3 => new Vector3(Math.sin(angle) * r, y, Math.cos(angle) * r);
    // One clean tapered tube from the shell's shoulder up to the motor (about 10 degrees of dihedral).
    arms.push(rod(dir(0.05, 0.028), dir(SCOUT_ARM_REACH, SCOUT_MOTOR_Y), 0.0125, 0.0078, 14, true));
    bells.push(placed(bell, new Vector3(x, SCOUT_MOTOR_Y + 0.013, z), undefined, true));
    brass.push(placed(cap, new Vector3(x, SCOUT_MOTOR_Y + 0.029, z)));
    // The guard arc around the prop's outer side, on two struts from the motor base. The torus
    // arc starts at +X and sweeps toward +Z; turn it so it is centred on the outward direction.
    const outward = Math.atan2(x, z);
    const guardY = SCOUT_PROP_Y - 0.004;
    frame.push(placed(guard, new Vector3(x, guardY, z), new Quaternion().setFromAxisAngle(up, Math.PI * 0.425 - Math.atan2(z, x))));
    for (const spread of [-0.9, 0.9]) {
      const a = outward + spread;
      const ring = new Vector3(x + Math.sin(a) * (SCOUT_PROP_RADIUS + 0.012), guardY, z + Math.cos(a) * (SCOUT_PROP_RADIUS + 0.012));
      frame.push(rod(new Vector3(x, SCOUT_MOTOR_Y, z), ring, 0.0022, 0.0018, 4));
    }
  }
  return {
    shell,
    chassis,
    arms: bakeOcclusion(merge(arms), armAo),
    bells: merge(bells, [bell]),
    frame: merge(frame, [slat, guard]),
    brass: merge(brass, [cap]),
    glass,
    leds
  };
};
