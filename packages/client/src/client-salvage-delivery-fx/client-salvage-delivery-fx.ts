import type { Tile } from "../client-types.js";

// "The Court's Imperial delivery arrives" sequence, played on the viewer's own
// Reclamation Works each time a load of precursor salvage ships to the Court
// (SHIP_SALVAGE_TO_COURT). An Imperial dropship fires down out of orbit on a
// retro-burn, settles over the Works, lowers its ramp, and a column of
// ready-made Ancillaries marches down it and off across the House's own land,
// each fading out as it disappears into the territory. The ramp closes and the
// ship lifts off again.
//
// Detection and the whole timeline live here, renderer-agnostic, so the two
// renderers stay in step:
//   - true-3D: client-map-3d-salvage-delivery-fx.ts drains salvageDeliveryFxQueue
//     (client-map-3d-fx-cast-overlays.ts);
//   - 2D: client-map-2d-salvage-delivery.ts draws from salvageDeliveryFxByKey in
//     the per-tile overlay pass (client-map-2d-tile-feature-overlays.ts), since
//     the 3D drain empties the queue.
// startedAt is wall-clock (Date.now() ms). Offsets are in tiles from the Works'
// tile centre: +dx is east (scene X), +dy is south (scene Z).

/** Where one Ancillary heads once it is off the ramp, in tiles from the Works. */
export type SalvageMarcherTarget = { readonly dx: number; readonly dy: number };

export type SalvageDeliveryFxEntry = {
  readonly x: number;
  readonly y: number;
  readonly startedAt: number;
  /** The House's colour, worn by the Ancillaries once they are its own. */
  readonly color: string;
  readonly marchers: readonly SalvageMarcherTarget[];
};

export type SalvageDeliveryFxState = {
  salvageDeliveryFxQueue: SalvageDeliveryFxEntry[];
  salvageDeliveryFxByKey: Map<string, SalvageDeliveryFxEntry>;
};

export const createInitialSalvageDeliveryFxState = (): SalvageDeliveryFxState => ({
  salvageDeliveryFxQueue: [],
  salvageDeliveryFxByKey: new Map()
});

// ---- Shared timeline (ms from startedAt) ----

/** Stretches the whole sequence; every duration below (and the 3D layer's dust timings) is authored at 1x and scaled by it. */
export const SALVAGE_PACE = 1.5;
const paced = (ms: number): number => ms * SALVAGE_PACE;
/** The ship falls from orbit to its hover over the Works. */
export const SALVAGE_SHIP_DESCENT_MS = paced(2200);
/** The ramp swings down once the ship has settled. */
export const SALVAGE_RAMP_OPEN_MS = paced(450);
export const SALVAGE_MARCH_START_MS = SALVAGE_SHIP_DESCENT_MS + SALVAGE_RAMP_OPEN_MS;
export const SALVAGE_MARCHER_COUNT = 6;
/** Gap between one Ancillary stepping onto the ramp and the next. */
export const SALVAGE_MARCHER_STAGGER_MS = paced(260);
/** Time to walk down the ramp. */
export const SALVAGE_RAMP_WALK_MS = paced(400);
/** Time to walk from the ramp's foot out to the target, fading out over the end of it. */
export const SALVAGE_GROUND_WALK_MS = paced(1700);
/** Fraction of the ground walk at which an Ancillary starts to fade into the land. */
const MARCHER_FADE_FROM = 0.55;
const LAST_OFF_RAMP_MS = SALVAGE_MARCH_START_MS + (SALVAGE_MARCHER_COUNT - 1) * SALVAGE_MARCHER_STAGGER_MS + SALVAGE_RAMP_WALK_MS;
export const SALVAGE_RAMP_CLOSE_START_MS = LAST_OFF_RAMP_MS + paced(50);
export const SALVAGE_RAMP_CLOSE_MS = paced(400);
export const SALVAGE_DEPART_START_MS = SALVAGE_RAMP_CLOSE_START_MS + SALVAGE_RAMP_CLOSE_MS + paced(100);
export const SALVAGE_DEPART_MS = paced(1600);
export const SALVAGE_DELIVERY_TOTAL_MS = SALVAGE_DEPART_START_MS + SALVAGE_DEPART_MS;

// ---- Shared geometry (tiles) ----

/** Height the ship falls from and climbs back to. */
export const SALVAGE_SHIP_ORBIT_HEIGHT = 5.5;
/** Hover height above the ground while unloading (clears the Works' yard). */
export const SALVAGE_SHIP_HOVER_HEIGHT = 0.42;
/** The ramp hinges at the ship's nose, this far south of the tile centre. */
export const SALVAGE_RAMP_HINGE_DY = 0.38;
/** Ramp length; reaches the ground from the hover height when open. */
export const SALVAGE_RAMP_LENGTH = 0.6;
/** Open ramp tilt below horizontal (radians). */
export const SALVAGE_RAMP_OPEN_ANGLE = Math.asin(SALVAGE_SHIP_HOVER_HEIGHT / SALVAGE_RAMP_LENGTH);
/** Where the open ramp meets the ground. */
export const SALVAGE_RAMP_FOOT_DY = SALVAGE_RAMP_HINGE_DY + SALVAGE_RAMP_LENGTH * Math.cos(SALVAGE_RAMP_OPEN_ANGLE);

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
const easeIn = (t: number): number => t * t;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export type SalvageShipFrame = {
  readonly visible: boolean;
  /** Height of the hull's belly above the ground, in tiles. */
  readonly height: number;
  /** Ground offset south of the Works, in tiles: the ship comes in on a slant from the north and leaves the same way. */
  readonly offsetDy: number;
  /** Nose-down pitch while it dives in, nose-up as it climbs out (radians; positive = nose down). */
  readonly pitch: number;
  readonly alpha: number;
  /** 0 closed (folded up against the nose) .. 1 open (resting on the ground). */
  readonly rampOpen: number;
  /** Engine burn, 0..1: hard on the way down, idling while unloading, full on lift-off. */
  readonly burn: number;
  /** Re-entry heat, 0..1: the fiery streak wrapping the ship high in the dive. */
  readonly heat: number;
  /** Landing legs, 0 stowed .. 1 down. */
  readonly legs: number;
  /** Ground dust kicked up by the landing, 0..1 (0 when none). */
  readonly dust: number;
};

/** How far north of the Works the ship starts its dive, and ends its climb, in tiles. */
export const SALVAGE_SHIP_APPROACH_DY = -2.6;
const DIVE_PITCH = 0.42;

export const salvageShipAt = (ageMs: number): SalvageShipFrame => {
  if (ageMs < 0 || ageMs >= SALVAGE_DELIVERY_TOTAL_MS) {
    return { visible: false, height: 0, offsetDy: 0, pitch: 0, alpha: 0, rampOpen: 0, burn: 0, heat: 0, legs: 0, dust: 0 };
  }
  const hover = SALVAGE_SHIP_HOVER_HEIGHT;
  const fall = clamp01(ageMs / SALVAGE_SHIP_DESCENT_MS);
  const rise = clamp01((ageMs - SALVAGE_DEPART_START_MS) / SALVAGE_DEPART_MS);
  const departing = ageMs >= SALVAGE_DEPART_START_MS;
  // Height eases out on the way down (brakes hard over the Works); the slant
  // closes a little faster, so the last stretch is a near-vertical settle.
  const height = departing ? lerp(hover, SALVAGE_SHIP_ORBIT_HEIGHT, easeIn(rise)) : lerp(SALVAGE_SHIP_ORBIT_HEIGHT, hover, easeOut(fall));
  const slant = departing ? easeIn(clamp01((rise - 0.15) / 0.85)) : 1 - easeOut(clamp01(fall / 0.8));
  const offsetDy = SALVAGE_SHIP_APPROACH_DY * slant;
  const pitch = departing ? -DIVE_PITCH * 0.8 * easeOut(clamp01(rise / 0.5)) : DIVE_PITCH * (1 - easeOut(clamp01(fall / 0.85)));
  const opening = clamp01((ageMs - SALVAGE_SHIP_DESCENT_MS) / SALVAGE_RAMP_OPEN_MS);
  const closing = clamp01((ageMs - SALVAGE_RAMP_CLOSE_START_MS) / SALVAGE_RAMP_CLOSE_MS);
  const rampOpen = easeOut(opening) * (1 - easeIn(closing));
  const burn = !departing && ageMs < SALVAGE_SHIP_DESCENT_MS ? 0.45 + 0.55 * fall : departing ? 0.7 + 0.3 * (1 - rise) : 0.25;
  const heat = departing ? 0 : clamp01(ageMs / paced(180)) * (1 - clamp01(fall / 0.55));
  const legs = departing ? 1 - clamp01(rise / 0.25) : clamp01((fall - 0.65) / 0.3);
  const fadeIn = clamp01(ageMs / paced(250));
  const fadeOut = 1 - clamp01((rise - 0.6) / 0.4);
  const landing = (ageMs - SALVAGE_SHIP_DESCENT_MS * 0.7) / paced(1500);
  const liftoff = (ageMs - SALVAGE_DEPART_START_MS) / paced(1000);
  const pulse = (p: number): number => (p <= 0 || p >= 1 ? 0 : Math.sin(Math.PI * p));
  return {
    visible: true, height, offsetDy, pitch, alpha: fadeIn * fadeOut, rampOpen, burn, heat, legs,
    dust: Math.max(pulse(landing), pulse(liftoff) * 0.7)
  };
};

/** Navigation-light blink, 0..1, for light `index` (0 port, 1 starboard, 2 strobe). Shared so both maps blink alike. */
export const salvageNavLight = (ageMs: number, index: number): number => {
  if (index === 2) return (ageMs % 900) < 70 ? 1 : 0;
  return 0.35 + 0.65 * ((ageMs + index * 450) % 1200 < 600 ? 1 : 0);
};

export type SalvageMarcherFrame = {
  readonly visible: boolean;
  /** Tiles from the Works' tile centre (east / south). */
  readonly dx: number;
  readonly dy: number;
  /** Height above the ground, in tiles (down the ramp, plus a step bob). */
  readonly lift: number;
  /** 0 at the ramp's foot .. 1 at the target: how far across the ground it is, for blending ground heights. */
  readonly groundProgress: number;
  /** Heading on the map, radians: atan2(dy, dx) of the direction of travel. */
  readonly heading: number;
  readonly alpha: number;
  /** Shrinks a little as it fades, sinking into the land. */
  readonly scale: number;
};

const HIDDEN_MARCHER: SalvageMarcherFrame = { visible: false, dx: 0, dy: 0, lift: 0, groundProgress: 0, heading: 0, alpha: 0, scale: 0 };

export const salvageMarcherAt = (target: SalvageMarcherTarget, index: number, ageMs: number): SalvageMarcherFrame => {
  const t = ageMs - SALVAGE_MARCH_START_MS - index * SALVAGE_MARCHER_STAGGER_MS;
  if (t < 0 || t >= SALVAGE_RAMP_WALK_MS + SALVAGE_GROUND_WALK_MS) return HIDDEN_MARCHER;
  const bob = Math.abs(Math.sin(t / paced(95))) * 0.025;
  if (t < SALVAGE_RAMP_WALK_MS) {
    const p = t / SALVAGE_RAMP_WALK_MS;
    return {
      visible: true, dx: 0, dy: lerp(SALVAGE_RAMP_HINGE_DY, SALVAGE_RAMP_FOOT_DY, p),
      lift: SALVAGE_SHIP_HOVER_HEIGHT * (1 - p) + bob, groundProgress: 0, heading: Math.PI / 2, alpha: clamp01(p * 4), scale: 1
    };
  }
  const p = (t - SALVAGE_RAMP_WALK_MS) / SALVAGE_GROUND_WALK_MS;
  const fade = clamp01((p - MARCHER_FADE_FROM) / (1 - MARCHER_FADE_FROM));
  return {
    visible: true,
    dx: lerp(0, target.dx, p),
    dy: lerp(SALVAGE_RAMP_FOOT_DY, target.dy, p),
    lift: bob * (1 - fade),
    groundProgress: p,
    heading: Math.atan2(target.dy - SALVAGE_RAMP_FOOT_DY, target.dx),
    alpha: 1 - fade,
    scale: 1 - fade * 0.45
  };
};

// ---- Detection ----

const isReclamationWorks = (tile: Pick<Tile, "economicStructure"> | undefined): boolean =>
  tile?.economicStructure?.type === "RECLAMATION_WORKS";

/** Loads shipped from a known Reclamation Works, snapshotted before a tile-delta batch merges; undefined when no Works was known there. */
export const snapshotSalvageLoadsShipped = (tile: Pick<Tile, "economicStructure"> | undefined): number | undefined =>
  isReclamationWorks(tile) ? tile!.economicStructure!.salvageLoadsShipped ?? 0 : undefined;

/** True when the viewer's own Works shipped a load in this batch (its shipped count went up). A first sighting is not a shipment. */
export const salvageShipmentLanded = (previousShipped: number | undefined, resolved: Tile | undefined, me: string): boolean => {
  if (previousShipped === undefined || !resolved || !me) return false;
  if (resolved.ownerId !== me || !isReclamationWorks(resolved)) return false;
  return (resolved.economicStructure!.salvageLoadsShipped ?? 0) > previousShipped;
};

const wrapDelta = (d: number, size: number): number => {
  let v = d % size;
  if (v > size / 2) v -= size;
  if (v < -size / 2) v += size;
  return v;
};

const MARCH_RADIUS = 3;

/**
 * Where each Ancillary marches to: the House's own tiles round the Works,
 * nearest first and spread round the compass, so the column visibly heads
 * into its territory. Falls back to an even fan when the Works stands alone.
 */
export const salvageMarcherTargets = (
  origin: { readonly x: number; readonly y: number },
  isOwnTile: (x: number, y: number) => boolean,
  world: { readonly width: number; readonly height: number }
): SalvageMarcherTarget[] => {
  const candidates: Array<SalvageMarcherTarget & { readonly dist: number; readonly angle: number }> = [];
  for (let dy = -MARCH_RADIUS; dy <= MARCH_RADIUS; dy += 1) {
    for (let dx = -MARCH_RADIUS; dx <= MARCH_RADIUS; dx += 1) {
      const dist = Math.hypot(dx, dy);
      if (dist < 1.5 || dist > MARCH_RADIUS + 0.5) continue;
      const x = ((origin.x + dx) % world.width + world.width) % world.width;
      const y = ((origin.y + dy) % world.height + world.height) % world.height;
      if (isOwnTile(x, y)) candidates.push({ dx: wrapDelta(dx, world.width), dy: wrapDelta(dy, world.height), dist, angle: Math.atan2(dy, dx) });
    }
  }
  const targets: SalvageMarcherTarget[] = [];
  if (candidates.length > 0) {
    // One per compass sector first (nearest in each), then fill with the rest.
    const SECTORS = SALVAGE_MARCHER_COUNT;
    const sectorOf = (angle: number): number => Math.floor(((angle + Math.PI) / (Math.PI * 2)) * SECTORS) % SECTORS;
    const byDistance = [...candidates].sort((a, b) => a.dist - b.dist || a.angle - b.angle);
    const used = new Set<number>();
    const picked = new Set<SalvageMarcherTarget>();
    for (const c of byDistance) {
      const sector = sectorOf(c.angle);
      if (used.has(sector)) continue;
      used.add(sector);
      picked.add(c);
    }
    for (const c of byDistance) if (picked.size < SALVAGE_MARCHER_COUNT) picked.add(c);
    const chosen = [...picked];
    for (let i = 0; i < SALVAGE_MARCHER_COUNT; i += 1) {
      const c = chosen[i % chosen.length]!;
      targets.push({ dx: c.dx, dy: c.dy });
    }
    return targets;
  }
  for (let i = 0; i < SALVAGE_MARCHER_COUNT; i += 1) {
    const angle = Math.PI / 2 + ((i - (SALVAGE_MARCHER_COUNT - 1) / 2) / SALVAGE_MARCHER_COUNT) * Math.PI * 1.6;
    targets.push({ dx: Math.cos(angle) * 2, dy: Math.sin(angle) * 2 });
  }
  return targets;
};

const FX_QUEUE_CAP = 8;

/**
 * Starts a delivery at `key`; prunes finished entries and bounds the 3D queue
 * (drained only while the true-3D renderer runs). A Works already mid-delivery
 * keeps the ship it has -- a second load shipped while it is still on the map
 * neither restarts it (2D) nor lands a second ship on top of it (3D). Returns
 * whether a delivery was started.
 */
export const recordSalvageDelivery = (state: SalvageDeliveryFxState, key: string, entry: SalvageDeliveryFxEntry): boolean => {
  if (activeSalvageDelivery(state, key, entry.startedAt)) return false;
  for (const [otherKey, other] of state.salvageDeliveryFxByKey) {
    if (entry.startedAt - other.startedAt >= SALVAGE_DELIVERY_TOTAL_MS) state.salvageDeliveryFxByKey.delete(otherKey);
  }
  state.salvageDeliveryFxByKey.set(key, entry);
  state.salvageDeliveryFxQueue.push(entry);
  if (state.salvageDeliveryFxQueue.length > FX_QUEUE_CAP) state.salvageDeliveryFxQueue.shift();
  return true;
};

/** Whether a delivery that started at `startedAt` (Date.now() ms) has already played out. */
export const salvageDeliveryFinished = (startedAt: number, nowEpochMs: number): boolean => nowEpochMs - startedAt >= SALVAGE_DELIVERY_TOTAL_MS;

/** The delivery playing at `key` right now, if any. */
export const activeSalvageDelivery = (state: Pick<SalvageDeliveryFxState, "salvageDeliveryFxByKey">, key: string, nowEpochMs: number): SalvageDeliveryFxEntry | undefined => {
  const entry = state.salvageDeliveryFxByKey.get(key);
  if (!entry) return undefined;
  const age = nowEpochMs - entry.startedAt;
  return age >= 0 && age < SALVAGE_DELIVERY_TOTAL_MS ? entry : undefined;
};
