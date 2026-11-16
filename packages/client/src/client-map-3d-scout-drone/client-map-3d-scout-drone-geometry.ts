import { BoxGeometry, BufferGeometry, CatmullRomCurve3, CircleGeometry, CylinderGeometry, Matrix4, Quaternion, TorusGeometry, TubeGeometry, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { buildRimBand, buildShell, shellRimOutline, type ShellStation } from "./client-map-3d-scout-drone-shell.js";
import { applyTopDownUvs, bakeOcclusion, smoothstep } from "./client-map-3d-scout-drone-surface.js";

// Geometry for the scout drone, the "Survey Quad" (client-map-3d-scout-drone-model.ts): a
// realistic, high-end mapping drone in drone-local units -- nose toward +Z, up +Y, about 0.6
// across the props. A sculpted body: a smooth domed shell, higher at the rear and middle and
// sloping to a pair of round obstacle-sensor lenses on the nose, a fine dark seam following the
// shell's outline with a thin polished trim line along its lower rim (the product-render edge
// highlight), and a rounded battery pack tucked up into the shell (a small brass latch and four
// charge LEDs on its back). Four carbon arms, each one clean tube tapering toward its tip, rising
// from the shoulders with a little dihedral, end in compact brushed-aluminium outrunner motors
// with brass caps; thin guard arcs follow the props. Ambient occlusion is baked
// into vertex colours (the shell's lower rim, the chassis under the shell, the arm roots). Static
// parts are merged per material. A single-instance hero asset: the shell is densely tessellated
// so the dome stays smooth up close. Props, gimbal and legs: -parts.ts. Built once.

export const SCOUT_ROTOR_COUNT = 4;
/** Body centre to motor centre, along each diagonal. */
export const SCOUT_ARM_REACH = 0.2;
export const SCOUT_PROP_RADIUS = 0.085;
/** Height of the props' plane above the body centre. */
export const SCOUT_PROP_Y = 0.08;
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
  { z: 0.11, halfWidth: 0.042, top: 0.029, rim: -0.018 },
  { z: 0.122, halfWidth: 0.027, top: 0.015, rim: -0.015 },
  { z: 0.128, halfWidth: 0.009, top: 0.0, rim: -0.011 }
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
  /** Satin graphite shell: top-down UVs (grain, hatch seam) and baked occlusion. */
  readonly shell: BufferGeometry;
  /** Matte battery pack and GPS puck: UVs (grain) and baked occlusion where the pack tucks into the shell. */
  readonly chassis: BufferGeometry;
  /** Carbon arms: cylinder UVs (weave) and occlusion at the roots. */
  readonly arms: BufferGeometry;
  /** Machined aluminium motor bells: cylinder UVs (brushing, cooling slots). */
  readonly bells: BufferGeometry;
  /** Satin black: the shell-to-battery seam, rear vent slats, sensor bezels and prop guards. */
  readonly frame: BufferGeometry;
  /** Polished dark trim: the fine line along the shell's lower rim that catches a specular edge. */
  readonly trim: BufferGeometry;
  /** Brass: motor caps and the battery latch. */
  readonly brass: BufferGeometry;
  /** Dark glass: the two obstacle-sensor lenses on the nose. */
  readonly glass: BufferGeometry;
  /** The four charge LEDs. */
  readonly leds: BufferGeometry;
};

export const buildScoutAirframe = (): ScoutAirframeGeometry => {
  // Shell and puck: grain/hatch UVs, and occlusion darkening toward the shell's lower rim.
  // Measured from the rim at that station (it drops into the chin at the nose), so the nose isn't
  // darkened just for sitting lower.
  const rimAt = (z: number): number => {
    for (let i = 0; i + 1 < SHELL.length; i += 1) {
      const a = SHELL[i]!;
      const b = SHELL[i + 1]!;
      if (z <= b.z) return a.rim + (b.rim - a.rim) * Math.max(0, (z - a.z) / (b.z - a.z));
    }
    return SHELL[SHELL.length - 1]!.rim;
  };
  const shellAo = (_x: number, y: number, z: number): number => 0.55 + 0.45 * smoothstep(0, 0.03, y - rimAt(z));
  const shell = bakeOcclusion(applyTopDownUvs(buildShell(SHELL), 0.07, SHELL_Z.min, SHELL_Z.max), shellAo);
  // Battery pack (occluded where it tucks up into the shell) and the matte GPS puck on top, which
  // shares its finish so it never flashes a hot highlight.
  const pack = new RoundedBoxGeometry(BATTERY.width, BATTERY.height, BATTERY.length, 4, BATTERY.radius);
  const puck = new CylinderGeometry(0.016, 0.018, 0.008, 16);
  const chassis = merge([
    bakeOcclusion(placed(pack, new Vector3(0, BATTERY.y, BATTERY.z), undefined, true), (_x, y) => 0.5 + 0.5 * smoothstep(-0.004, -0.02, y)),
    bakeOcclusion(placed(puck, new Vector3(0, 0.069, -0.045), undefined, true), () => 1)
  ], [pack, puck]);
  // The seam: a thin dark lip just inside the shell's outline, following its rim (which drops into
  // the chin at the nose) so it never pokes through the shell.
  const frame: BufferGeometry[] = [buildRimBand(SHELL, 0.965, 0.004)];
  // The trim: a hairline tube just under the shell's lower rim, for a thin specular edge line.
  const rimCurve = new CatmullRomCurve3(shellRimOutline(SHELL, 0.0006), true, "centripetal");
  const trim = new TubeGeometry(rimCurve, 96, 0.0011, 4, true);
  trim.deleteAttribute("uv");
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
  // Outrunner motors: short, wide bells, compact against the body.
  const bell = new CylinderGeometry(0.0175, 0.0187, 0.022, 28, 1, true);
  const cap = new CylinderGeometry(0.0102, 0.0157, 0.005, 24);
  const guard = new TorusGeometry(SCOUT_PROP_RADIUS + 0.012, 0.0028, 3, 16, Math.PI * 0.85);
  guard.rotateX(Math.PI / 2);
  const armAo = (x: number, _y: number, z: number): number => 0.55 + 0.45 * smoothstep(0.05, 0.11, Math.hypot(x, z));
  for (const { x, z, angle } of scoutRotorCentres()) {
    const dir = (r: number, y: number): Vector3 => new Vector3(Math.sin(angle) * r, y, Math.cos(angle) * r);
    // One clean tube from the shell's shoulder up to the motor (about 10 degrees of dihedral),
    // tapering to about half its root diameter at the tip.
    arms.push(rod(dir(0.05, 0.028), dir(SCOUT_ARM_REACH, SCOUT_MOTOR_Y), 0.0128, 0.0066, 14, true));
    bells.push(placed(bell, new Vector3(x, SCOUT_MOTOR_Y + 0.011, z), undefined, true));
    brass.push(placed(cap, new Vector3(x, SCOUT_MOTOR_Y + 0.0245, z)));
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
    trim,
    brass: merge(brass, [cap]),
    glass,
    leds
  };
};
