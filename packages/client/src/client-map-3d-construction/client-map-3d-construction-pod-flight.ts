// The delivery of a parts pod from the owner's AFC to a construction site by the AFC's courier
// drone (docs/construction-animation-plan.md, "Supply pods"), as pure maths of (plan, age) so the
// renderer, the crate stack and the tests all read the same timeline. Three-free.
//
// Beats, in order (ages in ms from spawn):
//   fabricate  the drone spools up off the AFC's crown and lowers its winch line into the glass
//              fabrication chamber, where the AFC prints the pod bottom-up
//   hoist      the winch reels the pod up out of the crown until it hangs under the drone
//   cruise     the drone flies a banked low-altitude arc to a hover over the parts stack, the pod
//              swinging on its line as the drone speeds up and brakes
//   lower      the drone holds its hover and winches the pod down onto the stack
//   unpack     the line lets go and reels in; the pod's lid pops, its walls fold open and the empty
//              frame collapses, leaving the crates
// Meanwhile the drone turns for home, flies back over the same arc and docks in the AFC's crown.
// Everything is fabricated at the AFC and carried over at low altitude: nothing comes from orbit.
//
// Positions are local to the landing point (the site's parts stack on the ground), with the AFC
// at (fromX, 0, fromZ). The AFC's surface height is taken to be the site's. The pod's position is
// its bottom centre; the drone's is its hull centre.

export type PodPoint = { x: number; y: number; z: number };

export type PodStage = "fabricate" | "hoist" | "cruise" | "lower" | "unpack" | "done";
export type DroneStage = "spool" | "hoist" | "cruise" | "hover" | "return" | "dock" | "done";

export type PodFlightPlan = {
  readonly fromX: number;
  readonly fromZ: number;
  readonly distance: number;
  // Heading of the outbound trip on the ground plane (radians, about +Y; 0 faces +Z).
  readonly heading: number;
  readonly cruiseY: number;
  readonly hoistAtMs: number;
  readonly cruiseAtMs: number;
  readonly lowerAtMs: number;
  readonly touchdownAtMs: number;
  readonly returnAtMs: number;
  readonly dockAtMs: number;
  readonly droneGoneAtMs: number;
  readonly endAtMs: number;
};

export const POD_FABRICATE_MS = 620;
export const POD_HOIST_MS = 440;
const TRANSIT_BASE_MS = 520;
// Transit grows with distance and is not capped by distance: a site far from its AFC really is far
// from where its parts are made, and the flight shows it. The one limit is the phase itself: the
// site's stack stands empty until its pod lands, so the caller passes a time budget (see
// podTransitBudgetMs) and a trip that would overrun it is flown faster instead.
const TRANSIT_MS_PER_TILE = 135;
const MIN_TRANSIT_MS = 400;
// Flying home empty is quicker.
const RETURN_SHARE = 0.8;
export const POD_LOWER_MS = 900;
// The line lets go and reels in while the drone turns for home.
export const POD_RELEASE_MS = 300;
export const DRONE_DOCK_MS = 340;
export const POD_UNPACK_MS = 1_060;

// The AFC's geometry (client-map-3d-fabrication-complex.ts): the glass chamber is centred at
// 0.46 and the crown's top cap sits at 1.11, so the pod is printed at chamber height and
// winched out through the crown; the drone parks just above the cap.
export const POD_CHAMBER_Y = 0.39;
export const POD_AFC_CAP_Y = 1.18;
export const DRONE_PARKED_Y = 1.24;
export const DRONE_AFC_HOVER_Y = 1.66;
export const DRONE_SITE_HOVER_Y = 1.05;
// Hook under the drone's hull, line length, and the pod's own height (pod assets): the pod's
// bottom hangs this far below the drone's centre.
export const DRONE_BELLY = 0.035;
export const POD_SLING = 0.1;
export const POD_BODY_HEIGHT = 0.14;
const HANG = DRONE_BELLY + POD_SLING + POD_BODY_HEIGHT;
// After letting go of its load the drone bobs up.
const RELEASE_RISE = 0.07;
const CRUISE_BASE = 0.25;
const CRUISE_PER_TILE = 0.06;
const CRUISE_MAX_EXTRA = 0.75;
// The climb-out control point overshoots the cruise line a little before levelling off.
const CLIMB_OVERSHOOT = 0.1;
// How far short of the site (as a share of the trip) the arc starts to flatten into its hover.
const APPROACH_SHARE = 0.22;
// The highest anything in a delivery can ever be: the drone at its cruise cap plus the overshoot.
export const POD_MAX_Y = DRONE_AFC_HOVER_Y + CRUISE_MAX_EXTRA + CLIMB_OVERSHOOT;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
export const smoothstep = (t: number): number => t * t * (3 - 2 * t);
export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
export const easeOutBack = (t: number): number => {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};
// 0 -> 1 -> 0 over t in 0..1.
export const bump = (t: number): number => (t <= 0 || t >= 1 ? 0 : Math.sin(Math.PI * t));
// Progress of `age` through the window [start, start + span], clamped.
export const window01 = (age: number, start: number, span: number): number => clamp01((age - start) / span);

// The share of a build phase a delivery may take to land: builds take minutes, so a short phase
// would otherwise spend most of its time with an empty stack waiting on a distant AFC.
const PHASE_SHARE_TO_LAND = 0.25;
export const podTransitBudgetMs = (phaseMs: number): number =>
  Math.max(MIN_TRANSIT_MS, phaseMs * PHASE_SHARE_TO_LAND - (POD_FABRICATE_MS + POD_HOIST_MS + POD_LOWER_MS));

// `maxTransitMs` caps the outbound trip (and so the return); omit it for the full distance-scaled trip.
export const planPodFlight = (fromX: number, fromZ: number, maxTransitMs = Infinity): PodFlightPlan => {
  const distance = Math.hypot(fromX, fromZ);
  const transitMs = Math.min(TRANSIT_BASE_MS + TRANSIT_MS_PER_TILE * distance, Math.max(MIN_TRANSIT_MS, maxTransitMs));
  const hoistAtMs = POD_FABRICATE_MS;
  const cruiseAtMs = hoistAtMs + POD_HOIST_MS;
  const lowerAtMs = cruiseAtMs + transitMs;
  const touchdownAtMs = lowerAtMs + POD_LOWER_MS;
  const returnAtMs = touchdownAtMs + POD_RELEASE_MS;
  const dockAtMs = returnAtMs + transitMs * RETURN_SHARE;
  const droneGoneAtMs = dockAtMs + DRONE_DOCK_MS;
  return {
    fromX,
    fromZ,
    distance,
    heading: distance > 1e-6 ? Math.atan2(-fromX, -fromZ) : 0,
    cruiseY: DRONE_AFC_HOVER_Y + Math.min(CRUISE_MAX_EXTRA, CRUISE_BASE + CRUISE_PER_TILE * distance),
    hoistAtMs,
    cruiseAtMs,
    lowerAtMs,
    touchdownAtMs,
    returnAtMs,
    dockAtMs,
    droneGoneAtMs,
    endAtMs: Math.max(touchdownAtMs + POD_UNPACK_MS, droneGoneAtMs)
  };
};

export const podStageAt = (plan: PodFlightPlan, age: number): PodStage => {
  if (age < plan.hoistAtMs) return "fabricate";
  if (age < plan.cruiseAtMs) return "hoist";
  if (age < plan.lowerAtMs) return "cruise";
  if (age < plan.touchdownAtMs) return "lower";
  return age < plan.touchdownAtMs + POD_UNPACK_MS ? "unpack" : "done";
};

export const droneStageAt = (plan: PodFlightPlan, age: number): DroneStage => {
  if (age < plan.hoistAtMs) return "spool";
  if (age < plan.cruiseAtMs) return "hoist";
  if (age < plan.lowerAtMs) return "cruise";
  if (age < plan.returnAtMs) return "hover";
  if (age < plan.dockAtMs) return "return";
  return age < plan.droneGoneAtMs ? "dock" : "done";
};

// Eases in and out with zero speed AND zero acceleration at both ends, so the drone's lean (which
// follows its acceleration) and the pod's swing start and finish at rest instead of snapping.
const smootherstep = (t: number): number => t * t * t * (t * (6 * t - 15) + 10);

// Cubic Bezier from the hover over the AFC's crown to the hover over the stack: the first leg
// climbs out of the AFC, the last flattens into the hover. Eased at both ends, so the drone
// hangs for a beat with its load, then pitches over and goes. `t` in 0..1 along the trip.
const tripAt = (plan: PodFlightPlan, t: number, out: PodPoint): PodPoint => {
  const u = smootherstep(t);
  const a = 1 - u;
  const b0 = a * a * a;
  const b1 = 3 * a * a * u;
  const b2 = 3 * a * u * u;
  const b3 = u * u * u;
  out.x = b0 * plan.fromX + b1 * plan.fromX * (1 - APPROACH_SHARE) + b2 * plan.fromX * APPROACH_SHARE;
  out.z = b0 * plan.fromZ + b1 * plan.fromZ * (1 - APPROACH_SHARE) + b2 * plan.fromZ * APPROACH_SHARE;
  out.y = b0 * DRONE_AFC_HOVER_Y + b1 * (plan.cruiseY + CLIMB_OVERSHOOT) + b2 * plan.cruiseY + b3 * DRONE_SITE_HOVER_Y;
  return out;
};

// The drone's hull centre at `age`. Negative ages (a frame stamped a few ms before the spawn) hold
// at the start: the delivery never runs backwards.
export const dronePositionAt = (plan: PodFlightPlan, age: number, out: PodPoint): PodPoint => {
  if (age < plan.cruiseAtMs) {
    out.x = plan.fromX;
    out.z = plan.fromZ;
    out.y = DRONE_PARKED_Y + (DRONE_AFC_HOVER_Y - DRONE_PARKED_Y) * smoothstep(window01(age, 60, 440));
    return out;
  }
  if (age < plan.lowerAtMs) return tripAt(plan, (age - plan.cruiseAtMs) / (plan.lowerAtMs - plan.cruiseAtMs), out);
  if (age < plan.returnAtMs) {
    out.x = 0;
    out.z = 0;
    // Holding station while the winch pays out (a faint bob), then lifting as the load comes off.
    const bob = 0.012 * Math.sin((age - plan.lowerAtMs) * 0.009);
    out.y = DRONE_SITE_HOVER_Y + bob * (1 - window01(age, plan.touchdownAtMs, 120)) + RELEASE_RISE * easeOutCubic(window01(age, plan.touchdownAtMs, POD_RELEASE_MS));
    return out;
  }
  if (age < plan.dockAtMs) {
    // Home along the same arc, backwards.
    const t = (age - plan.returnAtMs) / (plan.dockAtMs - plan.returnAtMs);
    tripAt(plan, 1 - t, out);
    out.y += RELEASE_RISE * (1 - smoothstep(t));
    return out;
  }
  out.x = plan.fromX;
  out.z = plan.fromZ;
  out.y = DRONE_AFC_HOVER_Y - (DRONE_AFC_HOVER_Y - DRONE_PARKED_Y) * smoothstep(window01(age, plan.dockAtMs, DRONE_DOCK_MS));
  return out;
};

// The drone's size: it rises out of the crown at the start and settles back into it to dock,
// growing in and shrinking away there rather than popping.
const DRONE_GROW_MS = 220;
export const droneScaleAt = (plan: PodFlightPlan, age: number): number =>
  Math.min(smoothstep(window01(age, 0, DRONE_GROW_MS)), 1 - smoothstep(window01(age, plan.dockAtMs + DRONE_DOCK_MS * 0.35, DRONE_DOCK_MS * 0.65)));

// Which way the drone faces: toward the site on the way out, turning for home while the line reels
// in, so it is facing home before it sets off.
export const droneYawAt = (plan: PodFlightPlan, age: number): number => plan.heading + Math.PI * smoothstep(window01(age, plan.touchdownAtMs + 20, POD_RELEASE_MS - 40));

// Rotor speed 0..1: spooling up on the crown, flat out when hauling, easing off once empty.
export const droneRotorAt = (plan: PodFlightPlan, age: number): number => {
  if (age < plan.hoistAtMs) return 0.3 + 0.7 * smoothstep(window01(age, 0, 380));
  if (age < plan.touchdownAtMs) return 1;
  if (age < plan.dockAtMs) return 0.85;
  return 0.85 - 0.55 * window01(age, plan.dockAtMs, DRONE_DOCK_MS);
};

const SAMPLE_MS = 16;
const s0 = { x: 0, y: 0, z: 0 };
const s1 = { x: 0, y: 0, z: 0 };
const s2 = { x: 0, y: 0, z: 0 };
// Scratch result of droneMotionAt (called several times per delivery per frame: no allocation).
const motion = { speed: 0, accel: 0 };
// Along-track speed (tiles/ms) and acceleration (tiles/ms^2) of the drone at `age`, along its
// travel: toward the site on the way out, home after. Read the result before the next call.
const droneMotionAt = (plan: PodFlightPlan, age: number): { readonly speed: number; readonly accel: number } => {
  const sign = age < plan.touchdownAtMs ? 1 : -1;
  const dx = (-plan.fromX / plan.distance) * sign;
  const dz = (-plan.fromZ / plan.distance) * sign;
  dronePositionAt(plan, age - SAMPLE_MS, s0);
  dronePositionAt(plan, age, s1);
  dronePositionAt(plan, age + SAMPLE_MS, s2);
  const a0 = s0.x * dx + s0.z * dz;
  const a1 = s1.x * dx + s1.z * dz;
  const a2 = s2.x * dx + s2.z * dz;
  motion.speed = (a2 - a0) / (2 * SAMPLE_MS);
  motion.accel = (a2 - 2 * a1 + a0) / (SAMPLE_MS * SAMPLE_MS);
  return motion;
};

const inFlight = (plan: PodFlightPlan, age: number): boolean =>
  plan.distance > 1e-6 && ((age >= plan.cruiseAtMs && age < plan.lowerAtMs) || (age >= plan.returnAtMs && age < plan.dockAtMs));

// Pitch of the drone along its facing (radians, positive = nose down). It flies like a quadcopter:
// it tips into the trip to accelerate, carries a little lean at speed, and tips back to brake.
const LEAN_PER_SPEED = 22; // radians per (tile / ms)
const LEAN_PER_ACCEL = 9_000; // radians per (tile / ms^2)
export const MAX_LEAN = 0.6;
export const droneLeanAt = (plan: PodFlightPlan, age: number): number => {
  if (!inFlight(plan, age)) return 0;
  const { speed, accel } = droneMotionAt(plan, age);
  return Math.max(-MAX_LEAN, Math.min(MAX_LEAN, LEAN_PER_SPEED * speed + LEAN_PER_ACCEL * accel));
};

// The pod's swing on its line (radians, positive = trailing behind the drone). A slung load lags
// the drone: it swings back as the drone speeds up, forward as it brakes, and rocks to a stop
// under the hover before the winch pays out.
const SWING_PER_ACCEL = 14_000;
const SWING_LAG_MS = 150;
export const MAX_SWING = 0.42;
export const podSwingAt = (plan: PodFlightPlan, age: number): number => {
  if (age < plan.cruiseAtMs || age >= plan.touchdownAtMs || plan.distance < 1e-6) return 0;
  const lagged = age - SWING_LAG_MS;
  const driven = lagged >= plan.cruiseAtMs && lagged < plan.lowerAtMs ? SWING_PER_ACCEL * droneMotionAt(plan, lagged).accel : 0;
  // Settling under the hover: a damped rock, damped out entirely before touchdown.
  const settle = age >= plan.lowerAtMs ? -0.14 * Math.min(1, plan.distance / 3) * Math.exp(-(age - plan.lowerAtMs) / 320) * Math.sin((age - plan.lowerAtMs) * 0.012) : 0;
  const fade = 1 - smoothstep(window01(age, plan.lowerAtMs + 200, 500));
  return Math.max(-MAX_SWING, Math.min(MAX_SWING, (driven + settle) * fade));
};

// How much of the pod the AFC has printed (0..1, bottom-up).
export const podPrintedAt = (plan: PodFlightPlan, age: number): number => smoothstep(window01(age, 0, plan.hoistAtMs * 0.9));

// The pod's bottom centre at `age`. While slung it hangs from the drone's hook, swung by
// podSwingAt along the trip's heading.
export const podPositionAt = (plan: PodFlightPlan, age: number, out: PodPoint): PodPoint => {
  if (age < plan.hoistAtMs) {
    out.x = plan.fromX;
    out.y = POD_CHAMBER_Y;
    out.z = plan.fromZ;
    return out;
  }
  if (age < plan.cruiseAtMs) {
    out.x = plan.fromX;
    out.z = plan.fromZ;
    out.y = POD_CHAMBER_Y + (DRONE_AFC_HOVER_Y - HANG - POD_CHAMBER_Y) * smoothstep(window01(age, plan.hoistAtMs, POD_HOIST_MS));
    return out;
  }
  if (age >= plan.touchdownAtMs) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    return out;
  }
  dronePositionAt(plan, age, out);
  const swing = podSwingAt(plan, age);
  const reach = POD_SLING + POD_BODY_HEIGHT;
  const fx = plan.distance > 1e-6 ? -plan.fromX / plan.distance : 0;
  const fz = plan.distance > 1e-6 ? -plan.fromZ / plan.distance : 0;
  out.x -= fx * Math.sin(swing) * reach;
  out.z -= fz * Math.sin(swing) * reach;
  out.y -= DRONE_BELLY + Math.cos(swing) * reach;
  if (age >= plan.lowerAtMs) {
    // The winch pays out: from slung under the hover down onto the stack.
    out.y *= 1 - smoothstep(window01(age, plan.lowerAtMs, POD_LOWER_MS));
  }
  return out;
};

// The bottom of the winch line, or false when the line is reeled in. It drops into the chamber
// while the pod prints, holds the pod's lid until touchdown, then reels back up to the hook.
export const droneLineEndAt = (plan: PodFlightPlan, age: number, out: PodPoint): boolean => {
  if (age < 200 || age >= plan.returnAtMs) return false;
  dronePositionAt(plan, age, out);
  const hookY = out.y - DRONE_BELLY;
  if (age < plan.hoistAtMs) {
    out.y = hookY - (hookY - POD_CHAMBER_Y - POD_BODY_HEIGHT) * smoothstep(window01(age, 200, plan.hoistAtMs - 200));
    return true;
  }
  if (age < plan.touchdownAtMs) {
    podPositionAt(plan, age, out);
    const swing = podSwingAt(plan, age);
    const fx = plan.distance > 1e-6 ? -plan.fromX / plan.distance : 0;
    const fz = plan.distance > 1e-6 ? -plan.fromZ / plan.distance : 0;
    out.x += fx * Math.sin(swing) * POD_BODY_HEIGHT;
    out.z += fz * Math.sin(swing) * POD_BODY_HEIGHT;
    out.y += Math.cos(swing) * POD_BODY_HEIGHT;
    return true;
  }
  const reel = smoothstep(window01(age, plan.touchdownAtMs, POD_RELEASE_MS));
  out.x = 0;
  out.z = 0;
  out.y = POD_BODY_HEIGHT + (hookY - POD_BODY_HEIGHT) * reel;
  return true;
};

// The parts stack waits empty while its pod is on the way; the crates are set down inside the
// pod just after touchdown, hidden by its walls until they fold open.
export const POD_CRATES_REVEAL_AFTER_TOUCHDOWN_MS = 40;
export const podCratesDelivered = (plan: PodFlightPlan, age: number): boolean => age >= plan.touchdownAtMs + POD_CRATES_REVEAL_AFTER_TOUCHDOWN_MS;
