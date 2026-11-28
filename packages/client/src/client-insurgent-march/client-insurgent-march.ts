import { WORLD_HEIGHT, WORLD_WIDTH, straightTransitWalk, type MusterTransitLeg, type MusterTransitRoute, type TransitPoint } from "@border-empires/shared";
import { activeTransitLeg } from "../client-muster-transit-route/client-muster-transit-route.js";

// Insurgent (Planetary Defense) companies marching out of their camp to the
// tile an ATTACK or EXPAND launches from (server: apps/simulation/src/
// planetary-defense-camps/camp-march.ts). The server sends INSURGENT_MARCH to
// every online player who can see the camp, the launch tile or the target, as
// the march sets out; the 3D map draws the company with the muster transit
// overlay (client-map-3d-muster-transit-sync.ts) and the 2D map with soldier
// glyphs (client-insurgent-march-2d.ts), both along the route the server
// timed and sent with the march (so the drawing never disagrees with the
// arrival time, even over ground this viewer can't see).
//
// Kept out of ClientState (at its line cap): a march lives at most the
// longest walk out of a camp, and each entry drops once it arrives.

export type InsurgentMarch = {
  id: string;
  actionType: "ATTACK" | "EXPAND";
  campX: number;
  campY: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** The route the server timed: walk legs, and a dock crossing if any. */
  route: MusterTransitRoute;
  /** Local clock: when the company left the camp. */
  startAt: number;
  /** Local clock: when it reaches the launch tile and the fight or claim begins. */
  transitEndsAt: number;
  resolvesAt: number;
};

// Bound on stored marches whatever the server sends (at most one per camp is ever under way).
const MAX_MARCHES = 200;
const marches = new Map<string, InsurgentMarch>();

const num = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

// Bound on a route's size whatever the server sends (a real one is a few dozen points).
const MAX_ROUTE_POINTS = 256;
const pointOf = (value: unknown): TransitPoint | undefined => {
  if (!Array.isArray(value)) return undefined;
  const x = num(value[0]);
  const y = num(value[1]);
  return x === undefined || y === undefined ? undefined : { x, y };
};

/** The server's `legs`/`legMs`, or undefined if anything in them is malformed. */
const parseRoute = (legsRaw: unknown, legMsRaw: unknown, marchMs: number): MusterTransitRoute | undefined => {
  if (!Array.isArray(legsRaw) || !Array.isArray(legMsRaw) || legsRaw.length === 0 || legsRaw.length !== legMsRaw.length) return undefined;
  const legs: MusterTransitLeg[] = [];
  let pointCount = 0;
  for (const raw of legsRaw) {
    const leg = raw as Record<string, unknown> | null;
    if (leg?.kind === "WALK" && Array.isArray(leg.points)) {
      const points = leg.points.map(pointOf);
      pointCount += points.length;
      if (points.length < 1 || pointCount > MAX_ROUTE_POINTS || points.some((p) => !p)) return undefined;
      legs.push({ kind: "WALK", points: points as TransitPoint[] });
    } else if (leg?.kind === "SAIL") {
      const from = pointOf(leg.from);
      const to = pointOf(leg.to);
      if (!from || !to) return undefined;
      legs.push({ kind: "SAIL", from, to });
    } else {
      return undefined;
    }
  }
  const legMs = legMsRaw.map(num);
  if (legMs.some((ms) => ms === undefined || ms < 0)) return undefined;
  return { legs, legMs: legMs as number[], transitMs: marchMs };
};

/**
 * Records an INSURGENT_MARCH message. Its resolvesAt/transitEndsAt arrive
 * already aligned to the local clock (client-server-clock.ts, via serverNow).
 */
export const recordInsurgentMarch = (msg: Record<string, unknown>, nowMs: number = Date.now()): InsurgentMarch | undefined => {
  const campX = num(msg.campX);
  const campY = num(msg.campY);
  const fromX = num(msg.fromX);
  const fromY = num(msg.fromY);
  const toX = num(msg.toX);
  const toY = num(msg.toY);
  const transitEndsAt = num(msg.transitEndsAt);
  const resolvesAt = num(msg.resolvesAt);
  const marchMs = num(msg.marchMs);
  const id = typeof msg.commandId === "string" ? msg.commandId : undefined;
  if (campX === undefined || campY === undefined || fromX === undefined || fromY === undefined || toX === undefined || toY === undefined) return undefined;
  if (transitEndsAt === undefined || resolvesAt === undefined || marchMs === undefined || !id || transitEndsAt <= nowMs) return undefined;
  pruneInsurgentMarches(nowMs);
  if (marches.size >= MAX_MARCHES && !marches.has(id)) return undefined;
  // A message without a usable route (never sent by the current server) walks the straight line.
  const route = parseRoute(msg.legs, msg.legMs, marchMs) ?? {
    legs: [{ kind: "WALK", points: straightTransitWalk({ x: campX, y: campY }, { x: fromX, y: fromY }) }],
    legMs: [marchMs],
    transitMs: marchMs
  };
  const march: InsurgentMarch = {
    id,
    actionType: msg.actionType === "EXPAND" ? "EXPAND" : "ATTACK",
    campX, campY, fromX, fromY, toX, toY, route,
    startAt: transitEndsAt - Math.max(0, marchMs),
    transitEndsAt,
    resolvesAt
  };
  marches.set(id, march);
  return march;
};

const pruneInsurgentMarches = (nowMs: number): void => {
  for (const [id, march] of marches) if (march.transitEndsAt <= nowMs) marches.delete(id);
};

/** Marches still walking at `nowMs`; arrived ones are dropped. */
export const activeInsurgentMarches = (nowMs: number = Date.now()): InsurgentMarch[] => {
  pruneInsurgentMarches(nowMs);
  return [...marches.values()];
};

/**
 * True while an insurgent company is still walking out of its camp to attack
 * (x, y). The defender's skirmish and the patrol step-aside wait for it to
 * arrive, so the attackers aren't drawn both on the road and already at the front.
 */
export const insurgentMarchToTileUnderWay = (x: number, y: number, nowMs: number = Date.now()): boolean => {
  for (const march of marches.values()) {
    if (march.toX === x && march.toY === y && march.startAt <= nowMs && nowMs < march.transitEndsAt) return true;
  }
  return false;
};

/** New season / world: no march carries over. */
export const clearInsurgentMarches = (): void => {
  marches.clear();
};

// Shortest signed step from a to b on a wrapping axis.
const wrapDelta = (from: number, to: number, size: number): number => {
  let delta = (to - from) % size;
  if (delta > size / 2) delta -= size;
  if (delta < -size / 2) delta += size;
  return delta;
};

export type InsurgentMarchPose =
  | {
      kind: "WALK";
      /** Fractional tile coordinates, unwrapped from the leg's first point, so a walk over the world seam stays continuous. */
      x: number;
      y: number;
      /** Unit direction of travel along the current step. */
      dirX: number;
      dirY: number;
      facingLeft: boolean;
      /** 0..1 through the whole march. */
      progress: number;
    }
  | { kind: "SAIL"; from: TransitPoint; to: TransitPoint; progress: number };

/**
 * Where the company is at `nowMs`, along the server's route: on a walk leg,
 * a point between two of its tiles; on a crossing, aboard the transport (the
 * 3D map draws the boat; the 2D map draws nothing until it lands). Undefined
 * before it sets out or once it arrives.
 */
export const insurgentMarchPose = (march: InsurgentMarch, nowMs: number): InsurgentMarchPose | undefined => {
  if (nowMs < march.startAt || nowMs >= march.transitEndsAt) return undefined;
  const span = march.transitEndsAt - march.startAt;
  const progress = span > 0 ? (nowMs - march.startAt) / span : 1;
  const leg = activeTransitLeg(march.route, march.startAt, march.transitEndsAt, nowMs);
  if (!leg) return undefined;
  if (leg.kind === "SAIL") return { kind: "SAIL", from: leg.from, to: leg.to, progress };
  const points = leg.points;
  const first = points[0]!;
  if (points.length < 2) return { kind: "WALK", x: first.x, y: first.y, dirX: 0, dirY: 0, facingLeft: false, progress };
  const legSpan = leg.endAt - leg.startAt;
  const along = Math.min(1, Math.max(0, legSpan > 0 ? (nowMs - leg.startAt) / legSpan : 1)) * (points.length - 1);
  const step = Math.min(points.length - 2, Math.floor(along));
  // Unwrap up to the current step so x/y stay continuous across the seam.
  let x = first.x;
  let y = first.y;
  for (let i = 1; i <= step; i += 1) {
    x += wrapDelta(points[i - 1]!.x, points[i]!.x, WORLD_WIDTH);
    y += wrapDelta(points[i - 1]!.y, points[i]!.y, WORLD_HEIGHT);
  }
  const dx = wrapDelta(points[step]!.x, points[step + 1]!.x, WORLD_WIDTH);
  const dy = wrapDelta(points[step]!.y, points[step + 1]!.y, WORLD_HEIGHT);
  const t = along - step;
  const length = Math.hypot(dx, dy) || 1;
  return { kind: "WALK", x: x + dx * t, y: y + dy * t, dirX: dx / length, dirY: dy / length, facingLeft: dx < 0, progress };
};
