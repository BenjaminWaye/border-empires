import { BoxGeometry, BufferGeometry, CircleGeometry, CylinderGeometry, ExtrudeGeometry, Quaternion, Shape, SphereGeometry, Vector3 } from "three";
import {
  SCOUT_ARM_REACH,
  SCOUT_BODY_RADIUS,
  SCOUT_POD,
  SCOUT_POD_Y,
  SCOUT_PROP_RADIUS,
  SCOUT_PROP_Y,
  bakeOcclusion,
  merge,
  placed,
  scoutPodCentres,
  up
} from "./client-map-3d-scout-drone-geometry.js";

// The Sentinel's arms, pods and rotors (client-map-3d-scout-drone-model.ts). Each arm leaves the
// sphere's side through a round shoulder joint and runs out, short and square, to an elbow block
// under the pod's inner end. The pods are short, chunky oval nacelles: a painted top with a
// darker inset, a graphite underside a little wider than it (so a dark band shows) and an LED at
// the outer tip. Above each, on a short hub, a large
// open three-blade rotor reaching well past the nacelle. Built once.

export type ScoutPodGeometry = {
  /** Graphite: shoulders, arms, elbows, the pods' undersides and the rotor hubs. */
  readonly graphite: BufferGeometry;
  /** The pods' painted tops. */
  readonly paint: BufferGeometry;
  /** The darker inset panel on each pod's top. */
  readonly inset: BufferGeometry;
};

/** Where each pod's LED sits, drone-local: at the pod's outer tip, just above its mid-line. */
export const scoutPodTip = (angle: number, out = new Vector3()): Vector3 => {
  const r = SCOUT_ARM_REACH + SCOUT_POD.halfLength + 0.002;
  return out.set(Math.sin(angle) * r, SCOUT_POD_Y + 0.003, Math.cos(angle) * r);
};

export const buildScoutPods = (): ScoutPodGeometry => {
  const graphite: BufferGeometry[] = [];
  const paint: BufferGeometry[] = [];
  const inset: BufferGeometry[] = [];
  const shoulder = new CylinderGeometry(0.024, 0.024, 0.018, 16);
  const beam = new BoxGeometry(0.013, 0.011, 1);
  const elbow = new CylinderGeometry(0.0115, 0.0115, 0.026, 12);
  const insetCap = new SphereGeometry(1, 16, 3, 0, Math.PI * 2, 0, Math.PI / 2);
  const topShell = new SphereGeometry(1, 24, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  const underShell = new SphereGeometry(1, 24, 3, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const hub = new CylinderGeometry(0.0062, 0.008, SCOUT_PROP_Y - SCOUT_POD_Y - SCOUT_POD.top + 0.004, 12);
  for (const { x, z, angle } of scoutPodCentres()) {
    const radial = new Vector3(Math.sin(angle), 0, Math.cos(angle));
    const facing = new Quaternion().setFromAxisAngle(up, angle); // local +Z along the arm
    // Shoulder: a round joint flush on the sphere's side, its axis along the arm.
    const shoulderAt = radial.clone().multiplyScalar(SCOUT_BODY_RADIUS - 0.002);
    graphite.push(placed(shoulder, shoulderAt, new Quaternion().setFromUnitVectors(up, radial)));
    // Arm: a short square beam from the shoulder to the elbow under the pod's inner end.
    const inner = SCOUT_BODY_RADIUS + 0.004;
    const outer = Math.hypot(x, z) - SCOUT_POD.halfLength + 0.012;
    const mid = radial.clone().multiplyScalar((inner + outer) / 2).setY(SCOUT_POD_Y - 0.006);
    graphite.push(placed(beam, mid, facing, new Vector3(1, 1, outer - inner)));
    const elbowAt = radial.clone().multiplyScalar(outer).setY(SCOUT_POD_Y - 0.006);
    graphite.push(placed(elbow, elbowAt, facing.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2))));
    // Pod: a flattened oval nacelle, long along the arm.
    const centre = new Vector3(x, SCOUT_POD_Y, z);
    paint.push(placed(topShell, centre, facing, new Vector3(SCOUT_POD.halfWidth, SCOUT_POD.top, SCOUT_POD.halfLength)));
    graphite.push(placed(underShell, centre, facing, new Vector3(SCOUT_POD.halfWidth * 1.04, SCOUT_POD.bottom, SCOUT_POD.halfLength * 1.04)));
    // The inset: a smaller, very slightly taller cap that only breaks the surface near the top.
    inset.push(placed(insetCap, centre, facing, new Vector3(SCOUT_POD.halfWidth * 0.62, SCOUT_POD.top + 0.0018, SCOUT_POD.halfLength * 0.68)));
    // The rotor hub: a short mast from the pod's top up to the rotor plane.
    graphite.push(placed(hub, new Vector3(x, (SCOUT_POD_Y + SCOUT_POD.top + SCOUT_PROP_Y) / 2, z)));
  }
  return {
    graphite: merge(graphite, [shoulder, beam, elbow, underShell, hub]),
    paint: bakeOcclusion(merge(paint, [topShell]), () => 1),
    inset: merge(inset, [insetCap])
  };
};

/**
 * One rotor: three broad blades with real width -- a clean planform tapering from root to a
 * rounded tip, pitched -- and a small spinner.
 */
export const buildScoutRotorBlades = (): BufferGeometry => {
  const R = SCOUT_PROP_RADIUS;
  const planform = new Shape();
  planform.moveTo(0.007, -0.014);
  planform.lineTo(R * 0.55, -0.013);
  planform.quadraticCurveTo(R * 0.92, -0.011, R, -0.002);
  planform.quadraticCurveTo(R * 0.98, 0.008, R * 0.85, 0.009);
  planform.lineTo(R * 0.45, 0.016);
  planform.lineTo(0.007, 0.014);
  planform.closePath();
  const blade = new ExtrudeGeometry(planform, { depth: 0.0024, bevelEnabled: false, curveSegments: 4 });
  blade.translate(0, 0, -0.0012);
  blade.rotateX(Math.PI / 2 - 0.24); // flat in the rotor plane, then pitched about its span
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < 3; k += 1) parts.push(placed(blade, new Vector3(), new Quaternion().setFromAxisAngle(up, (k * Math.PI * 2) / 3)));
  const spinner = new SphereGeometry(0.0085, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  parts.push(placed(spinner, new Vector3(0, 0.002, 0)));
  return merge(parts, [blade, spinner]);
};

/** The blur disc the blades become at speed. */
export const buildScoutRotorDisc = (): BufferGeometry => {
  const disc = new CircleGeometry(SCOUT_PROP_RADIUS, 32);
  disc.rotateX(-Math.PI / 2);
  return disc;
};
