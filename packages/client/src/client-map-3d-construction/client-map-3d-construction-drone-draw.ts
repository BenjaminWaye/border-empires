import { Color, Euler, Matrix4, Quaternion, Vector3 } from "three";
import {
  DRONE_BLADES_PER_ROTOR,
  DRONE_DUCT_RADIUS,
  DRONE_HULL,
  DRONE_ROTOR_REACH,
  DRONE_ROTORS
} from "./client-map-3d-construction-pod-assets.js";
import {
  DRONE_BELLY,
  POD_AFC_CAP_Y,
  bump,
  droneLeanAt,
  droneLineEndAt,
  dronePositionAt,
  droneRotorAt,
  droneScaleAt,
  droneYawAt,
  smoothstep,
  window01,
  type PodFlightPlan
} from "./client-map-3d-construction-pod-flight.js";
import type { PodInstanceWriter } from "./client-map-3d-construction-pod-writer.js";

// The AFC's courier drone (client-map-3d-construction-pod-fx.ts): a blackened-steel hull on four
// brass arms ending in ducted fans, a cyan belly light, nav lights, and the winch line the pod
// hangs from. It flies the drone path of client-map-3d-construction-pod-flight.ts, leaning like a
// quadcopter, and throws a shadow and (over the site) a landing light and a swirl of rotor-wash dust.

export type DeliveryAnchor = {
  // The landing point (the site's parts stack) in scene coordinates.
  readonly landX: number;
  readonly landY: number;
  readonly landZ: number;
  readonly plan: PodFlightPlan;
  readonly seed: number;
};

const ROTOR_BLUR = new Color(0.62, 0.9, 1);
const BELLY = new Color(0.31, 0.85, 1);
const NAV_FRONT = new Color(1, 0.95, 0.85);
const NAV_REAR = new Color(1, 0.25, 0.15);
const LANDING_LIGHT = new Color(0.4, 0.85, 1);
const CROWN = new Color(0.75, 0.97, 1);
const WHITE = new Color(1, 1, 1);
// Blade spin, radians per ms at full rotor speed: fast enough to read as spinning, slow enough
// that two crossed blades do not strobe into a static star at 60 fps.
const SPIN_PER_MS = 0.047;
const WASH_DUST = 14;
const down = new Vector3(0, -1, 0);

export type DroneDrawer = (writer: PodInstanceWriter, delivery: DeliveryAnchor, age: number) => void;

export const createDroneDrawer = (): DroneDrawer => {
  const drone = new Matrix4();
  const local = new Matrix4();
  const world = new Matrix4();
  const quat = new Quaternion();
  const partQuat = new Quaternion();
  const euler = new Euler(0, 0, 0, "YXZ");
  const pos = new Vector3();
  const scl = new Vector3();
  const hook = new Vector3();
  const lineDir = new Vector3();
  const tint = new Color();
  const at = { x: 0, y: 0, z: 0 };
  const lineEnd = { x: 0, y: 0, z: 0 };
  const up = new Vector3(0, 1, 0);

  // A part in drone-local space: position, yaw, size.
  const part = (writer: PodInstanceWriter, key: "drone" | "frame" | "duct", x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number): void => {
    local.compose(pos.set(x, y, z), partQuat.setFromAxisAngle(up, yaw), scl.set(sx, sy, sz));
    writer.put(key, world.multiplyMatrices(drone, local));
  };
  // A glow or light riding on the drone (drone-local position), tinted.
  const light = (writer: PodInstanceWriter, key: "puff" | "glow", x: number, y: number, z: number, size: number, color: Color, strength: number): void => {
    if (strength <= 0.003) return;
    local.compose(pos.set(x, y, z), partQuat.identity(), scl.set(size, size, size));
    writer.put(key, world.multiplyMatrices(drone, local), tint.copy(color).multiplyScalar(Math.min(1, strength)));
  };

  return (writer, delivery, age) => {
    const { plan, seed, landX, landY, landZ } = delivery;
    if (age >= plan.droneGoneAtMs) return;
    const size = droneScaleAt(plan, age);
    dronePositionAt(plan, age, at);
    const airborne = smoothstep(window01(age, 100, 400));
    euler.set(droneLeanAt(plan, age), droneYawAt(plan, age), 0.03 * airborne * Math.sin(age * 0.008 + seed));
    quat.setFromEuler(euler);
    drone.compose(pos.set(landX + at.x, landY + at.y, landZ + at.z), quat, scl.set(size, size, size));

    if (size > 0.01) {
      part(writer, "drone", 0, 0, 0, 0, DRONE_HULL.width, DRONE_HULL.height, DRONE_HULL.length);
      part(writer, "frame", 0, DRONE_HULL.height / 2 + 0.008, -0.01, 0, 0.05, 0.018, DRONE_HULL.length * 0.75); // dorsal spine
      part(writer, "frame", 0, -DRONE_BELLY - 0.006, 0, 0, 0.03, 0.014, 0.03); // winch hook
      const rotor = droneRotorAt(plan, age);
      for (let k = 0; k < DRONE_ROTORS; k += 1) {
        const angle = Math.PI / 4 + (k * Math.PI) / 2;
        const ax = Math.sin(angle) * DRONE_ROTOR_REACH;
        const az = Math.cos(angle) * DRONE_ROTOR_REACH;
        part(writer, "frame", ax / 2, 0.006, az / 2, angle, 0.02, 0.016, DRONE_ROTOR_REACH);
        part(writer, "duct", ax, 0.012, az, 0, 1, 1, 1);
        part(writer, "drone", ax, 0.008, az, 0, 0.022, 0.03, 0.022); // motor hub
        // Neighbouring rotors counter-rotate, like a real quad's.
        const spin = (k % 2 === 0 ? 1 : -1) * age * SPIN_PER_MS * rotor + seed + k;
        for (let b = 0; b < DRONE_BLADES_PER_ROTOR; b += 1) part(writer, "drone", ax, 0.02, az, spin + (b * Math.PI) / DRONE_BLADES_PER_ROTOR, DRONE_DUCT_RADIUS * 1.7, 0.004, 0.016);
        light(writer, "glow", ax, 0.02, az, DRONE_DUCT_RADIUS * 2, ROTOR_BLUR, 0.08 + 0.14 * rotor);
      }
      light(writer, "puff", 0, -DRONE_HULL.height / 2, 0.05, 0.012, BELLY, 0.9);
      light(writer, "puff", 0, 0, DRONE_HULL.length / 2 + 0.004, 0.01, NAV_FRONT, 0.85);
      if ((age + seed) % 720 < 130) light(writer, "puff", 0, 0.012, -DRONE_HULL.length / 2 - 0.004, 0.012, NAV_REAR, 1);
    }

    // The winch line, from the hook to wherever its end is (into the chamber, the pod's lid, or reeling in).
    if (droneLineEndAt(plan, age, lineEnd) && size > 0.01) {
      hook.set(0, -DRONE_BELLY - 0.012, 0).applyMatrix4(drone);
      lineDir.set(landX + lineEnd.x, landY + lineEnd.y, landZ + lineEnd.z).sub(hook);
      const length = lineDir.length();
      if (length > 0.004) {
        partQuat.setFromUnitVectors(down, lineDir.divideScalar(length));
        world.compose(hook, partQuat, scl.set(1, length, 1));
        writer.put("line", world);
      }
    }

    // Shadow: tight and dark low down, broad and faint high up, hidden under the AFC itself.
    const clearOfAfc = Math.min(1, Math.hypot(at.x - plan.fromX, at.z - plan.fromZ) / 1.1);
    writer.putAt("shadow", landX + at.x, landY + 0.011, landZ + at.z, 0.5 * (1 + 0.35 * at.y) * size, WHITE, 0.42 * Math.max(0, 1 - at.y / 2.8) * clearOfAfc * size);

    // The crown glows as the winch draws the freshly printed pod up out of it.
    const crown = bump(window01(age, plan.hoistAtMs - 80, 560));
    writer.putAt("glow", landX + plan.fromX, landY + POD_AFC_CAP_Y + 0.01, landZ + plan.fromZ, 0.55, CROWN, 0.55 * crown);

    // Over the site: the landing light on the stack, and rotor wash whipping dust round in a swirl.
    const station = window01(age, plan.lowerAtMs - 250, 350) * (1 - window01(age, plan.returnAtMs + 150, 450));
    writer.putAt("glow", landX, landY + 0.012, landZ, 0.5, LANDING_LIGHT, 0.3 * station);
    if (station > 0) {
      const t = age - plan.lowerAtMs;
      for (let i = 0; i < WASH_DUST; i += 1) {
        // Each puff rides outward on the wash and is replaced, circling as it goes.
        const life = (((i * 0.37 + t * 0.0007) % 1) + 1) % 1;
        const angle = (i / WASH_DUST) * Math.PI * 2 + seed + t * 0.0035 + life * 1.2;
        const r = 0.12 + 0.34 * life;
        const puff = 0.042 * Math.sin(Math.PI * life) * station;
        if (puff <= 0.002) continue;
        world.compose(pos.set(landX + Math.cos(angle) * r, landY + 0.02 + 0.06 * life, landZ + Math.sin(angle) * r), partQuat.identity(), scl.set(puff, puff * 0.7, puff));
        writer.put("dust", world);
      }
    }
  };
};
