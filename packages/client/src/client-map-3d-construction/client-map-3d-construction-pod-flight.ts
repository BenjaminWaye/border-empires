// The flight of a parts pod from the owner's AFC to a construction site
// (docs/construction-animation-plan.md, "Supply pods"), as pure maths of (plan, age) so the
// renderer, the crate stack and the tests all read the same timeline. Three-free.
//
// Beats, in order (ages in ms from spawn):
//   fabricate  the AFC prints the pod inside its glass fabrication chamber, bottom-up
//   lift       the pod is kicked up through the AFC's crown (fast out, easing to a hang)
//   cruise     a banked atmospheric arc to a hover point above the parts stack
//   descent    a retro-burn straight down onto the stack, braking to a soft touchdown
//   unpack     the lid pops, the walls fold open and the empty frame collapses, leaving the crates
// Everything is fabricated at the AFC and carried over at low altitude: nothing comes from
// orbit, so the cruise height is capped well below the old orbital-drop height.
//
// Positions are of the pod's bottom centre, local to the landing point (the site's parts
// stack on the ground), with the AFC at (fromX, 0, fromZ). The AFC's surface height is
// taken to be the site's, as before.

export type PodPoint = { x: number; y: number; z: number };

export type PodStage = "fabricate" | "lift" | "cruise" | "descent" | "unpack" | "done";

export type PodFlightPlan = {
  readonly fromX: number;
  readonly fromZ: number;
  readonly distance: number;
  // Heading of the flight on the ground plane (radians, about +Y; 0 faces +Z).
  readonly heading: number;
  readonly cruiseY: number;
  readonly liftAtMs: number;
  readonly cruiseAtMs: number;
  readonly descentAtMs: number;
  readonly touchdownAtMs: number;
  readonly endAtMs: number;
};

export const POD_FABRICATE_MS = 620;
export const POD_LIFT_MS = 340;
const TRANSIT_BASE_MS = 480;
// Transit grows with distance and is deliberately not capped: a site far from its AFC really
// is far from where its parts are made, and the flight shows it.
const TRANSIT_MS_PER_TILE = 135;
export const POD_DESCENT_MS = 540;
export const POD_UNPACK_MS = 920;

// The AFC's geometry (client-map-3d-fabrication-complex.ts): the glass chamber is centred at
// 0.46 and the crown's top cap sits at 1.11, so the pod is printed at chamber height and
// leaves just above the cap.
export const POD_CHAMBER_Y = 0.39;
export const POD_EXIT_Y = 1.32;
export const POD_AFC_CAP_Y = 1.18;
const CRUISE_BASE = 0.35;
const CRUISE_PER_TILE = 0.07;
const CRUISE_MAX_EXTRA = 1;
// The climb-out control point overshoots the cruise line a little before levelling off.
const CLIMB_OVERSHOOT = 0.15;
// How far short of the site (as a share of the trip) the arc starts to flatten into its hover.
const APPROACH_SHARE = 0.22;
export const POD_HOVER_Y = 0.52;
// The highest any pod can ever be: the cruise cap plus the climb overshoot.
export const POD_MAX_Y = POD_EXIT_Y + CRUISE_MAX_EXTRA + CLIMB_OVERSHOOT;

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

export const planPodFlight = (fromX: number, fromZ: number): PodFlightPlan => {
  const distance = Math.hypot(fromX, fromZ);
  const liftAtMs = POD_FABRICATE_MS;
  const cruiseAtMs = liftAtMs + POD_LIFT_MS;
  const descentAtMs = cruiseAtMs + TRANSIT_BASE_MS + TRANSIT_MS_PER_TILE * distance;
  const touchdownAtMs = descentAtMs + POD_DESCENT_MS;
  return {
    fromX,
    fromZ,
    distance,
    heading: distance > 1e-6 ? Math.atan2(-fromX, -fromZ) : 0,
    cruiseY: POD_EXIT_Y + Math.min(CRUISE_MAX_EXTRA, CRUISE_BASE + CRUISE_PER_TILE * distance),
    liftAtMs,
    cruiseAtMs,
    descentAtMs,
    touchdownAtMs,
    endAtMs: touchdownAtMs + POD_UNPACK_MS
  };
};

export const podStageAt = (plan: PodFlightPlan, age: number): PodStage => {
  if (age < plan.liftAtMs) return "fabricate";
  if (age < plan.cruiseAtMs) return "lift";
  if (age < plan.descentAtMs) return "cruise";
  if (age < plan.touchdownAtMs) return "descent";
  return age < plan.endAtMs ? "unpack" : "done";
};

// Cubic Bezier from just above the AFC's crown to the hover point above the stack: the first
// leg climbs steeply out of the AFC, the last flattens into the hover. Eased at both ends, so
// the pod hangs for a beat at the top of its launch, then pitches over and goes.
const cruiseAt = (plan: PodFlightPlan, t: number, out: PodPoint): PodPoint => {
  const u = smoothstep(t);
  const a = 1 - u;
  const b0 = a * a * a;
  const b1 = 3 * a * a * u;
  const b2 = 3 * a * u * u;
  const b3 = u * u * u;
  const climbX = plan.fromX * (1 - APPROACH_SHARE);
  const climbZ = plan.fromZ * (1 - APPROACH_SHARE);
  out.x = b0 * plan.fromX + b1 * climbX + b2 * plan.fromX * APPROACH_SHARE;
  out.z = b0 * plan.fromZ + b1 * climbZ + b2 * plan.fromZ * APPROACH_SHARE;
  out.y = b0 * POD_EXIT_Y + b1 * (plan.cruiseY + CLIMB_OVERSHOOT) + b2 * plan.cruiseY + b3 * POD_HOVER_Y;
  return out;
};

// The pod's bottom centre at `age`, local to the landing point. Negative ages (a frame stamped
// a few ms before the spawn) hold at the start: the flight never runs backwards.
export const podPositionAt = (plan: PodFlightPlan, age: number, out: PodPoint): PodPoint => {
  if (age < plan.liftAtMs) {
    out.x = plan.fromX;
    out.y = POD_CHAMBER_Y;
    out.z = plan.fromZ;
    return out;
  }
  if (age < plan.cruiseAtMs) {
    out.x = plan.fromX;
    out.y = POD_CHAMBER_Y + (POD_EXIT_Y - POD_CHAMBER_Y) * easeOutCubic(window01(age, plan.liftAtMs, POD_LIFT_MS));
    out.z = plan.fromZ;
    return out;
  }
  if (age < plan.descentAtMs) return cruiseAt(plan, (age - plan.cruiseAtMs) / (plan.descentAtMs - plan.cruiseAtMs), out);
  out.x = 0;
  out.z = 0;
  out.y = POD_HOVER_Y * (1 - smoothstep(window01(age, plan.descentAtMs, POD_DESCENT_MS)));
  return out;
};

// Main-engine throttle 0..1: off while printing, full kick on lift, easing off at mid-cruise
// and back up to brake, a hard retro-burn on the way down that softens just before contact.
export const podThrottleAt = (plan: PodFlightPlan, age: number): number => {
  if (age < plan.liftAtMs || age >= plan.touchdownAtMs) return 0;
  if (age < plan.cruiseAtMs) return 1;
  if (age < plan.descentAtMs) {
    const t = (age - plan.cruiseAtMs) / (plan.descentAtMs - plan.cruiseAtMs);
    return 0.5 + 0.4 * (1 - 2 * t) ** 2;
  }
  return 0.95 - 0.3 * window01(age, plan.descentAtMs, POD_DESCENT_MS);
};

// How much of the pod the AFC has printed (0..1, bottom-up).
export const podPrintedAt = (plan: PodFlightPlan, age: number): number => smoothstep(window01(age, 0, plan.liftAtMs * 0.9));

// Pitch of the pod along its heading (radians, positive = nose down toward the site). It flies
// like a thrust-vectored lander: it leans into the trip to accelerate, carries a little lean at
// cruise speed, and flares back (nose up) to brake before the hover.
const LEAN_PER_SPEED = 22; // radians per (tile / ms)
const LEAN_PER_ACCEL = 9_000; // radians per (tile / ms^2)
const MAX_LEAN = 0.6;
const SAMPLE_MS = 16;
const a = { x: 0, y: 0, z: 0 };
const b = { x: 0, y: 0, z: 0 };
const c = { x: 0, y: 0, z: 0 };
export const podLeanAt = (plan: PodFlightPlan, age: number): number => {
  if (age < plan.cruiseAtMs || age >= plan.descentAtMs || plan.distance < 1e-6) return 0;
  podPositionAt(plan, age - SAMPLE_MS, a);
  podPositionAt(plan, age, b);
  podPositionAt(plan, age + SAMPLE_MS, c);
  // Ground-plane progress toward the site, along the heading.
  const ux = -plan.fromX / plan.distance;
  const uz = -plan.fromZ / plan.distance;
  const along = (p: PodPoint): number => p.x * ux + p.z * uz;
  const speed = (along(c) - along(a)) / (2 * SAMPLE_MS);
  const accel = (along(c) - 2 * along(b) + along(a)) / (SAMPLE_MS * SAMPLE_MS);
  return Math.max(-MAX_LEAN, Math.min(MAX_LEAN, LEAN_PER_SPEED * speed + LEAN_PER_ACCEL * accel));
};

// The parts stack waits empty while its pod is on the way; the crates are set down inside the
// pod just after touchdown, hidden by its walls until they fold open.
export const POD_CRATES_REVEAL_AFTER_TOUCHDOWN_MS = 40;
export const podCratesDelivered = (plan: PodFlightPlan, age: number): boolean => age >= plan.touchdownAtMs + POD_CRATES_REVEAL_AFTER_TOUCHDOWN_MS;
